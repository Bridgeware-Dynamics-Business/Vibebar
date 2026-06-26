import type { AuditReport } from '@shared/types.js'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { ReadyCheckResult, SessionEntry } from '@shared/types.js'
import type { GitStatus } from '@shared/types.js'

export interface SessionPinsResourceInput {
  projectName: string | null
  pinned: SessionEntry[]
  handoffExcerpt: string
}

export interface AuditSummaryResourceInput {
  report: AuditReport | null
}

export interface GitStatusResourceInput {
  status: GitStatus
  changedPaths: string[]
}

/** Builds JSON payload for vibebar://session/pins */
export function buildSessionPinsResource(input: SessionPinsResourceInput): Record<string, unknown> {
  const pins = input.pinned.map((entry) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    timestamp: entry.timestamp,
    pinned: entry.pinned,
    verifyCommand: entry.verifyCommand ?? null,
    verifyStatus: entry.verifyStatus ?? null
  }))

  return {
    project: input.projectName,
    pinnedCount: pins.length,
    pins,
    handoffExcerpt: input.handoffExcerpt
  }
}

/** Builds JSON payload for vibebar://project/profile */
export function buildProjectProfileResource(profile: ProjectProfile | null): Record<string, unknown> {
  if (!profile) {
    return { noProject: true }
  }
  return {
    rootPath: profile.rootPath,
    folderName: profile.folderName,
    language: profile.language,
    framework: profile.framework,
    packageManager: profile.packageManager,
    hasRootManifest: profile.hasRootManifest,
    hasAiContextFolder: profile.hasAiContextFolder,
    scripts: profile.scripts ?? []
  }
}

/** Builds JSON payload for vibebar://audit/summary */
export function buildAuditSummaryResource(input: AuditSummaryResourceInput): Record<string, unknown> {
  const report = input.report
  if (!report) {
    return {
      scanned: false,
      score: null,
      grade: null,
      criticalCount: 0,
      highCount: 0,
      truncated: false,
      openFindings: 0,
      ranAt: null
    }
  }

  const criticalCount = report.findings.filter((f) => f.severity === 'critical').length
  const highCount = report.findings.filter((f) => f.severity === 'high').length

  return {
    scanned: !report.noProject,
    projectName: report.projectName,
    score: report.score?.value ?? null,
    grade: report.score?.grade ?? null,
    criticalCount,
    highCount,
    truncated: report.truncated,
    openFindings: report.findings.length,
    ranAt: report.ranAt,
    scannedFiles: report.scannedFiles,
    totalCandidates: report.totalCandidates
  }
}

/** Builds JSON payload for vibebar://git/status */
export function buildGitStatusResource(input: GitStatusResourceInput): Record<string, unknown> {
  const { status, changedPaths } = input
  return {
    isRepo: status.isRepo,
    branch: status.branch,
    changeCount: status.changeCount,
    ahead: status.ahead,
    behind: status.behind,
    changedPaths
  }
}

/** Builds JSON payload for vibebar://ready-check/summary */
export function buildReadyCheckSummaryResource(result: ReadyCheckResult): Record<string, unknown> {
  return {
    status: result.status,
    noProject: result.noProject ?? false,
    contextWarningCount: result.contextWarningCount ?? 0,
    signals: result.signals.map((s) => ({
      id: s.id,
      label: s.label,
      level: s.level,
      detail: s.detail
    }))
  }
}
