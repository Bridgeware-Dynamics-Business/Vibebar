import type { AgentMistake, IntentContract, LastGreenState } from '@shared/types.js'

export type MistakePattern = AgentMistake['pattern']

export const MISTAKE_LEDGER_CAP = 30

const WEAK_TYPE_RE = /(?:^|\n)\+.*\bany\b|@ts-ignore|@ts-expect-error|#\s*type:\s*ignore/m
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$|__tests__\/|_test\.go$|test_[a-z0-9_]+\.py$/i
const SOURCE_FILE_RE = /\.([cm]?[jt]sx?|py|rs|go|php|java|rb)$/i

export interface DetectMistakesInput {
  changedPaths: string[]
  intent: IntentContract | null
  /** Unified diff text (staged + unstaged) when available. */
  diffText?: string
  lastGreen: LastGreenState | null
  /** Basenames of tracked files in repo (for duplicate heuristic). */
  trackedBasenames?: string[]
}

function mistakeFingerprint(pattern: MistakePattern, file: string): string {
  return `${pattern}|${file.replace(/\\/g, '/').toLowerCase()}`
}

function isTestPath(path: string): boolean {
  return TEST_FILE_RE.test(path.replace(/\\/g, '/'))
}

function isSourcePath(path: string): boolean {
  const p = path.replace(/\\/g, '/')
  return SOURCE_FILE_RE.test(p) && !isTestPath(p)
}

function pathOutsideScope(path: string, scope: string[]): boolean {
  const norm = path.replace(/\\/g, '/')
  return !scope.some((s) => {
    const base = s.replace(/\\/g, '/').replace(/^\.\//, '')
    return norm === base || norm.startsWith(`${base}/`)
  })
}

/** Detects recurring agent mistake patterns from a change snapshot. */
export function detectMistakes(input: DetectMistakesInput): AgentMistake[] {
  const mistakes: AgentMistake[] = []
  const now = Date.now()
  const diff = input.diffText ?? ''

  if (diff && WEAK_TYPE_RE.test(diff)) {
    const files = input.changedPaths.filter((p) => diff.includes(p) || diff.includes(p.split('/').pop() ?? ''))
    for (const file of (files.length > 0 ? files : input.changedPaths).slice(0, 3)) {
      mistakes.push({
        pattern: 'weak-types',
        file,
        message: 'Diff adds `any`, `@ts-ignore`, or similar weak typing — prefer strict types.',
        timestamp: now,
        fingerprint: mistakeFingerprint('weak-types', file)
      })
    }
  }

  if (input.intent?.filesInScope?.length) {
    for (const path of input.changedPaths) {
      if (pathOutsideScope(path, input.intent.filesInScope)) {
        mistakes.push({
          pattern: 'out-of-scope',
          file: path,
          message: `Changed outside current task scope — review intent filesInScope.`,
          timestamp: now,
          fingerprint: mistakeFingerprint('out-of-scope', path)
        })
      }
    }
  }

  const tracked = new Set((input.trackedBasenames ?? []).map((b) => b.toLowerCase()))
  for (const path of input.changedPaths) {
    const base = path.split('/').pop()?.toLowerCase() ?? ''
    if (!base || tracked.size === 0) continue
    if (tracked.has(base) && path.includes('copy')) {
      mistakes.push({
        pattern: 'duplicate-file',
        file: path,
        message: `New file basename matches an existing tracked pattern — avoid duplicate modules.`,
        timestamp: now,
        fingerprint: mistakeFingerprint('duplicate-file', path)
      })
    }
  }

  if (input.lastGreen) {
    const changedSince = new Set(input.lastGreen.filesChangedSince.map((p) => p.replace(/\\/g, '/')))
    const hasSourceChange = input.changedPaths.some((p) => changedSince.has(p.replace(/\\/g, '/')) && isSourcePath(p))
    const hasTestChange = input.changedPaths.some((p) => isTestPath(p))
    if (hasSourceChange && !hasTestChange) {
      const sample = input.changedPaths.find((p) => isSourcePath(p)) ?? input.changedPaths[0] ?? 'src'
      mistakes.push({
        pattern: 'skipped-tests',
        file: sample,
        message: 'Source changed since last green verify but no test files in this change set.',
        timestamp: now,
        fingerprint: mistakeFingerprint('skipped-tests', sample)
      })
    }
  }

  return mistakes
}

/** Merges new mistakes, dedupes by fingerprint, caps list. */
export function appendMistakes(existing: AgentMistake[], incoming: AgentMistake[]): AgentMistake[] {
  const byFp = new Map<string, AgentMistake>()
  for (const m of [...existing, ...incoming]) {
    byFp.set(m.fingerprint, m)
  }
  return [...byFp.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MISTAKE_LEDGER_CAP)
}

/** Markdown bullets for handoff / Prepare Cursor injection. */
export function formatMistakeWarnings(mistakes: AgentMistake[], max = 2): string[] {
  if (mistakes.length === 0) return []
  const lines = ['**Agent patterns to avoid:**']
  for (const m of mistakes.slice(0, max)) {
    lines.push(`- [${m.pattern}] \`${m.file}\` — ${m.message}`)
  }
  return ['', ...lines, '']
}
