import { describe, expect, it } from 'vitest'
import {
  appendCommandRecord,
  emptyFlightData,
  formatLastGreenExcerpt,
  looksLikeVerifyCommand,
  refreshLastGreenDelta,
  updateLastGreen,
  verifyCountsAsGreen
} from './flightRecorderLogic.js'
import { parseVerifyOutcome } from '../terminal/terminalParsers.js'

describe('flightRecorderLogic', () => {
  it('detects test-like commands', () => {
    expect(looksLikeVerifyCommand('npm test')).toBe(true)
    expect(looksLikeVerifyCommand('pnpm run typecheck')).toBe(true)
    expect(looksLikeVerifyCommand('git status')).toBe(false)
  })

  it('records commands and caps history', () => {
    let data = emptyFlightData()
    data = appendCommandRecord(data, 'npm test', 1)
    expect(data.commands).toHaveLength(1)
    expect(data.commands[0]?.isTest).toBe(true)
  })

  it('updates last green on passing verify command', () => {
    let data = emptyFlightData()
    data = updateLastGreen(data, 'npm test', 0, ['src/a.ts'])
    expect(data.lastGreen?.command).toBe('npm test')
    expect(data.lastGreen?.filesAtGreen).toEqual(['src/a.ts'])
  })

  it('does not update last green on failure', () => {
    const data = updateLastGreen(emptyFlightData(), 'npm test', 1, ['src/a.ts'])
    expect(data.lastGreen).toBeNull()
  })

  it('does not update last green when exit 0 but output has failures', () => {
    const verify = parseVerifyOutcome(
      { command: 'npm test', output: ' FAIL  src/a.test.ts > x', exitCode: 0 },
      null
    )
    expect(verifyCountsAsGreen('npm test', verify, 0)).toBe(false)
    const data = updateLastGreen(emptyFlightData(), 'npm test', 0, ['src/a.ts'], verify)
    expect(data.lastGreen).toBeNull()
  })

  it('stores output hash on command records', () => {
    const data = appendCommandRecord(emptyFlightData(), 'npm test', 0, 'abc123')
    expect(data.commands[0]?.outputHash).toBe('abc123')
  })

  it('formats last green excerpt for handoffs', () => {
    const lines = formatLastGreenExcerpt({
      command: 'npm test',
      timestamp: Date.now(),
      filesAtGreen: ['a.ts'],
      filesChangedSince: ['b.ts']
    })
    expect(lines.join('\n')).toContain('Last passing command')
    expect(lines.join('\n')).toContain('b.ts')
  })

  it('refreshLastGreenDelta recomputes stale files from live git paths', () => {
    const refreshed = refreshLastGreenDelta(
      {
        command: 'npm test',
        timestamp: Date.now(),
        filesAtGreen: ['src/a.ts'],
        filesChangedSince: []
      },
      ['src/a.ts', 'src/b.ts']
    )
    expect(refreshed?.filesChangedSince).toEqual(['src/b.ts'])
  })
})
