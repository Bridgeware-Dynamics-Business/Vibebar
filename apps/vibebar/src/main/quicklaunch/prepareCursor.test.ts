import { describe, expect, it } from 'vitest'
import { buildPrepareCursorBootstrap, PREPARE_CURSOR_CHAR_BUDGET } from './prepareCursor.js'
import { emptyProfile } from '@vibebar/project-detector'

describe('prepareCursor bootstrap', () => {
  it('returns empty when no profile', () => {
    expect(buildPrepareCursorBootstrap({ profile: null, readyCheck: { status: 'looks-ready', signals: [] }, intent: null })).toBe('')
  })

  it('includes intent, verify recipe, and MCP hint under budget', () => {
    const profile = emptyProfile('/tmp/proj', 'demo')
    const text = buildPrepareCursorBootstrap({
      profile,
      readyCheck: {
        status: 'needs-review',
        signals: [],
        verifyRecipe: { steps: [{ id: 'test', label: 'Test', command: 'npm test' }], summary: 'npm test' },
        brief: {
          status: 'needs-review',
          summaryLine: 'Review signals',
          topItems: [
            {
              id: 'tests-not-run',
              label: 'Tests not run',
              level: 'warning',
              detail: 'none',
              nextAction: 'Run npm test'
            }
          ]
        }
      },
      intent: {
        goal: 'Fix auth bug',
        constraints: [],
        filesInScope: ['src/auth.ts'],
        acceptanceCriteria: ['tests pass'],
        verifyCommand: 'npm test',
        updatedAt: Date.now()
      }
    })
    expect(text).toContain('Prepare Cursor')
    expect(text).toContain('Fix auth bug')
    expect(text).toContain('npm test')
    expect(text).toContain('vibebar://session/intent')
    expect(text.length).toBeLessThanOrEqual(PREPARE_CURSOR_CHAR_BUDGET + 64)
  })
})
