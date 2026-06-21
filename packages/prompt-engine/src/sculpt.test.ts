import { emptyProfile, type ProjectProfile } from '@vibebar/project-detector'
import { describe, expect, it } from 'vitest'
import { buildContext, filterTemplates, isTemplateVisible, sculptPrompt } from './sculpt.js'
import type { PromptTemplate } from './types.js'

function electronProfile(): ProjectProfile {
  return {
    ...emptyProfile('C:/code/my-app', 'my-app'),
    gitBranch: 'main',
    language: 'typescript',
    framework: 'electron',
    isElectron: true,
    testRunner: 'vitest',
    packageManager: 'npm',
    rendererDir: 'src/renderer',
    stacks: ['electron', 'typescript', 'vite', 'any']
  }
}

function nextProfile(): ProjectProfile {
  return {
    ...emptyProfile('C:/code/web-app', 'web-app'),
    language: 'typescript',
    framework: 'next',
    isElectron: false,
    testRunner: 'playwright',
    packageManager: 'pnpm',
    hasDb: true,
    stacks: ['next', 'typescript', 'react', 'any']
  }
}

const errorConsole: PromptTemplate = {
  id: 'sec-error-console',
  title: 'In-app Error Console',
  categories: ['Security', 'Debugging'],
  stacks: ['any'],
  description: 'Safe local error console for runtime debugging',
  variables: [{ key: 'rendererDir', source: 'rendererDir', default: 'src', label: 'Renderer' }],
  guardrails: ['no-secrets', 'no-innerHTML'],
  body: [
    'You are working inside my {{framework}} app written in {{language}}.',
    'Add an error console under {{rendererDir}}.',
    '{{#if isElectron}}Keep contextIsolation true and never weaken the preload bridge.{{else}}Add a strict CSP and avoid dangerouslySetInnerHTML.{{/if}}'
  ].join('\n')
}

describe('buildContext', () => {
  it('humanizes framework and language', () => {
    const ctx = buildContext(electronProfile())
    expect(ctx.framework).toBe('Electron')
    expect(ctx.language).toBe('TypeScript')
    expect(ctx.isElectron).toBe(true)
  })

  it('exposes stack booleans for web projects', () => {
    const ctx = buildContext(nextProfile())
    expect(ctx.isNext).toBe(true)
    expect(ctx.isReact).toBe(true)
    expect(ctx.isElectron).toBe(false)
    expect(ctx.isWeb).toBe(true)
  })
})

describe('sculptPrompt conditionals', () => {
  it('includes the Electron branch for Electron projects', () => {
    const ctx = buildContext(electronProfile())
    const { sculptedText } = sculptPrompt(errorConsole, ctx, { guardrails: false })
    expect(sculptedText).toContain('Electron app written in TypeScript')
    expect(sculptedText).toContain('contextIsolation true')
    expect(sculptedText).toContain('src/renderer')
    expect(sculptedText).not.toContain('dangerouslySetInnerHTML')
  })

  it('includes the web branch for Next.js projects', () => {
    const ctx = buildContext(nextProfile())
    const { sculptedText } = sculptPrompt(errorConsole, ctx, { guardrails: false })
    expect(sculptedText).toContain('Next.js app')
    expect(sculptedText).toContain('dangerouslySetInnerHTML')
    expect(sculptedText).not.toContain('contextIsolation')
  })

  it('appends only the guardrails the template declares when enabled', () => {
    const ctx = buildContext(electronProfile())
    const { sculptedText } = sculptPrompt(errorConsole, ctx, { guardrails: true })
    expect(sculptedText).toContain('Safety constraints')
    expect(sculptedText).toContain('Never print, log, or hard-code secrets')
    expect(sculptedText).toContain('innerHTML')
    expect(sculptedText).not.toContain('parameterized queries')
  })

  it('resolves variable chips with humanized values', () => {
    const ctx = buildContext(electronProfile())
    const { resolvedVariables } = sculptPrompt(errorConsole, ctx, { guardrails: false })
    expect(resolvedVariables).toEqual([
      { key: 'rendererDir', value: 'src/renderer', label: 'Renderer' }
    ])
  })

  it('handles nested conditionals', () => {
    const tpl: PromptTemplate = {
      id: 't',
      title: 't',
      categories: ['Context'],
      stacks: ['any'],
      description: '',
      variables: [],
      guardrails: [],
      body: '{{#if isElectron}}outer{{#if isTypeScript}} and ts{{/if}}{{else}}web{{/if}} done'
    }
    const ctx = buildContext(electronProfile())
    expect(sculptPrompt(tpl, ctx, { guardrails: false }).sculptedText).toBe('outer and ts done')
  })
})

describe('filterTemplates', () => {
  const web: PromptTemplate = { ...errorConsole, id: 'web-only', stacks: ['next', 'react'] }
  const list = [errorConsole, web]

  it('shows any-stack and stack-matching templates', () => {
    expect(filterTemplates(list, { stacks: ['next', 'react', 'any'] })).toHaveLength(2)
  })

  it('hides templates that do not match the stack', () => {
    const result = filterTemplates(list, { stacks: ['electron', 'any'] })
    expect(result.map((t) => t.id)).toEqual(['sec-error-console'])
  })

  it('filters by category and query', () => {
    expect(filterTemplates(list, { stacks: ['any'], category: 'Debugging' })).toHaveLength(1)
    expect(filterTemplates(list, { stacks: ['next', 'react', 'any'], query: 'console' })).toHaveLength(2)
    expect(filterTemplates(list, { stacks: ['any'], query: 'console' })).toHaveLength(1)
    expect(filterTemplates(list, { stacks: ['any'], query: 'nonexistent' })).toHaveLength(0)
  })
})

describe('isTemplateVisible', () => {
  it('respects the any wildcard', () => {
    expect(isTemplateVisible(errorConsole, ['python'])).toBe(true)
  })
})
