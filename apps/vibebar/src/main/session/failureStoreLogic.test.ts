import { describe, expect, it } from 'vitest'
import {
  appendFailureRecord,
  FAILURE_MAX_RECORDS,
  FAILURE_RAW_OUTPUT_MAX,
  recentFailuresForUi,
  trimFailureOutput
} from './failureStoreLogic.js'
import type { TerminalFailureRecord } from '@shared/types.js'

function sampleRecord(i: number): TerminalFailureRecord {
  return {
    command: `npm test ${i}`,
    exitCode: 1,
    kind: 'vitest',
    fingerprint: `fp-${i}`,
    stackFrames: [{ file: 'src/a.ts', line: 1 }],
    rawOutput: `fail ${i}`,
    timestamp: i
  }
}

describe('failureStoreLogic', () => {
  it('caps failure list at FAILURE_MAX_RECORDS', () => {
    let failures: TerminalFailureRecord[] = []
    for (let i = 0; i < FAILURE_MAX_RECORDS + 5; i++) {
      failures = appendFailureRecord(failures, sampleRecord(i))
    }
    expect(failures).toHaveLength(FAILURE_MAX_RECORDS)
    expect(failures[0]?.command).toBe('npm test 5')
  })

  it('returns newest failures first for UI', () => {
    const failures = [sampleRecord(1), sampleRecord(2), sampleRecord(3)]
    const ui = recentFailuresForUi(failures)
    expect(ui[0]?.timestamp).toBe(3)
    expect(ui).toHaveLength(3)
  })

  it('trims raw output to cap', () => {
    const long = 'x'.repeat(FAILURE_RAW_OUTPUT_MAX + 100)
    const trimmed = trimFailureOutput(long)
    expect(trimmed.length).toBeLessThanOrEqual(FAILURE_RAW_OUTPUT_MAX + 32)
    expect(trimmed).toContain('truncated')
  })
})
