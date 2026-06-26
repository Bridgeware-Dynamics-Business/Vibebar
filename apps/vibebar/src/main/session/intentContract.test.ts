import { describe, expect, it } from 'vitest'
import { formatIntentSection, isIntentActive, parseIntentListField } from './intentContract.js'

describe('intentContract', () => {
  it('is inactive when goal is empty', () => {
    expect(isIntentActive(null)).toBe(false)
    expect(
      isIntentActive({
        goal: '  ',
        constraints: [],
        filesInScope: [],
        acceptanceCriteria: [],
        verifyCommand: null,
        updatedAt: 0
      })
    ).toBe(false)
  })

  it('formats current task section', () => {
    const lines = formatIntentSection({
      goal: 'Fix auth redirect',
      constraints: ['No breaking API changes'],
      filesInScope: ['src/auth.ts'],
      acceptanceCriteria: ['Login works in dev'],
      verifyCommand: 'npm test',
      updatedAt: Date.now()
    })
    expect(lines.join('\n')).toContain('## Current task')
    expect(lines.join('\n')).toContain('Fix auth redirect')
    expect(lines.join('\n')).toContain('npm test')
  })

  it('parses list fields from multiline text', () => {
    expect(parseIntentListField(' one\n two \n')).toEqual(['one', 'two'])
  })
})
