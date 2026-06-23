import { describe, expect, it } from 'vitest'
import { buildGitDiffPrompt } from './gitDiff.js'

describe('buildGitDiffPrompt', () => {
  it('wraps staged and unstaged diffs in fenced sections', () => {
    const prompt = buildGitDiffPrompt('my-app', 'main', '+added', '-removed')
    expect(prompt).toContain('## Git diff: my-app (main)')
    expect(prompt).toContain('### Staged changes')
    expect(prompt).toContain('```diff')
    expect(prompt).toContain('+added')
    expect(prompt).toContain('### Unstaged changes')
    expect(prompt).toContain('-removed')
  })

  it('notes when there is no textual diff', () => {
    const prompt = buildGitDiffPrompt('my-app', null, '', '')
    expect(prompt).toContain('untracked files')
  })
})
