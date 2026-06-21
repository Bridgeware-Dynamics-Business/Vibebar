import { describe, expect, it } from 'vitest'
import { builtInCandidates, codexCandidates, cursorCandidates } from './launchPaths.js'

describe('cursorCandidates', () => {
  it('probes the per-user install path on Windows', () => {
    const out = cursorCandidates(
      { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', ProgramFiles: 'C:\\Program Files' },
      'win32'
    )
    expect(out.some((p) => p.toLowerCase().includes('cursor') && p.endsWith('Cursor.exe'))).toBe(
      true
    )
  })

  it('returns the app bundle on macOS', () => {
    expect(cursorCandidates({}, 'darwin')).toContain('/Applications/Cursor.app')
  })

  it('probes PATH-style binaries on Linux', () => {
    expect(cursorCandidates({}, 'linux')).toContain('/usr/local/bin/cursor')
  })
})

describe('codexCandidates', () => {
  it('probes the npm-global shim on Windows', () => {
    const out = codexCandidates({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32')
    expect(out.some((p) => p.endsWith('codex.cmd'))).toBe(true)
  })

  it('probes Homebrew + /usr/local on macOS', () => {
    expect(codexCandidates({}, 'darwin')).toContain('/opt/homebrew/bin/codex')
  })
})

describe('builtInCandidates', () => {
  it('routes known ids to their detector and returns [] for custom apps', () => {
    expect(builtInCandidates('cursor', {}, 'darwin')).toContain('/Applications/Cursor.app')
    expect(builtInCandidates('codex', {}, 'darwin')).toContain('/opt/homebrew/bin/codex')
    expect(builtInCandidates('custom-123', { LOCALAPPDATA: 'C:\\x' }, 'win32')).toEqual([])
  })
})
