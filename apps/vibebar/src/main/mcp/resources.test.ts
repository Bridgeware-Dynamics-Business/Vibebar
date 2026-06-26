import { describe, expect, it } from 'vitest'
import {
  buildReadyCheckBriefResource,
  buildReadyCheckSummaryResource,
  buildProjectMemoryDiffResource,
  buildSessionMistakesResource,
  buildSessionFailuresResource,
  buildSessionFlightLogResource,
  buildSessionIntentResource,
  buildVerifyRecipeResource
} from './resources.js'
import { buildReadyCheckBrief } from '../readyCheck/readyCheckLogic.js'
import type { ReadyCheckResult } from '@shared/types.js'

describe('mcp resources', () => {
  it('buildSessionIntentResource returns null intent when unset', () => {
    expect(buildSessionIntentResource(null)).toEqual({ intent: null })
  })

  it('buildSessionFlightLogResource empty when no flight', () => {
    expect(buildSessionFlightLogResource(null)).toEqual({
      commands: [],
      audits: [],
      lastGreen: null
    })
  })

  it('buildSessionFailuresResource reverses newest first', () => {
    const payload = buildSessionFailuresResource([
      {
        command: 'npm test',
        exitCode: 1,
        kind: 'vitest',
        fingerprint: 'a',
        stackFrames: [],
        rawOutput: 'fail',
        timestamp: 1
      },
      {
        command: 'npm run lint',
        exitCode: 2,
        kind: 'generic',
        fingerprint: 'b',
        stackFrames: [],
        rawOutput: 'lint',
        timestamp: 2
      }
    ])
    expect(payload.count).toBe(2)
    expect((payload.failures as { command: string }[])[0]?.command).toBe('npm run lint')
  })

  it('buildVerifyRecipeResource null when missing', () => {
    expect(buildVerifyRecipeResource(null)).toEqual({ recipe: null })
  })

  it('buildReadyCheckSummaryResource links to brief resource', () => {
    const result: ReadyCheckResult = {
      status: 'blocked',
      signals: [{ id: 'terminal', label: 'Terminal', level: 'blocked', detail: 'failed' }]
    }
    const payload = buildReadyCheckSummaryResource(result)
    expect(payload.briefResource).toBe('vibebar://ready-check/brief')
  })

  it('buildReadyCheckBriefResource exposes top items', () => {
    const brief = buildReadyCheckBrief('needs-review', [
      { id: 'tests-not-run', label: 'Tests not run', level: 'warning', detail: 'not run' }
    ])
    const payload = buildReadyCheckBriefResource(brief)
    expect(payload.topItems).toHaveLength(1)
    expect((payload.topItems as { nextAction: string }[])[0]?.nextAction).toContain('test')
  })

  it('buildProjectMemoryDiffResource includes warnings', () => {
    const payload = buildProjectMemoryDiffResource({
      warnings: [{ id: 'no-agents-md', message: 'missing', severity: 'warning' }],
      agentsMdExists: false,
      agentsMdAgeDays: null,
      cursorRulesCount: 0,
      contextReadmeExists: false,
      codesyncConfigured: false
    })
    expect((payload.warnings as unknown[]).length).toBe(1)
  })

  it('buildSessionMistakesResource caps list', () => {
    const payload = buildSessionMistakesResource([
      {
        pattern: 'weak-types',
        file: 'a.ts',
        message: 'any',
        timestamp: 1,
        fingerprint: 'x'
      }
    ])
    expect(payload.count).toBe(1)
  })
})
