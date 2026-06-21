import { clipboard } from 'electron'
import {
  buildContext,
  sculptPrompt,
  type GuardrailId,
  type PromptCategory,
  type PromptTemplate
} from '@vibebar/prompt-engine'
import { getBuiltInPrompts } from '@vibebar/prompt-packs'
import { emptyProfile, type ProjectProfile } from '@vibebar/project-detector'
import type { CopyResult, PreviewResult, PromptListResult } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { scanText } from '../scanner/secretScanner.js'
import type { AppStore } from '../settings/store.js'

const CATEGORY_GUARDRAILS: Partial<Record<PromptCategory, GuardrailId[]>> = {
  Security: ['no-secrets', 'no-innerHTML'],
  Database: ['parameterized-queries', 'no-secrets'],
  Auth: ['validate-input', 'no-secrets'],
  Deploy: ['no-secrets'],
  Testing: ['validate-input']
}

export class PromptStore {
  private readonly store: AppStore
  private readonly projects: ProjectService

  constructor(store: AppStore, projects: ProjectService) {
    this.store = store
    this.projects = projects
  }

  private profile(): ProjectProfile {
    return this.projects.getProfile() ?? emptyProfile('', 'No project selected')
  }

  /** Built-in + user prompts, with the per-user favorite flag applied. */
  allPrompts(): PromptTemplate[] {
    const favorites = new Set(this.store.getFavorites())
    const merged = [...getBuiltInPrompts(), ...this.store.getCustomPrompts()]
    return merged.map((p) => ({ ...p, favorite: favorites.has(p.id) }))
  }

  private find(id: string): PromptTemplate | undefined {
    return this.allPrompts().find((p) => p.id === id)
  }

  list(): PromptListResult {
    return {
      prompts: this.allPrompts(),
      favorites: this.store.getFavorites(),
      guardrailsEnabled: this.store.getSettings().guardrailsEnabled,
      stacks: this.projects.stacks()
    }
  }

  preview(promptId: string, guardrailsOverride?: boolean): PreviewResult {
    const template = this.find(promptId)
    if (!template) return { text: '', resolvedVariables: [] }
    const guardrails = guardrailsOverride ?? this.store.getSettings().guardrailsEnabled
    const result = sculptPrompt(template, buildContext(this.profile()), { guardrails })
    return { text: result.sculptedText, resolvedVariables: result.resolvedVariables }
  }

  copy(promptId: string): CopyResult {
    const template = this.find(promptId)
    if (!template) {
      return { copied: false, text: '', resolvedVariables: [], findings: [] }
    }
    const guardrails = this.store.getSettings().guardrailsEnabled
    const result = sculptPrompt(template, buildContext(this.profile()), { guardrails })
    const scan = scanText(result.sculptedText)

    let copied = false
    try {
      clipboard.writeText(result.sculptedText)
      copied = true
    } catch {
      copied = false
    }

    this.store.addHistory({ promptId, title: template.title, at: Date.now() })
    return {
      copied,
      text: result.sculptedText,
      resolvedVariables: result.resolvedVariables,
      findings: scan.findings
    }
  }

  toggleFavorite(promptId: string): PromptListResult {
    this.store.toggleFavorite(promptId)
    return this.list()
  }

  create(template: PromptTemplate): PromptListResult {
    this.store.upsertCustomPrompt({ ...template, builtIn: false })
    return this.list()
  }

  delete(promptId: string): PromptListResult {
    this.store.deleteCustomPrompt(promptId)
    return this.list()
  }

  /** Builds a pre-filled skeleton seeded from the detected stack for the New Prompt editor. */
  newDraft(category: PromptCategory): PromptTemplate {
    const profile = this.profile()
    const primaryStack = profile.framework !== 'unknown' ? profile.framework : 'any'
    return {
      id: `custom-${Date.now()}`,
      title: '',
      categories: [category],
      stacks: [primaryStack],
      description: '',
      variables: [
        { key: 'framework', source: 'framework', default: 'your app', label: 'Framework' }
      ],
      guardrails: CATEGORY_GUARDRAILS[category] ?? ['no-secrets'],
      body: [
        `You are working on my {{framework}} project written in {{language}}.`,
        '',
        'Describe what you want here. Reference {{framework}} where it helps.',
        '',
        '{{#if isElectron}}Keep Electron security intact (contextIsolation true, sandbox true).{{else}}Follow security best practices for this stack.{{/if}}'
      ].join('\n'),
      builtIn: false,
      favorite: false,
      usageCount: 0
    }
  }

  setGuardrails(enabled: boolean): PromptListResult {
    this.store.saveSettings({ guardrailsEnabled: enabled })
    return this.list()
  }

  history(): ReturnType<AppStore['getHistory']> {
    return this.store.getHistory()
  }
}
