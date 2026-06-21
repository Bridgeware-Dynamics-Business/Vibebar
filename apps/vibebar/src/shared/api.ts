import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import type { DetachablePanelId } from './tools.js'
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
  QuickLaunchApp,
  QuickLaunchResult,
  ScanResult,
  SnipCapture,
  SnipSaveResult,
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

/**
 * A single captured runtime error from a renderer. Every string field is already redacted by the
 * originating renderer (see renderer/shared/redactErrors) before it crosses IPC, so nothing here
 * should contain a live secret or full user path.
 */
export interface ErrorReport {
  /** Stable id for de-duped list rendering (timestamp + counter). */
  id: string
  kind: 'error' | 'unhandledrejection'
  message: string
  source: string
  line: number | null
  column: number | null
  stack: string
  /** ISO-8601 capture time. */
  timestamp: string
}

/** The full bridge exposed to the overlay renderer as `window.vibebar`. */
export interface VibeBarApi {
  overlay: {
    getState: () => Promise<OverlayState>
    setDock: (dock: DockSide) => Promise<OverlayLayout>
    setPanel: (open: boolean) => Promise<OverlayLayout>
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
  panel: {
    /** Toggles a panel's detached, floating window (pops it out / hides it back). */
    detach: (panelId: DetachablePanelId) => Promise<{ visible: boolean }>
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
  snip: {
    /**
     * Freezes the display under the cursor and opens the fullscreen snip overlay so the user can
     * drag a selection box over the still image.
     */
    start: () => Promise<{ ok: boolean; error?: string }>
    /** The overlay calls this on load to fetch the frozen screenshot it draws the selection over. */
    getCapture: () => Promise<SnipCapture | null>
    /**
     * Saves the cropped PNG (data URL) into the AI context folder, returning a paste-ready prompt.
     * An optional `fileName` lets the user name the file; it is sanitized and `.png`-suffixed in
     * the main process, falling back to a timestamped default when blank or invalid.
     */
    save: (dataUrl: string, fileName?: string) => Promise<SnipSaveResult>
    /** Closes the snip overlay without saving. */
    cancel: () => Promise<{ ok: boolean }>
  }
  git: {
    getStatus: () => Promise<GitStatus>
    onStatusChanged: (cb: (status: GitStatus) => void) => () => void
  }
  errors: {
    /** Forwards one captured, already-redacted error to the console window (auto-opens it). */
    report: (report: ErrorReport) => Promise<{ ok: boolean }>
    /** Empties the console's error buffer (the console's Clear button). */
    clear: () => Promise<{ ok: boolean }>
    /** Hides the console window until the next error arrives (the console's Close button). */
    close: () => Promise<{ ok: boolean }>
    /** The console window subscribes to receive the current (capped, newest-first) error list. */
    onPush: (cb: (reports: ErrorReport[]) => void) => () => void
  }
  quickLaunch: {
    /** Lists configured quick-launch apps (built-in Cursor/Codex + any the user added). */
    list: () => Promise<QuickLaunchApp[]>
    /** Launches an app by id, opening the active project folder when one is selected. */
    run: (id: string) => Promise<QuickLaunchResult>
    /** Opens a native picker to add a new app; returns the updated list. */
    add: () => Promise<QuickLaunchApp[]>
    /** Removes an app by id; returns the updated list. */
    remove: (id: string) => Promise<QuickLaunchApp[]>
    /** Opens a native picker to set/replace an app's executable path; returns the updated list. */
    locate: (id: string) => Promise<QuickLaunchApp[]>
    /** Fires when the app list changes (kept in sync across overlay + detached windows). */
    onChanged: (cb: (apps: QuickLaunchApp[]) => void) => () => void
  }
  app: {
    quit: () => Promise<{ ok: boolean }>
  }
}
