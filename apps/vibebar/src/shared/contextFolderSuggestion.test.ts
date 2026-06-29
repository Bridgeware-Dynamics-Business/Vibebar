import { describe, expect, it } from 'vitest'
import {
  formatContextFolderInsert,
  matchContextFolderTrigger
} from './contextFolderSuggestion.js'
describe('matchContextFolderTrigger', () => {
  it('matches the full "ai context folder" phrase (longest first)', () => {
    expect(matchContextFolderTrigger('open the ai context folder')).toBe('ai context folder'.length)
  })

  it('matches the shorter "context folder" phrase', () => {
    expect(matchContextFolderTrigger('see the context folder')).toBe('context folder'.length)
  })

  it('is case-insensitive', () => {
    expect(matchContextFolderTrigger('AI Context Folder')).toBe('ai context folder'.length)
  })

  it('matches when the phrase is followed by trailing colons', () => {
    expect(matchContextFolderTrigger('ai context folder::')).toBe('ai context folder::'.length)
    expect(matchContextFolderTrigger('see the context folder:')).toBe('context folder:'.length)
    expect(matchContextFolderTrigger('AI Context Folder::')).toBe('AI Context Folder::'.length)
  })

  it('matches the shorter ":: ai context" and "ai context" triggers', () => {
    expect(matchContextFolderTrigger(':: ai context')).toBe(':: ai context'.length)
    expect(matchContextFolderTrigger(':: ai context::')).toBe(':: ai context::'.length)
    expect(matchContextFolderTrigger('see :: AI Context')).toBe(':: AI Context'.length)
    expect(matchContextFolderTrigger('ai context')).toBe('ai context'.length)
    expect(matchContextFolderTrigger('note: ai context')).toBe('ai context'.length)
  })

  it('prefers longer triggers over shorter ones', () => {
    expect(matchContextFolderTrigger('ai context folder')).toBe('ai context folder'.length)
    expect(matchContextFolderTrigger(':: ai context folder')).toBe('ai context folder'.length)
  })

  it('matches at the very start of the block', () => {
    expect(matchContextFolderTrigger('context folder')).toBe('context folder'.length)
  })

  it('does not match a non-boundary suffix', () => {
    expect(matchContextFolderTrigger('subcontext folder')).toBeNull()
  })

  it('does not match when the phrase is not at the caret', () => {
    expect(matchContextFolderTrigger('the context folder is here')).toBeNull()
  })

  it('returns null for unrelated text', () => {
    expect(matchContextFolderTrigger('just a normal note')).toBeNull()
    expect(matchContextFolderTrigger('')).toBeNull()
  })
})

describe('formatContextFolderInsert', () => {
  const path = 'P:\\repo\\AI Context'

  it('keeps the typed phrase, adds ::, then the path', () => {
    expect(formatContextFolderInsert('ai context folder::', path)).toBe(
      'ai context folder:: P:\\repo\\AI Context'
    )
  })

  it('preserves casing and adds :: when the user did not type colons yet', () => {
    expect(formatContextFolderInsert('AI Context Folder', path)).toBe(
      'AI Context Folder:: P:\\repo\\AI Context'
    )
  })

  it('normalizes a single trailing colon to ::', () => {
    expect(formatContextFolderInsert('context folder:', path)).toBe(
      'context folder:: P:\\repo\\AI Context'
    )
  })

  it('works for :: ai context and ai context shorthand', () => {
    expect(formatContextFolderInsert(':: ai context', path)).toBe(
      ':: ai context:: P:\\repo\\AI Context'
    )
    expect(formatContextFolderInsert('ai context', path)).toBe('ai context:: P:\\repo\\AI Context')
  })
})
