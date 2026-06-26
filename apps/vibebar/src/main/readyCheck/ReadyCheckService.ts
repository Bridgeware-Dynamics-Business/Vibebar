import { clipboard } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { buildContext } from '@vibebar/prompt-engine'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { ReadyCheckResult, IntentContract, UntrackedFileInspection } from '@shared/types.js'
import type { AuditService } from '../audit/AuditService.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import { readGitDiff, readUntrackedPaths } from '../git/gitDiff.js'
import { readGitStatus } from '../git/gitStatus.js'
import type { ProjectService } from '../project/ProjectService.js'
import { scanText } from '../scanner/secretScanner.js'
import type { TerminalController } from '../terminal/TerminalController.js'
import type { SessionService } from '../session/SessionService.js'
import type { AppStore } from '../settings/store.js'
import { formatIntentSection } from '../session/intentContract.js'
import { refreshLastGreenDelta } from '../session/flightRecorderLogic.js'
import { buildVerificationRecipe } from '../verify/verificationRecipes.js'
import { buildContextHealthWarnings } from '@shared/contextHealth.js'
import {
  AUDIT_RECENT_MS,
  buildReadyCheckBrief,
  buildSignals,
  computeReadyCheckStatus,
  computeV2Flags,
  countDiffLines,
  formatReadyCheckBriefSection,
  formatUntrackedSummaryPrompt,
  isJsTsSourcePath,
  isTestFixturePath,
  UNTRACKED_INSPECT_MAX_BYTES,
  UNTRACKED_INSPECT_MAX_FILES,
  type ReadyCheckFlags,
  type ReadyCheckStatus
} from './readyCheckLogic.js'
import {
  buildDependencyChangeSummary,
  formatDependencyReviewPrompt
} from './dependencyChange.js'
import {
  buildRegressionContext,
  formatRegressionContextPrompt
} from './regressionContext.js'

function isStackUnknown(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return profile.framework === 'unknown' && profile.language === 'unknown'
}

function isSubfolderNotRoot(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return !profile.hasRootManifest
}

const UNTRACKED_SCAN_MAX_BYTES = UNTRACKED_INSPECT_MAX_BYTES
const UNTRACKED_SCAN_MAX_FILES = UNTRACKED_INSPECT_MAX_FILES

async function inspectUntrackedFiles(
  root: string,
  untracked: string[]
): Promise<{
  inspections: UntrackedFileInspection[]
  blockingSecretPaths: string[]
  reviewSecretPaths: string[]
}> {
  const inspections: UntrackedFileInspection[] = []
  const blockingSecretPaths: string[] = []
  const reviewSecretPaths: string[] = []

  for (const rel of untracked.slice(0, UNTRACKED_SCAN_MAX_FILES)) {
    const abs = join(root, rel)
    try {
      const st = await stat(abs)
      if (!st.isFile()) continue
      const skipped = st.size > UNTRACKED_SCAN_MAX_BYTES
      let secretCount = 0
      if (!skipped) {
        const content = await readFile(abs, 'utf8')
        const scan = scanText(content)
        secretCount = scan.findings.length
        if (secretCount > 0) {
          if (isTestFixturePath(rel)) {
            reviewSecretPaths.push(rel)
          } else {
            blockingSecretPaths.push(rel)
          }
        }
      }
      inspections.push({
        path: rel,
        sizeBytes: st.size,
        skipped,
        secretCount
      })
    } catch {
      continue
    }
  }

  return { inspections, blockingSecretPaths, reviewSecretPaths }
}

