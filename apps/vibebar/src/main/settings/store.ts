import type { CodeSyncConfig } from '@vibebar/codesync'
import { DEFAULT_DEBOUNCE_MS, DEFAULT_MAX_FILE_BYTES } from '@vibebar/codesync'
import type { PromptTemplate } from '@vibebar/prompt-engine'
import Store from 'electron-store'
import type { DisplayLayout, DockSide, HistoryEntry, VibeSettings } from '@shared/types.js'

interface StoreSchema {
  settings: VibeSettings
  activeProjectPath: string
  customPrompts: PromptTemplate[]
  favorites: string[]
  history: HistoryEntry[]
  codesync: CodeSyncConfig
  /** GitHub integration config (e.g. a custom GitHub Desktop launcher path). */
  github: { desktopPath: string }
  /** Per-display dock + anchor, keyed by display id, so each monitor's bar stays where placed. */
  displayLayouts: Record<string, DisplayLayout>
}

const DEFAULT_SETTINGS: VibeSettings = {
  dock: 'left',
  enabledDisplayIds: [],
  guardrailsEnabled: true,
  launchOnStartup: false
}

const HISTORY_LIMIT = 50

/**
 * Typed, namespaced persistence for VibeBar. Wraps a single electron-store instance so the
 * rest of the app never touches raw keys, and groups Code Sync config under its own key.
 */
export class AppStore {
  private readonly store: Store<StoreSchema>

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'vibebar',
      defaults: {
        settings: DEFAULT_SETTINGS,
        activeProjectPath: '',
        customPrompts: [],
        favorites: [],
        history: [],
        codesync: {
          instances: [],
          ignoreText: '',
          maxFileBytes: DEFAULT_MAX_FILE_BYTES,
          debounceMs: DEFAULT_DEBOUNCE_MS
        },
        github: { desktopPath: '' },
        displayLayouts: {}
      }
    })
  }

  getSettings(): VibeSettings {
    return { ...DEFAULT_SETTINGS, ...this.store.get('settings') }
  }

  saveSettings(partial: Partial<VibeSettings>): VibeSettings {
    const next = { ...this.getSettings(), ...partial }
    this.store.set('settings', next)
    return next
  }

  setDock(dock: DockSide): VibeSettings {
    return this.saveSettings({ dock })
  }

  getDisplayLayouts(): Record<string, DisplayLayout> {
    return this.store.get('displayLayouts') ?? {}
  }

  getDisplayLayout(id: string): DisplayLayout | null {
    return this.getDisplayLayouts()[id] ?? null
  }

  setDisplayLayout(id: string, layout: DisplayLayout): void {
    this.store.set('displayLayouts', { ...this.getDisplayLayouts(), [id]: layout })
  }

  getActiveProjectPath(): string {
    return this.store.get('activeProjectPath') || ''
  }

  setActiveProjectPath(path: string): void {
    this.store.set('activeProjectPath', path)
  }

  getCustomPrompts(): PromptTemplate[] {
    return this.store.get('customPrompts') ?? []
  }

  upsertCustomPrompt(prompt: PromptTemplate): PromptTemplate[] {
    const existing = this.getCustomPrompts().filter((p) => p.id !== prompt.id)
    const next = [...existing, prompt]
    this.store.set('customPrompts', next)
    return next
  }

  deleteCustomPrompt(id: string): PromptTemplate[] {
    const next = this.getCustomPrompts().filter((p) => p.id !== id)
    this.store.set('customPrompts', next)
    return next
  }

  getFavorites(): string[] {
    return this.store.get('favorites') ?? []
  }

  toggleFavorite(id: string): string[] {
    const current = this.getFavorites()
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    this.store.set('favorites', next)
    return next
  }

  getHistory(): HistoryEntry[] {
    return this.store.get('history') ?? []
  }

  addHistory(entry: HistoryEntry): HistoryEntry[] {
    const next = [entry, ...this.getHistory().filter((h) => h.promptId !== entry.promptId)].slice(
      0,
      HISTORY_LIMIT
    )
    this.store.set('history', next)
    return next
  }

  /** Optional override path to the GitHub Desktop launcher; empty means auto-detect. */
  getGitHubDesktopPath(): string {
    return this.store.get('github')?.desktopPath ?? ''
  }

  setGitHubDesktopPath(desktopPath: string): void {
    this.store.set('github', { desktopPath })
  }

  getCodeSyncConfig(): CodeSyncConfig {
    return this.store.get('codesync')
  }

  saveCodeSyncConfig(partial: Partial<CodeSyncConfig>): void {
    this.store.set('codesync', { ...this.getCodeSyncConfig(), ...partial })
  }
}
