import { describe, expect, it } from 'vitest'
import { githubDesktopCandidates } from './desktopPaths.js'

describe('githubDesktopCandidates', () => {
  it('probes the per-user and machine-wide install paths on Windows', () => {
    const out = githubDesktopCandidates(
      { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', ProgramFiles: 'C:\\Program Files' },
      'win32'
    )
    expect(out.some((p) => p.includes('GitHubDesktop') && p.endsWith('GitHubDesktop.exe'))).toBe(true)
    expect(out.some((p) => p.includes('Program Files'))).toBe(true)
  })

  it('puts a configured override first', () => {
    const out = githubDesktopCandidates(
      { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
      'win32',
      'D:\\custom\\GitHubDesktop.exe'
    )
    expect(out[0]).toBe('D:\\custom\\GitHubDesktop.exe')
  })

  it('ignores a blank override', () => {
    const out = githubDesktopCandidates({ LOCALAPPDATA: 'C:\\x' }, 'win32', '   ')
    expect(out[0]).not.toBe('   ')
  })

  it('returns the app bundle on macOS', () => {
    expect(githubDesktopCandidates({}, 'darwin')).toContain('/Applications/GitHub Desktop.app')
  })

  it('falls back to override-only on unknown platforms', () => {
    expect(githubDesktopCandidates({}, 'linux', '/opt/ghd')).toEqual(['/opt/ghd'])
    expect(githubDesktopCandidates({}, 'linux')).toEqual([])
  })
})