function buildReviewPrompt(
  status: ReadyCheckStatus,
  label: string,
  branch: string | null,
  signals: ReturnType<typeof buildSignals>,
  intent: IntentContract | null,
  brief: ReturnType<typeof buildReadyCheckBrief>
): string {
  const statusLine =
    status === 'blocked'
      ? '**Blocked** — do not commit until these are resolved.'
      : status === 'needs-review'
        ? '**Needs review** — address or consciously accept the items below before commit.'
        : '**Looks ready** — no blockers detected; still run your usual verify steps.'

  const lines: string[] = [
    ...formatIntentSection(intent),
    `## Ready Check: ${label}${branch ? ` (${branch})` : ''}`,
    '',
    statusLine,
    '',
    brief.summaryLine,
    '',
    ...formatReadyCheckBriefSection(brief),
    'Review my working tree changes before I commit. For each signal below, explain impact, risks, and what I should verify.',
    '',
    '### Signals',
    ''
  ]

  for (const signal of signals) {
    const icon = signal.level === 'blocked' ? '⛔' : signal.level === 'warning' ? '⚠️' : '✓'
    lines.push(`- ${icon} **${signal.label}** — ${signal.detail}`)
  }

  lines.push(
    '',
    '### Ask',
    '',
    '1. Summarize the overall risk posture.',
    '2. Call out anything I should fix before commit.',
    '3. Suggest verify commands (tests, lint, audit) appropriate for this stack.',
    '4. Flag security or integration concerns I might miss.',
    ''
  )

  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Read-only aggregation of git, audit, terminal, secret-scan, and project signals into a
 * tri-state Ready Check result. MVP: no auto-commit, no mutation — copy prompts only.
 */
export class ReadyCheckService {
  constructor(
    private readonly projects: ProjectService,
    private readonly audit: AuditService,
    private readonly terminal: TerminalController,
    private readonly gitDiff: GitDiffService,
    private readonly session: SessionService,
    private readonly store: AppStore
  ) {}

  async evaluate(): Promise<ReadyCheckResult> {
    const profile = this.projects.getProfile()
    if (!profile?.rootPath) {
      return { status: 'needs-review', signals: [], noProject: true }
    }

    const flags = await this.collectFlags(profile)
    const status = computeReadyCheckStatus(flags)
    const signals = buildSignals(flags)
    const brief = buildReadyCheckBrief(status, signals)
    const gitStatus = await readGitStatus(profile.rootPath)
    const ctx = buildContext(profile)
    const label =
      profile.folderName || `my ${String(ctx.framework)} project (${String(ctx.language)})`
    const intent = await this.session.getIntent()
    const reviewPrompt = buildReviewPrompt(status, label, gitStatus.branch, signals, intent, brief)
    const contextWarnings = await this.collectContextWarnings(profile)
    const verifyRecipe = buildVerificationRecipe(profile)

    const [untrackedPaths] = await Promise.all([readUntrackedPaths(profile.rootPath)])
    const { inspections: untrackedFiles } = await inspectUntrackedFiles(
      profile.rootPath,
      untrackedPaths
    )
    const dependencyChange = await buildDependencyChangeSummary(
      profile.rootPath,
      flags.packageJsonChanged,
      flags.lockfileChangedWithoutNpmAudit
    )

    return {
      status,
      signals,
      reviewPrompt,
      brief,
      contextWarningCount: contextWarnings.length,
      verifyRecipe: verifyRecipe ?? undefined,
      untrackedFiles: untrackedFiles.length > 0 ? untrackedFiles : undefined,
      dependencyChange: dependencyChange ?? undefined
    }
  }

  private async collectContextWarnings(
    profile: NonNullable<ReturnType<ProjectService['getProfile']>>
  ) {
    const aiDocs = await this.projects.getAiDocs()
    return buildContextHealthWarnings({
      profile,
      agentsMd: aiDocs.noProject ? undefined : aiDocs.agentsMd
    })
  }

  async copyReviewPrompt(): Promise<{ copied: boolean; text: string }> {
    const result = await this.evaluate()
    const text = result.reviewPrompt ?? ''
    if (!text) return { copied: false, text: '' }
    let copied = false
    try {
      clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
    return { copied, text }
  }

  async copyUntrackedSummary(): Promise<{ copied: boolean; text: string }> {
    const result = await this.evaluate()
    const files = result.untrackedFiles ?? []
    if (files.length === 0) return { copied: false, text: '' }
    const text = formatUntrackedSummaryPrompt(files)
    let copied = false
    try {
      clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
    return { copied, text }
  }

  async copyDependencyReview(): Promise<{ copied: boolean; text: string }> {
    const result = await this.evaluate()
    if (!result.dependencyChange) return { copied: false, text: '' }
    const text = formatDependencyReviewPrompt(result.dependencyChange)
    let copied = false
    try {
      clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
    return { copied, text }
  }

  async copyRegressionContext(): Promise<{ copied: boolean; text: string }> {
    const profile = this.projects.getProfile()
    if (!profile?.rootPath) return { copied: false, text: '' }

    const ext = await this.session.readExtended()
    const packed = await buildRegressionContext(
      {
        rootPath: profile.rootPath,
        profile,
        filesChangedSince: ext.flight?.lastGreen?.filesChangedSince ?? [],
        changedFiles: () => this.gitDiff.changedFiles(),
        ignoreText: this.store.getCodeSyncConfig().ignoreText,
        lastFailedResult: this.terminal.getLastFailedResult()
      },
      undefined
    )

    if ('empty' in packed) {
      return { copied: false, text: packed.message }
    }

    const text = formatRegressionContextPrompt(packed.text)
    let copied = false
    try {
      clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
    return { copied, text }
  }

  private async collectFlags(profile: ProjectProfile): Promise<ReadyCheckFlags> {
    const root = profile.rootPath
    const [gitStatus, diffParts, changedPaths, untracked] = await Promise.all([
      readGitStatus(root),
      readGitDiff(root),
      this.gitDiff.changedFiles(),
      readUntrackedPaths(root)
    ])

    const diffText = [diffParts.staged, diffParts.unstaged].filter(Boolean).join('\n')
    const diffSecretScan = diffText ? scanText(diffText) : { findings: [] }
    const { blockingSecretPaths, reviewSecretPaths } = await inspectUntrackedFiles(
      root,
      untracked
    )
    const untrackedSecrets = blockingSecretPaths.length > 0
    const hasStagedOrUnstaged = diffParts.hasChanges
    const untrackedOnly = !hasStagedOrUnstaged && untracked.length > 0

    const cachedAudit = this.audit.getCachedReport()
    const auditAge = cachedAudit ? Date.now() - cachedAudit.ranAt : Infinity
    const openFindings = cachedAudit?.findings ?? []

    const termState = this.terminal.getState()
    const termHints = this.terminal.getHints()
    const exitCode = termState.status.exitCode

    const sessionFile = await this.session.readExtended()
    let flight = sessionFile.flight ?? null
    if (flight?.lastGreen) {
      const refreshed = refreshLastGreenDelta(flight.lastGreen, changedPaths)
      if (refreshed) {
        const prev = flight.lastGreen.filesChangedSince
        flight = { ...flight, lastGreen: refreshed }
        const changed =
          prev.length !== refreshed.filesChangedSince.length ||
          prev.some((p, i) => p !== refreshed.filesChangedSince[i])
        if (changed) {
          await this.session.writeFlight(flight)
        }
      }
    }

    const v2 = computeV2Flags({
      changedPaths,
      sessionEntries: sessionFile.entries,
      flight,
      currentAuditScore: cachedAudit?.score?.value,
      currentAuditFindingCount: openFindings.length
    })

    return {
      criticalAudit: openFindings.some((f) => f.severity === 'critical'),
      highAudit: openFindings.some((f) => f.severity === 'high'),
      auditTruncated: cachedAudit?.truncated ?? false,
      auditRecent: cachedAudit != null && auditAge < AUDIT_RECENT_MS,
      secretsInDiff: diffSecretScan.findings.length > 0,
      untrackedSecrets,
      untrackedSecretPaths:
        blockingSecretPaths.length > 0 ? blockingSecretPaths : undefined,
      untrackedTestSecretPaths:
        reviewSecretPaths.length > 0 ? reviewSecretPaths : undefined,
      terminalFailed: !termState.status.running && exitCode != null && exitCode !== 0,
      terminalUnresolvedIssues: termHints.issueCount > 0,
      largeDiff: countDiffLines(diffParts.staged, diffParts.unstaged) > 500,
      untrackedOnly: untrackedOnly && gitStatus.changeCount > 0,
      packageJsonChanged: changedPaths.some(
        (p) => p === 'package.json' || p.endsWith('/package.json')
      ),
      stackUnknown: isStackUnknown(profile),
      subfolderNotRoot: isSubfolderNotRoot(profile),
      jsTsSourcesChanged: changedPaths.some(isJsTsSourcePath),
      ...v2
    }
  }
}
