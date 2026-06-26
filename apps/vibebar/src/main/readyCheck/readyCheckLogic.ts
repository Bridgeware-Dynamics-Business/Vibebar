/** Wall-clock age under which a cached audit counts as "recent" for looks-ready. */
export const AUDIT_RECENT_MS = 30 * 60 * 1000

export const LARGE_DIFF_LINE_THRESHOLD = 500

export const LOCKFILE_NAMES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb'
] as const

export type ReadyCheckStatus = 'blocked' | 'needs-review' | 'looks-ready'

export type ReadyCheckSignalLevel = 'ok' | 'warning' | 'blocked'

export type ReadyCheckSignalId =
  | 'git-diff'
  | 'audit'
  | 'terminal'
  | 'secrets'
  | 'project'
  | 'tests-not-run'
  | 'diff-not-reviewed'
  | 'lockfile-audit'
  | 'audit-delta'
  | 'last-green-stale'

export interface ReadyCheckSignal {
  id: ReadyCheckSignalId
  label: string
  level: ReadyCheckSignalLevel
  detail: string
}

/** Normalized boolean flags aggregated from git, audit, terminal, project, session, and flight signals. */
export interface ReadyCheckFlags {
  criticalAudit: boolean
  highAudit: boolean
  auditTruncated: boolean
  auditRecent: boolean
  secretsInDiff: boolean
  terminalFailed: boolean
  terminalUnresolvedIssues: boolean
  largeDiff: boolean
  untrackedOnly: boolean
  packageJsonChanged: boolean
  stackUnknown: boolean
  subfolderNotRoot: boolean
  jsTsSourcesChanged: boolean
  /** v2 — no passing verify/test command since working tree changed. */
  testsNotRunSinceChange: boolean
  /** v2 — git diff prompt not copied this session since last file change. */
  diffNotReviewed: boolean
  /** v2 — lockfile changed but npm audit / security audit not run since. */
  lockfileChangedWithoutNpmAudit: boolean
  /** v2 — audit posture regressed vs first audit this session. */
  auditDeltaRegressed: boolean
  /** v2 — files changed since last green verify command. */
  lastGreenStale: boolean
}

export interface ReadyCheckSessionEntry {
  type: string
  timestamp: number
}

export interface ReadyCheckFlightCommand {
  command: string
  exitCode: number | null
  timestamp: number
  isTest?: boolean
}

export interface ReadyCheckFlightAudit {
  ranAt: number
  score?: number
  findingCount: number
}

export interface ReadyCheckFlightSnapshot {
  timestamp: number
}

export interface ReadyCheckLastGreen {
  command: string
  timestamp: number
  filesChangedSince: string[]
}

export interface ReadyCheckFlightInput {
  commands: ReadyCheckFlightCommand[]
  audits: ReadyCheckFlightAudit[]
  snapshots: ReadyCheckFlightSnapshot[]
  lastGreen: ReadyCheckLastGreen | null
}

export interface ReadyCheckV2Input {
  changedPaths: string[]
  sessionEntries: ReadyCheckSessionEntry[]
  flight: ReadyCheckFlightInput | null | undefined
  currentAuditScore?: number
  currentAuditFindingCount?: number
}

const JS_TS_SOURCE_RE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/i

export function isJsTsSourcePath(path: string): boolean {
  return JS_TS_SOURCE_RE.test(path)
}

export function isLockfilePath(path: string): boolean {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path
  return (LOCKFILE_NAMES as readonly string[]).includes(base)
}

export function filterLockfilePaths(paths: string[]): string[] {
  return paths.filter(isLockfilePath)
}

export function countDiffLines(staged: string, unstaged: string): number {
  const combined = [staged, unstaged].filter(Boolean).join('\n')
  if (!combined) return 0
  return combined.split(/\r?\n/).length
}

export function latestSnapshotTimestamp(
  flight: ReadyCheckFlightInput | null | undefined
): number | null {
  if (!flight?.snapshots.length) return null
  return Math.max(...flight.snapshots.map((s) => s.timestamp))
}

/** Best-effort timestamp of the most recent working-tree change for session signals. */
export function inferLastFileChangeTimestamp(
  flight: ReadyCheckFlightInput | null | undefined,
  changedPaths: string[]
): number | null {
  if (changedPaths.length === 0) return null
  const snap = latestSnapshotTimestamp(flight)
  if (snap != null) return snap
  if (flight?.commands.length) {
    return flight.commands[flight.commands.length - 1]!.timestamp
  }
  return null
}

export function hasGitDiffReviewedSince(
  entries: ReadyCheckSessionEntry[],
  since: number
): boolean {
  return entries.some((e) => e.type === 'git-diff' && e.timestamp >= since)
}

