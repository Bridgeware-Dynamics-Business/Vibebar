import type { AuditFinding } from '@shared/types.js'
import type { FileFindingsCache } from './cache.js'
import {
  type AuditContext,
  type AuditRuleInput,
  type ScanFile,
  isAuditEngineFile,
  isTestOrExampleFile
} from './engine/context.js'
import { isExcludedFromFileRules } from './engine/scanScope.js'
import { type RunResult, runRules } from './engine/runner.js'
import { ALL_RULES } from './rules/registry.js'

export type { AuditContext, AuditRuleInput, ScanFile }

const SEVERITY_RANK: Record<AuditFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

const CONFIDENCE_RANK: Record<AuditFinding['confidence'], number> = {
  high: 0,
  medium: 1,
  low: 2
}

/**
 * Inline suppression: a file-anchored finding is dropped when its own line — or the line directly
 * above it — contains `vibebar-ignore`, optionally followed by a token that must be part of the
 * finding id (so `vibebar-ignore xss-sink` suppresses only that rule). Project-level findings have
 * no single line and are never suppressed this way.
 */
function isInlineSuppressed(content: string, line: number, findingId: string): boolean {
  const lines = content.split('\n')
  const candidates = [lines[line - 1], lines[line - 2]]
  const re = /vibebar-ignore(?:[ \t]+([\w-]+))?/i
  for (const raw of candidates) {
    if (raw == null) continue
    const m = re.exec(raw)
    if (!m) continue
    if (!m[1]) return true
    if (findingId.includes(m[1])) return true
  }
  return false
}

/**
 * Runs every rule over the gathered inputs and returns findings sorted by severity (then
 * confidence). No I/O here — the AuditService reads the files and passes them in, which keeps the
 * rules unit testable and keeps all filesystem access in one audited place.
 *
 * Test/fixture/example files are filtered out once up front: they are expected to contain "scary"
 * strings (fake keys, sink names, route fixtures) and flagging them produces only false positives.
 */
export interface RunAuditOptions {
  /** Optional incremental cache that reuses file-scoped findings for unchanged files. */
  cache?: FileFindingsCache
}

/** Like {@link runAuditRules} but also reports engine stats (e.g. how many files were cached). */
export function runAuditRulesWithStats(
  input: AuditRuleInput,
  options: RunAuditOptions = {}
): RunResult {
  const scoped: AuditRuleInput = {
    ...input,
    files: input.files.filter(
      (f) =>
        !isTestOrExampleFile(f.path) &&
        !isAuditEngineFile(f.path) &&
        !isExcludedFromFileRules(f.path, f.content)
    )
  }
  const byPath = new Map(scoped.files.map((f) => [f.path, f.content]))
  const { findings, cachedFiles } = runRules(scoped, ALL_RULES, { cache: options.cache })

  // De-duplicate by fingerprint (a file matched by overlapping prefilters should appear once).
  const seen = new Set<string>()

  const finalFindings = findings
    .filter((f) => {
      if (f.file && f.line) {
        const content = byPath.get(f.file)
        if (content != null && isInlineSuppressed(content, f.line, f.id)) return false
      }
      if (seen.has(f.fingerprint)) return false
      seen.add(f.fingerprint)
      return true
    })
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      if (bySeverity !== 0) return bySeverity
      return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
    })

  return { findings: finalFindings, cachedFiles }
}

export function runAuditRules(input: AuditRuleInput, options: RunAuditOptions = {}): AuditFinding[] {
  return runAuditRulesWithStats(input, options).findings
}
