import { describe, expect, it, vi } from 'vitest'
import type { PromptTemplate } from '@vibebar/prompt-engine'
import type { HistoryEntry } from '@shared/types.js'

const writeText = vi.fn()
vi.mock('electron', () => ({ clipboard: { writeText: (t: string) => writeText(t) } }))

const { PromptStore } = await import('./PromptStore.js')
import type { AppStore } from '../settings/store.js'
import type { ProjectService } from '../project/ProjectService.js'

function makeStore(custom: PromptTemplate[]): AppStore {
  return {
    getFavorites: () => [],
    getCustomPrompts: () => custom,
    getSettings: () => ({
      dock: 'left',
      enabledDisplayIds: [],
      guardrailsEnabled: false,
      launchOnStartup: false
    }),
    addHistory: (_entry: HistoryEntry) => []
  } as unknown as AppStore
}

const projects = {
  getProfile: () => null,
  stacks: () => ['any']
} as unknown as ProjectService

const secretPrompt: PromptTemplate = {
  id: 'test-secret',
  title: 'Has a secret',
  categories: ['Security'],
  stacks: ['any'],
  description: '',
  variables: [],
  guardrails: [],
  body: 'Use this key: AKIA1234567890ABCDEF when calling the API.',
  builtIn: false,
  favorite: false,
  usageCount: 0
}

describe('PromptStore.copy', () => {
  it('redacts secrets before writing to the clipboard', () => {
    writeText.mockClear()
    const store = new PromptStore(makeStore([secretPrompt]), projects)

    const result = store.copy('test-secret')

    expect(result.copied).toBe(true)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.text).not.toContain('AKIA1234567890ABCDEF')
    expect(result.text).toContain('[REDACTED:AWS access key]')

    const clipped = writeText.mock.calls[0]?.[0]
    expect(clipped).not.toContain('AKIA1234567890ABCDEF')
    expect(clipped).toContain('[REDACTED:AWS access key]')
  })

  it('leaves secret-free prompts untouched', () => {
    writeText.mockClear()
    const clean: PromptTemplate = { ...secretPrompt, id: 'clean', body: 'Refactor my code safely.' }
    const store = new PromptStore(makeStore([clean]), projects)

    const result = store.copy('clean')

    expect(result.copied).toBe(true)
    expect(result.findings).toHaveLength(0)
    expect(result.text).toBe('Refactor my code safely.')
    expect(writeText.mock.calls[0]?.[0]).toBe('Refactor my code safely.')
  })
})
