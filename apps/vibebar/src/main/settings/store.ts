import type { CodeSyncConfig } from '@vibebar/codesync'
import { DEFAULT_DEBOUNCE_MS, DEFAULT_MAX_FILE_BYTES } from '@vibebar/codesync'
import type { PromptTemplate } from '@vibebar/prompt-engine'
import Store from 'electron-store'
import type {
  DisplayLayout,
  DockSide,
  HistoryEntry,
  QuickLaunchApp,
  RecentProject,
  VibeSettings,
  WindowBounds,
  ProjectStackOverrides
} from '@shared/types.js'
import { pruneRecentProjects, pushRecentProject } from '../project/recentProjects.js'

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
  /** One-click toolbar launchers; seeded with Cursor + Codex on first run. */
  quickLaunch: QuickLaunchApp[]
  /** Last opened project folders (most recent first). */
  recentProjects: RecentProject[]
  /** Persisted bounds per detached panel id. */
  panelBounds: Record<string, WindowBounds>
  /** Persisted Smart Terminal window bounds. */
  terminalBounds: WindowBounds | null
  /** When true, the first-run onboarding wizard is suppressed. */
  onboardingComplete: boolean
  /** When true, Settings replay opens the wizard even if a project is selected. */
  onboardingReplayRequested: boolean
  /** Per-project cursor rules count snapshot for memory drift detection. */
  projectMemorySnapshots: Record<string, { cursorRulesCount: number; updatedAt: number }>
  /** Per-project manual stack overrides when detection is unknown. */
  stackOverrides: Record<string, ProjectStackOverrides>
}

const DEFAULT_SETTINGS: VibeSettings = {
  dock: 'left',
  enabledDisplayIds: [],
  errorConsoleDisplayIds: [],
  guardrailsEnabled: true,
  launchOnStartup: false,
  hotkeysEnabled: true,
  mcpServerEnabled: false,
  pasteAfterOpenCursor: false,
  prePasteSafetyGate: true,
  autoPinFixWithContext: false,
  autoRunVerifyAfterFix: false
}

/**
 * Built-in quick-launch editors seeded on first run. Paths start empty and are filled by
 * auto-detection (see QuickLaunchService) or by the user via the Settings file picker.
 */
const DEFAULT_QUICK_LAUNCH: QuickLaunchApp[] = [
  { id: 'cursor', name: 'Cursor', path: '', icon: 'MousePointer2', builtIn: true },
  { id: 'codex', name: 'Codex', path: '', icon: 'Code2', builtIn: true }
]

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
        displayLayouts: {},
        quickLaunch: DEFAULT_QUICK_LAUNCH,
        recentProjects: [],
        panelBounds: {},
        terminalBounds: null,
        onboardingComplete: false,
        onboardingReplayRequested: false,
        projectMemorySnapshots: {},
        stackOverrides: {}
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

  clearDisplayLayouts(): void {
    this.store.set('displayLayouts', {})
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

  getQuickLaunchApps(): QuickLaunchApp[] {
    return this.store.get('quickLaunch') ?? DEFAULT_QUICK_LAUNCH
  }

  setQuickLaunchApps(apps: QuickLaunchApp[]): QuickLaunchApp[] {
    this.store.set('quickLaunch', apps)
    return apps
  }

  addQuickLaunchApp(app: QuickLaunchApp): QuickLaunchApp[] {
    return this.setQuickLaunchApps([...this.getQuickLaunchApps(), app])
  }

  updateQuickLaunchApp(id: string, patch: Partial<QuickLaunchApp>): QuickLaunchApp[] {
    const next = this.getQuickLaunchApps().map((app) =>
      app.id === id ? { ...app, ...patch } : app
    )
    return this.setQuickLaunchApps(next)
  }

  removeQuickLaunchApp(id: string): QuickLaunchApp[] {
    return this.setQuickLaunchApps(this.getQuickLaunchApps().filter((app) => app.id !== id))
  }

  getRecentProjects(): RecentProject[] {
    return this.store.get('recentProjects') ?? []
  }

  /** Returns recents with missing paths pruned from persistence. */
  getRecentProjectsValid(exists: (path: string) => boolean): RecentProject[] {
    const pruned = pruneRecentProjects(this.getRecentProjects(), exists)
    if (pruned.length !== this.getRecentProjects().length) {
      this.store.set('recentProjects', pruned)
    }
    return pruned
  }

  pushRecentProject(path: string, label: string): RecentProject[] {
    const next = pushRecentProject(this.getRecentProjects(), { path, label })
    this.store.set('recentProjects', next)
    return next
  }

  getPanelBounds(panelId: string): WindowBounds | null {
    return this.store.get('panelBounds')?.[panelId] ?? null
  }

  setPanelBounds(panelId: string, bounds: WindowBounds): void {
    const all = this.store.get('panelBounds') ?? {}
    this.store.set('panelBounds', { ...all, [panelId]: bounds })
  }

  getTerminalBounds(): WindowBounds | null {
    return this.store.get('terminalBounds') ?? null
  }

  setTerminalBounds(bounds: WindowBounds): void {
    this.store.set('terminalBounds', bounds)
  }

  isOnboardingComplete(): boolean {
    return Boolean(this.store.get('onboardingComplete'))
  }

  setOnboardingComplete(complete: boolean): void {
    this.store.set('onboardingComplete', complete)
  }

  isOnboardingReplayRequested(): boolean {
    return Boolean(this.store.get('onboardingReplayRequested'))
  }

  setOnboardingReplayRequested(requested: boolean): void {
    this.store.set('onboardingReplayRequested', requested)
  }

  getProjectMemorySnapshot(projectPath: string): { cursorRulesCount: number; updatedAt: number } | null {
    return this.store.get('projectMemorySnapshots')?.[projectPath] ?? null
  }

  setProjectMemorySnapshot(projectPath: string, cursorRulesCount: number): void {
    const all = this.store.get('projectMemorySnapshots') ?? {}
    this.store.set('projectMemorySnapshots', {
      ...all,
      [projectPath]: { cursorRulesCount, updatedAt: Date.now() }
    })
  }

  getStackOverrides(projectPath: string): ProjectStackOverrides {
    return this.store.get('stackOverrides')?.[projectPath] ?? {}
  }

  setStackOverrides(projectPath: string, overrides: ProjectStackOverrides): ProjectStackOverrides {
    const all = this.store.get('stackOverrides') ?? {}
    const next = { ...all, [projectPath]: overrides }
    this.store.set('stackOverrides', next)
    return overrides
  }

  clearStackOverrides(projectPath: string): void {
    const all = { ...(this.store.get('stackOverrides') ?? {}) }
    delete all[projectPath]
    this.store.set('stackOverrides', all)
  }
}