export function npmAuditRanSince(
  flight: ReadyCheckFlightInput | null | undefined,
  since: number
): boolean {
  if (!flight) return false
  const cmd = flight.commands.some(
    (c) => c.timestamp >= since && /\bnpm\s+audit\b/i.test(c.command)
  )
  const auditRun = flight.audits.some((a) => a.ranAt >= since)
  return cmd || auditRun
}

export function testsPassedSince(
  flight: ReadyCheckFlightInput | null | undefined,
  since: number
): boolean {
  if (!flight) return false
  return flight.commands.some(
    (c) => c.timestamp >= since && c.exitCode === 0 && c.isTest
  )
}

/** Derives Ready Check v2 flags from flight recorder + session timeline data. */
export function computeV2Flags(input: ReadyCheckV2Input): Pick<
  ReadyCheckFlags,
  | 'testsNotRunSinceChange'
  | 'diffNotReviewed'
  | 'lockfileChangedWithoutNpmAudit'
  | 'auditDeltaRegressed'
  | 'lastGreenStale'
> {
  const {
    changedPaths,
    sessionEntries,
    flight,
    currentAuditScore,
    currentAuditFindingCount
  } = input

  const hasChanges = changedPaths.length > 0
  const lastGreen = flight?.lastGreen ?? null
  const lastChangeSince = inferLastFileChangeTimestamp(flight, changedPaths)

  const lastGreenStale = Boolean(lastGreen && lastGreen.filesChangedSince.length > 0)

  let testsNotRunSinceChange = false
  if (hasChanges) {
    if (lastGreenStale) {
      testsNotRunSinceChange = true
    } else if (!lastGreen) {
      const since = lastChangeSince ?? 0
      testsNotRunSinceChange = !testsPassedSince(flight, since)
    }
  }

  let diffNotReviewed = false
  if (hasChanges && lastChangeSince != null) {
    diffNotReviewed = !hasGitDiffReviewedSince(sessionEntries, lastChangeSince)
  }

  const lockfilesChanged = filterLockfilePaths(changedPaths)
  let lockfileChangedWithoutNpmAudit = false
  if (lockfilesChanged.length > 0 && lastChangeSince != null) {
    lockfileChangedWithoutNpmAudit = !npmAuditRanSince(flight, lastChangeSince)
  }

  let auditDeltaRegressed = false
  const firstAudit = flight?.audits[0]
  if (firstAudit && currentAuditFindingCount != null) {
    if (currentAuditFindingCount > firstAudit.findingCount) {
      auditDeltaRegressed = true
    } else if (
      currentAuditScore != null &&
      firstAudit.score != null &&
      currentAuditScore < firstAudit.score
    ) {
      auditDeltaRegressed = true
    }
  }

  return {
    testsNotRunSinceChange,
    diffNotReviewed,
    lockfileChangedWithoutNpmAudit,
    auditDeltaRegressed,
    lastGreenStale
  }
}

/**
 * Tri-state rules for Ready Check v1 + v2:
 * - blocked: critical audit OR secrets in diff OR terminal last run failed
 * - needs-review: v1 review signals OR v2 session/deps/verify signals
 * - looks-ready: none of the above AND (audit ran recently OR no JS/TS sources changed)
 */
export function computeReadyCheckStatus(flags: ReadyCheckFlags): ReadyCheckStatus {
  if (flags.criticalAudit || flags.secretsInDiff || flags.terminalFailed) {
    return 'blocked'
  }

  const needsReview =
    flags.highAudit ||
    flags.auditTruncated ||
    flags.largeDiff ||
    flags.stackUnknown ||
    flags.packageJsonChanged ||
    flags.untrackedOnly ||
    flags.terminalUnresolvedIssues ||
    flags.subfolderNotRoot ||
    (flags.jsTsSourcesChanged && !flags.auditRecent) ||
    flags.testsNotRunSinceChange ||
    flags.diffNotReviewed ||
    flags.lockfileChangedWithoutNpmAudit ||
    flags.auditDeltaRegressed ||
    flags.lastGreenStale

  if (needsReview) return 'needs-review'

  if (flags.auditRecent || !flags.jsTsSourcesChanged) return 'looks-ready'

  return 'needs-review'
}

