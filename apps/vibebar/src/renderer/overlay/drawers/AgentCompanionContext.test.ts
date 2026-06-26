import { describe, expect, it } from 'vitest'
import { formatGitLine } from './AgentCompanionContext.js'
import type { GitStatus, ProjectProfile } from '@shared/types.js'

const profile = { rootPath: '/p', folderName: 'app' } as ProjectProfile

describe('formatGitLine', () => {
  it('prompts to select project when profile is missing', () => {
    expect(formatGitLine(null, null)).toBe('Select a project')
  })

  it('shows branch, changes, and sync arrows', () => {
    const git: GitStatus = {
      isRepo: true,
      branch: 'feat/agent-ui',
      changeCount: 4,
      ahead: 1,
      behind: 2
    }
    expect(formatGitLine(git, profile)).toBe('feat/agent-ui · 4 changes · 1↑ · 2↓')
  })

  it('shows clean tree', () => {
    const git: GitStatus = {
      isRepo: true,
      branch: 'main',
      changeCount: 0,
      ahead: 0,
      behind: 0
    }
    expect(formatGitLine(git, profile)).toBe('main · clean')
  })
})
