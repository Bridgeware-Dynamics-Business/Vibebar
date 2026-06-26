import { clipboard } from 'electron'
import { buildContext } from '@vibebar/prompt-engine'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { ReadyCheckResult, IntentContract } from '@shared/types.js'
import type { AuditService } from '../audit/AuditService.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import { readGitDiff, readUntrackedPaths } from '../git/gitDiff.js'
import { readGitStatus } from '../git/gitStatus.js'
import type { ProjectService } from '../project/ProjectService.js'
import { scanText } from '../scanner/secretScanner.js'
import type { TerminalController } from '../terminal/TerminalController.js'
import type { SessionService } from '../session/SessionService.js'
import { formatIntentSection } from '../session/intentContract.js'
import { buildContextHealthWarnings } from '@shared/contextHealth.js'
import {
  AUDIT_RECENT_MS,
  buildSignals,
  computeReadyCheckStatus,
  computeV2Flags,
  countDiffLines,
  isJsTsSourcePath,
  type ReadyCheckFlags,
  type ReadyCheckStatus
} from './readyCheckLogic.js'

function isStackUnknown(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return profile.framework === 'unknown' && profile.language === 'unknown'
}

function isSubfolderNotRoot(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return !profile.hasRootManifest
}

function buildReviewPrompt(
  status: ReadyCheckStatus,
  label: string,
  branch: string | null,
  signals: ReturnType<typeof buildSignals>,
  intent: IntentContract | null
): string {
  const statusLine =
    status === 'blocked'
      ? '**Blocked** — do not commit until these are resolved.'
      : status === 'needs-review'
        ? '**Needs review** — address or consciously accept the items below before commit.'
        : '**Looks ready** — no blockers detected; still run your usual verify steps.'

  const lines: string[] = [...formatIntentSection(intent), `## Ready Check: ${label}${branch ? ` (${branch})` : ''}`, '', statusLine, '', 'Review my working tree changes before I commit. For each signal below, explain impact, risks, and what I should verify.', '', '### Signals', '']

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
    private readonly session: SessionService
  ) {}

  async evaluate(): Promise<ReadyCheckResult> {
    const profile = this.projects.getProfile()
    if (!profile?.rootPath) {
      return { status: 'needs-review', signals: [], noProject: true }
    }

    const flags = await this.collectFlags(profile)
    const status = computeReadyCheckStatus(flags)
    const signals = buildSignals(flags)
    const gitStatus = await readGitStatus(profile.rootPath)
    const ctx = buildContext(profile)
    const label =
      profile.folderName || `my ${String(ctx.framework)} project (${String(ctx.language)})`
    const intent = await this.session.getIntent()
    const reviewPrompt = buildReviewPrompt(status, label, gitStatus.branch, signals, intent)
    const contextWarnings = await this.collectContextWarnings(profile)

    return {
      status,
      signals,
      reviewPrompt,
      contextWarningCount: contextWarnings.length
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

  private async collectFlags(profile: ProjectProfile): Promise<ReadyCheckFlags> {
    const root = profile.rootPath
    const [gitStatus, diffParts, changedPaths, untracked] = await Promise.all([
      readGitStatus(root),
      readGitDiff(root),
      this.gitDiff.changedFiles(),
      readUntrackedPaths(root)
    ])

    const diffText = [diffParts.staged, diffParts.unstaged].filter(Boolean).join('\n')
    const secretScan = diffText ? scanText(diffText) : { findings: [] }
    const hasStagedOrUnstaged = diffParts.hasChanges
    const untrackedOnly = !hasStagedOrUnstaged && untracked.length > 0

    const cachedAudit = this.audit.getCachedReport()
    const auditAge = cachedAudit ? Date.now() - cachedAudit.ranAt : Infinity
    const openFindings = cachedAudit?.findings ?? []

    const termState = this.terminal.getState()
    const termHints = this.terminal.getHints()
    const exitCode = termState.status.exitCode

    const sessionFile = await this.session.readExtended()
    const v2 = computeV2Flags({
      changedPaths,
      sessionEntries: sessionFile.entries,
      flight: sessionFile.flight ?? null,
      currentAuditScore: cachedAudit?.score?.value,
      currentAuditFindingCount: openFindings.length
    })

    return {
      criticalAudit: openFindings.some((f) => f.severity === 'critical'),
      highAudit: openFindings.some((f) => f.severity === 'high'),
      auditTruncated: cachedAudit?.truncated ?? false,
      auditRecent: cachedAudit != null && auditAge < AUDIT_RECENT_MS,
      secretsInDiff: secretScan.findings.length > 0,
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