export function buildSignals(flags: ReadyCheckFlags): ReadyCheckSignal[] {
  const signals: ReadyCheckSignal[] = []

  // Secrets (blocked, shown first)
  if (flags.secretsInDiff) {
    signals.push({
      id: 'secrets',
      label: 'Secrets in diff',
      level: 'blocked',
      detail: 'Possible credentials detected in staged or unstaged diff hunks.'
    })
  }

  // Git diff
  if (flags.largeDiff) {
    signals.push({
      id: 'git-diff',
      label: 'Large diff',
      level: 'warning',
      detail: `Diff exceeds ${LARGE_DIFF_LINE_THRESHOLD} lines — review carefully before commit.`
    })
  } else if (flags.untrackedOnly) {
    signals.push({
      id: 'git-diff',
      label: 'Untracked-only changes',
      level: 'warning',
      detail: 'Changes exist but only as untracked files; git diff cannot show full contents.'
    })
  } else if (flags.packageJsonChanged) {
    signals.push({
      id: 'git-diff',
      label: 'package.json changed',
      level: 'warning',
      detail: 'Dependency manifest changed — verify lockfile and supply chain impact.'
    })
  } else {
    signals.push({
      id: 'git-diff',
      label: 'Git diff',
      level: 'ok',
      detail: 'No large diff or manifest-only concerns detected.'
    })
  }

  // v2 — verify / session signals
  if (flags.lastGreenStale) {
    signals.push({
      id: 'last-green-stale',
      label: 'Last green stale',
      level: 'warning',
      detail:
        'Files changed since your last passing verify command — re-run tests before commit.'
    })
  }

  if (flags.testsNotRunSinceChange && !flags.lastGreenStale) {
    signals.push({
      id: 'tests-not-run',
      label: 'Tests not run since change',
      level: 'warning',
      detail:
        'Working tree has changes but no passing test/verify command recorded since they landed.'
    })
  } else if (flags.testsNotRunSinceChange) {
    signals.push({
      id: 'tests-not-run',
      label: 'Tests not run since change',
      level: 'warning',
      detail: 'Re-run your verify command — the tree changed after the last green run.'
    })
  }

  if (flags.diffNotReviewed) {
    signals.push({
      id: 'diff-not-reviewed',
      label: 'Diff not reviewed this session',
      level: 'warning',
      detail:
        'Copy git diff or review changes in Session Hub — no git-diff entry since the last file change.'
    })
  }

  if (flags.lockfileChangedWithoutNpmAudit) {
    signals.push({
      id: 'lockfile-audit',
      label: 'Lockfile changed — npm audit pending',
      level: 'warning',
      detail:
        'A lockfile changed in git — run Security Audit or `npm audit` before shipping dependency updates.'
    })
  }

  if (flags.auditDeltaRegressed) {
    signals.push({
      id: 'audit-delta',
      label: 'Audit delta since session start',
      level: 'warning',
      detail:
        'Security posture regressed vs the first audit this session (score dropped or finding count increased).'
    })
  }

  // Audit
  if (flags.criticalAudit) {
    signals.push({
      id: 'audit',
      label: 'Security audit',
      level: 'blocked',
      detail: 'Open critical finding(s) in the latest audit report.'
    })
  } else if (flags.highAudit || flags.auditTruncated) {
    signals.push({
      id: 'audit',
      label: 'Security audit',
      level: 'warning',
      detail: flags.auditTruncated
        ? 'High-severity finding(s) or scan was truncated — coverage may be partial.'
        : 'Open high-severity finding(s) in the latest audit report.'
    })
  } else if (flags.auditRecent) {
    signals.push({
      id: 'audit',
      label: 'Security audit',
      level: 'ok',
      detail: 'Audit ran recently with no critical or high open findings.'
    })
  } else {
    signals.push({
      id: 'audit',
      label: 'Security audit',
      level: 'warning',
      detail: 'No recent audit on record — run Security Audit before shipping.'
    })
  }

  // Terminal
  if (flags.terminalFailed) {
    signals.push({
      id: 'terminal',
      label: 'Smart Terminal',
      level: 'blocked',
      detail: 'Last command exited with a non-zero status.'
    })
  } else if (flags.terminalUnresolvedIssues) {
    signals.push({
      id: 'terminal',
      label: 'Smart Terminal',
      level: 'warning',
      detail: 'Unresolved issues remain in the terminal dock.'
    })
  } else {
    signals.push({
      id: 'terminal',
      label: 'Smart Terminal',
      level: 'ok',
      detail: 'Last command succeeded and no open dock issues.'
    })
  }

  // Project context
  if (flags.stackUnknown || flags.subfolderNotRoot) {
    signals.push({
      id: 'project',
      label: 'Project context',
      level: 'warning',
      detail: flags.subfolderNotRoot
        ? 'Selected folder lacks a project manifest — pick the repo root for best detection.'
        : 'Stack detection returned unknown — prompts and presets may be generic.'
    })
  } else {
    signals.push({
      id: 'project',
      label: 'Project context',
      level: 'ok',
      detail: 'Project stack detected at the selected root.'
    })
  }

  return signals
}
