import { describe, expect, it } from 'vitest'
import { parseGitStatus } from './gitStatus.js'

describe('parseGitStatus', () => {
  it('reports a clean tree on a tracked branch', () => {
    expect(parseGitStatus('## main...origin/main\n')).toEqual({
      branch: 'main',
      ahead: 0,
      behind: 0,
      changeCount: 0
    })
  })

  it('counts every changed entry (staged, unstaged, untracked)', () => {
    const out = ['## main...origin/main', ' M src/a.ts', 'A  src/b.ts', '?? notes.md', 'D  old.ts'].join(
      '\n'
    )
    expect(parseGitStatus(out)).toMatchObject({ branch: 'main', changeCount: 4 })
  })

  it('parses ahead/behind from the branch header', () => {
    const out = '## feature...origin/feature [ahead 2, behind 3]\n M x.ts'
    expect(parseGitStatus(out)).toEqual({ branch: 'feature', ahead: 2, behind: 3, changeCount: 1 })
  })

  it('handles ahead only', () => {
    expect(parseGitStatus('## main...origin/main [ahead 5]')).toMatchObject({ ahead: 5, behind: 0 })
  })

  it('handles a branch with no upstream', () => {
    expect(parseGitStatus('## wip\n?? new.txt')).toEqual({
      branch: 'wip',
      ahead: 0,
      behind: 0,
      changeCount: 1
    })
  })

  it('handles a fresh repo with no commits yet', () => {
    expect(parseGitStatus('## No commits yet on main\n?? README.md')).toMatchObject({
      branch: 'main',
      changeCount: 1
    })
  })

  it('leaves branch null on a detached HEAD', () => {
    expect(parseGitStatus('## HEAD (no branch)\n M a.ts')).toEqual({
      branch: null,
      ahead: 0,
      behind: 0,
      changeCount: 1
    })
  })

  it('tolerates CRLF line endings', () => {
    expect(parseGitStatus('## main...origin/main\r\n M a.ts\r\n?? b.ts\r\n')).toMatchObject({
      branch: 'main',
      changeCount: 2
    })
  })
})
