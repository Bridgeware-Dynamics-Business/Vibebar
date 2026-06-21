import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import type {
  AuditReport,
  CopyResult,
  DisplayInfo,
  DockSide,
  GitHubOpenResult,
  GitStatus,
  HistoryEntry,
  OverlayLayout,
  PackNode,
  PackResult,
  PreviewResult,
  ProjectProfile,
  PromptListResult,
  ScanResult,
  VibeSettings
} from './types.js'

export interface OverlayState {
  layout: OverlayLayout
  settings: VibeSettings
  profile: ProjectProfile | null
}

export interface SettingsState {
  settings: VibeSettings
  displays: DisplayInfo[]
}

export interface RedactedCopyResult {
  copied: boolean
  redactedText: string
}

/** The full bridge exposed to the overlay renderer as `window.vibebar`. */
export interface VibeBarApi {
  overlay: {
    getState: () => Promise<OverlayState>
    setDock: (dock: DockSide) => Promise<OverlayLayout>
    setPanel: (open: boolean, extent?: number) => Promise<OverlayLayout>
    onLayout: (cb: (layout: OverlayLayout) => void) => () => void
  }
  project: {
    select: () => Promise<ProjectProfile | null>
    get: () => Promise<ProjectProfile | null>
    /** Creates the AI context folder at the project root (no-op if it already exists). */
    addContextFolder: () => Promise<ProjectProfile | null>
    /** Reveals the project's AI context folder in the OS file explorer (creates it if missing). */
    openContextFolder: () => Promise<{ ok: boolean; error?: string }>
    onChanged: (cb: (profile: ProjectProfile | null) => void) => () => void
  }
  prompts: {
    list: () => Promise<PromptListResult>
    preview: (promptId: string, guardrails?: boolean) => Promise<PreviewResult>
    copy: (promptId: string) => Promise<CopyResult>
    toggleFavorite: (promptId: string) => Promise<PromptListResult>
    create: (template: PromptTemplate) => Promise<PromptListResult>
    remove: (promptId: string) => Promise<PromptListResult>
    newDraft: (category: PromptCategory) => Promise<PromptTemplate>
    history: () => Promise<HistoryEntry[]>
    setGuardrails: (enabled: boolean) => Promise<PromptListResult>
  }
  scanner: {
    scan: (text: string) => Promise<ScanResult>
    copyRedacted: (text: string) => Promise<RedactedCopyResult>
  }
  packer: {
    tree: (dir: string) => Promise<PackNode[]>
    pack: (paths: string[]) => Promise<PackResult>
  }
  clipboard: {
    write: (text: string) => Promise<{ copied: boolean }>
  }
  settings: {
    get: () => Promise<SettingsState>
    save: (partial: Partial<VibeSettings>) => Promise<SettingsState>
    displays: () => Promise<DisplayInfo[]>
  }
  codesync: {
    toggle: () => Promise<{ visible: boolean }>
  }
  promptLibrary: {
    /** Toggles the detached, floating Prompt Library window. */
    toggle: () => Promise<{ visible: boolean }>
  }
  terminal: {
    toggle: () => Promise<{ visible: boolean }>
    /** Whether the Smart Terminal window is currently open and visible. */
    isOpen: () => Promise<{ open: boolean }>
    /** Fires whenever the Smart Terminal is shown or hidden/closed. */
    onVisibility: (cb: (state: { visible: boolean }) => void) => () => void
  }
  audit: {
    run: () => Promise<AuditReport>
    /** Runs the deep repo scan and surfaces findings live in the Smart Terminal. */
    scan: () => Promise<{ visible: boolean; findings: number; noProject: boolean }>
  }
  github: {
    /** Opens GitHub Desktop on the active project so the user can commit/push. */
    open: () => Promise<GitHubOpenResult>
  }
  git: {
    getStatus: () => Promise<GitStatus>
    onStatusChanged: (cb: (status: GitStatus) => void) => () => void
  }
  app: {
    quit: () => Promise<{ ok: boolean }>
  }
}
