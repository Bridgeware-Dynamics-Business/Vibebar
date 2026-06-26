import { describe, expect, it } from 'vitest'
import { analyzeOutput } from './outputAnalyzer.js'
import {
  extractStackFrames,
  parseStructuredOutput
} from './terminalParsers.js'

describe('extractStackFrames', () => {
  it('parses Node-style at frames', () => {
    const text = `
Error: boom
    at Object.run (src/foo.ts:12:5)
    at Module.handler (lib/bar.ts:3:1)
`
    const frames = extractStackFrames(text)
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({ file: 'src/foo.ts', line: 12, column: 5 })
    expect(frames[1]?.file).toBe('lib/bar.ts')
  })

  it('skips node: internal frames', () => {
    const text = '    at node:internal/process/task_queues:95:5'
    expect(extractStackFrames(text)).toEqual([])
  })
})

describe('parseStructuredOutput', () => {
  it('parses vitest failure blocks', () => {
    const output = `
 FAIL  src/math.test.ts > adds numbers
AssertionError: expected 3 to be 4
 ❯ src/math.test.ts:10:5
`
    const parsed = parseStructuredOutput(
      { command: 'npm test', output, exitCode: 1, profile: null },
      { testRunner: 'vitest', language: 'typescript' } as never
    )
    expect(parsed?.primaryKind).toBe('vitest')
    expect(parsed?.failures[0]?.file).toBe('src/math.test.ts')
    expect(parsed?.failures[0]?.testName).toBe('adds numbers')
    expect(parsed?.fingerprint).toContain('vitest')
  })

  it('parses tsc errors with file:line:col', () => {
    const output = 'src/app.ts(10,5): error TS2322: Type string is not assignable to type number.'
    const parsed = parseStructuredOutput(
      { command: 'npm run typecheck', output, exitCode: 2, profile: null },
      { language: 'typescript', testRunner: 'unknown' } as never
    )
    expect(parsed?.primaryKind).toBe('tsc')
    expect(parsed?.failures[0]?.file).toBe('src/app.ts')
    expect(parsed?.failures[0]?.line).toBe(10)
    expect(parsed?.failures[0]?.column).toBe(5)
  })

  it('returns stack-only parse when no test/tsc match', () => {
    const output = `TypeError: Cannot read properties of undefined
    at doThing (src/run.ts:44:11)`
    const parsed = parseStructuredOutput(
      { command: 'node src/run.ts', output, exitCode: 1, profile: null },
      null
    )
    expect(parsed?.primaryKind).toBe('stack')
    expect(parsed?.stackFrames[0]?.file).toBe('src/run.ts')
  })
})

describe('analyzeOutput integration', () => {
  it('prefers structured vitest issue over generic regex', () => {
    const issues = analyzeOutput({
      command: 'npm test',
      output: ' FAIL  src/a.test.ts > case\nAssertionError: nope\n ❯ src/a.test.ts:2:1',
      exitCode: 1,
      profile: null
    })
    expect(issues.some((i) => i.id === 'test-failure')).toBe(true)
    expect(issues.filter((i) => i.id === 'test-failure')).toHaveLength(1)
    expect(issues[0]?.fingerprint).toBeTruthy()
  })
})
