import { describe, expect, it } from 'vitest'
import { buildWhatsNextSuggestions, capSessionEntries, SESSION_DISPLAY_CAP } from './sessionWhatsNext.js'
import type { SessionEntry } from '@shared/types.js'

describe('buildWhatsNextSuggestions', () => {
  it('suggests prompt library when session is empty', () => {
    const s = buildWhatsNextSuggestions({ state: { entries: [], noProject: false, pinnedCount: 0 }, gitStatus: null, terminalIssueCount: 0 })
    expect(s.some((x) => x.id === 'copy-prompt')).toBe(true)
  })

  it('suggests git diff when changes exist but no diff copied', () => {
    const s = buildWhatsNextSuggestions({
      state: { entries: [], noProject: false, pinnedCount: 0 },
      gitStatus: { isRepo: true, branch: 'main', changeCount: 3, ahead: 0, behind: 0 },
      terminalIssueCount: 0
    })
    expect(s.some((x) => x.id === 'copy-diff')).toBe(true)
  })

  it('suggests terminal when issues are present', () => {
    const s = buildWhatsNextSuggestions({
      state: { entries: [], noProject: false, pinnedCount: 0 },
      gitStatus: null,
      terminalIssueCount: 2
    })
    expect(s.some((x) => x.id === 'open-terminal')).toBe(true)
  })
})

describe('capSessionEntries', () => {
  it('caps at SESSION_DISPLAY_CAP', () => {
    const entries: SessionEntry[] = Array.from({ length: SESSION_DISPLAY_CAP + 5 }, (_, i) => ({
      id: String(i),
      type: 'prompt',
      title: `p${i}`,
      timestamp: i,
      pinned: false,
      promptId: 'x'
    }))
    expect(capSessionEntries(entries, false)).toHaveLength(SESSION_DISPLAY_CAP)
    expect(capSessionEntries(entries, true)).toHaveLength(entries.length)
  })
})
