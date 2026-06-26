import { describe, expect, it } from 'vitest'
import { appendMistakes, detectMistakes, formatMistakeWarnings, MISTAKE_LEDGER_CAP } from './mistakeLedger.js'

describe('detectMistakes', () => {
  it('detects weak-types from diff text', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
+++ b/src/a.ts
+const x: any = 1
+// @ts-ignore
`
    const mistakes = detectMistakes({
      changedPaths: ['src/a.ts'],
      intent: null,
      diffText: diff,
      lastGreen: null
    })
    expect(mistakes.some((m) => m.pattern === 'weak-types')).toBe(true)
  })

  it('detects out-of-scope changes when intent is active', () => {
    const mistakes = detectMistakes({
      changedPaths: ['src/auth.ts', 'lib/other.ts'],
      intent: {
        goal: 'Fix auth',
        constraints: [],
        filesInScope: ['src/auth.ts'],
        acceptanceCriteria: [],
        verifyCommand: null,
        updatedAt: Date.now()
      },
      lastGreen: null
    })
    expect(mistakes.filter((m) => m.pattern === 'out-of-scope')).toHaveLength(1)
    expect(mistakes[0]?.file).toBe('lib/other.ts')
  })

  it('detects skipped-tests when source changed since last green', () => {
    const mistakes = detectMistakes({
      changedPaths: ['src/app.ts'],
      intent: null,
      lastGreen: {
        command: 'npm test',
        timestamp: Date.now(),
        filesAtGreen: ['src/app.ts'],
        filesChangedSince: ['src/app.ts']
      }
    })
    expect(mistakes.some((m) => m.pattern === 'skipped-tests')).toBe(true)
  })
})

describe('appendMistakes', () => {
  it('dedupes by fingerprint and caps entries', () => {
    const base = {
      pattern: 'weak-types' as const,
      file: 'a.ts',
      message: 'x',
      timestamp: 1,
      fingerprint: 'weak-types|a.ts'
    }
    const next = appendMistakes(
      Array.from({ length: MISTAKE_LEDGER_CAP }, (_, i) => ({
        ...base,
        file: `${i}.ts`,
        fingerprint: `weak-types|${i}.ts`
      })),
      [{ ...base, timestamp: 2 }]
    )
    expect(next.length).toBe(MISTAKE_LEDGER_CAP)
    expect(next.some((m) => m.file === 'a.ts' && m.timestamp === 2)).toBe(true)
  })
})

describe('formatMistakeWarnings', () => {
  it('returns empty array when no mistakes', () => {
    expect(formatMistakeWarnings([])).toEqual([])
  })

  it('formats top mistakes for prompts', () => {
    const lines = formatMistakeWarnings([
      {
        pattern: 'weak-types',
        file: 'src/a.ts',
        message: 'avoid any',
        timestamp: 1,
        fingerprint: 'x'
      }
    ])
    expect(lines.join('\n')).toContain('weak-types')
    expect(lines.join('\n')).toContain('src/a.ts')
  })
})
