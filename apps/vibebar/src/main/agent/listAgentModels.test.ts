import { describe, expect, it } from 'vitest'
import { mergeAgentModelLists } from '@shared/agentCompanionModels.js'
import { parseAgentModelsOutput } from './listAgentModels.js'

describe('parseAgentModelsOutput', () => {
  it('parses tab-separated model lines', () => {
    expect(
      parseAgentModelsOutput('composer-2.5-fast\tComposer 2.5 Fast\ngpt-5.3-codex\tGPT-5.3 Codex')
    ).toEqual([
      { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }
    ])
  })

  it('parses spaced id and label pairs', () => {
    expect(parseAgentModelsOutput('composer-2.5-fast  Composer 2.5 Fast')).toEqual([
      { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' }
    ])
  })

  it('parses JSON model arrays', () => {
    expect(
      parseAgentModelsOutput(
        JSON.stringify([
          { id: 'composer-2.5-fast', name: 'Composer 2.5 Fast' },
          { modelId: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }
        ])
      )
    ).toEqual([
      { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' }
    ])
  })
})

describe('mergeAgentModelLists', () => {
  it('keeps CLI order and appends unknown fallbacks', () => {
    const merged = mergeAgentModelLists([{ id: 'custom-model', label: 'Custom' }])
    expect(merged[0]).toEqual({ id: 'custom-model', label: 'Custom' })
    expect(merged.some((m) => m.id === 'composer-2.5-fast')).toBe(true)
  })
})
