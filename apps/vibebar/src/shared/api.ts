import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import type { DetachablePanelId } from './tools.js'
import type {
  AuditExportResult,
  AuditAcceptRiskResult,
  AuditConfigView,
  AuditReport,
  CopyResult,
  DisplayInfo,
  DockSide,
  GitDiffCopyResult,
  GitHubOpenResult,
  GitStatus,
  HistoryEntry,
  NoteDetail,
  NotesState,
  McpServerStatus,
  OnboardingState,
  OverlayLayout,
  PackChangedPreview,
  PackNode,
  PackResult,
  PreviewResult,
  ProjectAiDocs,
  ProjectMemoryDiff,
  ProjectStackOverrides,
  ProjectProfile,
  PromptListResult,
  QuickLaunchApp,
  RecentProject,
  QuickLaunchResult,
  ReadyCheckResult,
  PrepareCursorResult,
  ScanResult,
  SessionAppendInput,
  SessionHandoffResult,
  SessionState,
  IntentContract,
  SnipCapture,
  SnipSaveResult,
  ResourceSnapshot,
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
  githubDesktopPath: string
  mcpStatus: McpServerStatus
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
    setPanel: (open: boolean, panelId?: DetachablePanelId) => Promise<OverlayLayout>
    /** Force the toolbar visible and reset its dock position (recovery). */
    resetToolbar: () => Promise<{ ok: true }>
    /** Collapse any expanded panel shell (fixes empty wide overlay). */
    collapsePanel: () => Promise<{ ok: true }>
    /** Expand/collapse the overlay window for the full-screen command palette modal. */
    setCommandPalette: (open: boolean) => Promise<OverlayLayout>
    /** Records this overlay as the one the user last interacted with (for hotkey routing). */
    setActive: () => Promise<void>
    /** Notifies main that the user is dragging this toolbar (suppresses premature snap). */
    dragBegin: () => Promise<void>
    /** Notifies main that the drag finished; snaps to the nearest monitor edge. */
    dragEnd: (cursor: { x: number; y: number }) => Promise<void>
    /** Confirms the renderer painted the new dock layout — main may resize the window. */
    layoutReady: () => Promise<void>
    onLayout: (cb: (layout: OverlayLayout) => void) => () => void
    /** Fires when the command palette should open or close on this display. */
    onCommandPalette: (cb: (state: { open: boolean }) => void) => () => void
  }
  project: {
    select: () => Promise<ProjectProfile | null>
    get: () => Promise<ProjectProfile | null>
    /** Recently opened project folders (paths validated on disk). */
    listRecents: () => Promise<RecentProject[]>
    /** Opens a recent project by absolute path. */
    openRecent: (path: string) => Promise<ProjectProfile | null>
    /** Creates the AI context folder at the project root (no-op if it already exists). */
    addContextFolder: () => Promise<ProjectProfile | null>
    /** Reveals the project's AI context folder in the OS file explorer (creates it if missing). */
    openContextFolder: () => Promise<{ ok: boolean; error?: string }>
    /** Reads AGENTS.md, Cursor rules, and AI context README from the active project. */
    getAiDocs: () => Promise<ProjectAiDocs>
    /** Appends markdown to AGENTS.md (creates the file if missing). */
    appendAgentsMd: (markdown: string) => Promise<{ ok: boolean; error?: string }>
    /** Compare AI docs vs live repo drift signals. */
    getMemoryDiff: () => Promise<ProjectMemoryDiff>
    getStackOverrides: () => Promise<ProjectStackOverrides>
    saveStackOverrides: (overrides: ProjectStackOverrides) => Promise<ProjectStackOverrides>
    clearStackOverrides: () => Promise<ProjectStackOverrides>
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
    pack: (paths: string[], tier?: import('./contextPackTier.js').ContextPackTier) => Promise<PackResult>
    /** Estimates size for git-changed files before packing. */
    previewChanged: () => Promise<PackChangedPreview>
    /** Packs git-changed files and copies to clipboard. */
    packChanged: (tier?: import('./contextPackTier.js').ContextPackTier) => Promise<PackResult>
    /** Resolves file paths for a preset (tests, config, entry). */
    presetPaths: (preset: 'tests' | 'config' | 'entry') => Promise<{ paths: string[]; noProject?: boolean }>
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
    /** Issue count + visibility for bridge hints. */
    getHints: () => Promise<{ issueCount: number; isOpen: boolean }>
    /** Fires whenever the Smart Terminal is shown or hidden/closed. */
    onVisibility: (cb: (state: { visible: boolean }) => void) => () => void
  }
  audit: {
    run: () => Promise<AuditReport>
    /** Runs the deep repo scan and surfaces findings live in the Smart Terminal. */
    scan: () => Promise<{ visible: boolean; findings: number; noProject: boolean }>
    /** Exports the latest report as SARIF 2.1.0, prompting for a save location. */
    exportSarif: () => Promise<AuditExportResult>
    /** Exports the latest report as a Markdown report, prompting for a save location. */
    exportMarkdown: () => Promise<AuditExportResult>
    /** Returns the project's audit config view (.vibebar-audit.json). */
    getConfig: () => Promise<AuditConfigView>
    /** Adds a finding fingerprint to the accepted-risk baseline. */
    acceptRisk: (fingerprint: string) => Promise<AuditAcceptRiskResult>
    /** Enables or disables a rule in the project audit config. */
    setRuleDisabled: (ruleId: string, disabled: boolean) => Promise<AuditConfigView>
  }
  github: {
    /** Opens GitHub Desktop on the active project so the user can commit/push. */
    open: () => Promise<GitHubOpenResult>
    getDesktopPath: () => Promise<{ path: string }>
    setDesktopPath: (path: string) => Promise<{ path: string }>
    locateDesktop: () => Promise<{ path: string }>
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
    /** Copies staged + unstaged diff as an AI-ready, redacted prompt. */
    copyDiffPrompt: () => Promise<GitDiffCopyResult>
    /** Changed paths (staged, unstaged, untracked) for the active repo. */
    changedFiles: () => Promise<string[]>
  }
  readyCheck: {
    /** Aggregates git, audit, terminal, secrets, and project signals into a tri-state result. */
    get: () => Promise<ReadyCheckResult>
    /** Copies the AI-ready review prompt to the clipboard. */
    copyReviewPrompt: () => Promise<{ copied: boolean; text: string }>
    copyUntrackedSummary: () => Promise<{ copied: boolean; text: string }>
    copyDependencyReview: () => Promise<{ copied: boolean; text: string }>
    copyRegressionContext: () => Promise<{ copied: boolean; text: string }>
  }
  notes: {
    /** Current Notes state for the active project (folder presence, name, catalog). */
    getState: () => Promise<NotesState>
    /** First-run setup: create the Notes folder, name it, and optionally git-ignore it. */
    init: (projectName: string, addToGitignore: boolean) => Promise<NotesState>
    /** Creates an empty note; returns its id and the refreshed state. */
    create: (title: string) => Promise<{ id: string; state: NotesState }>
    /** Loads a single note's title + Markdown body. */
    read: (id: string) => Promise<NoteDetail | null>
    /** Saves a note's title + Markdown body; returns the refreshed state. */
    save: (id: string, title: string, markdown: string) => Promise<NotesState>
    /** Deletes a note; returns the refreshed state. */
    remove: (id: string) => Promise<NotesState>
    /** Renames the notes project (library header label). */
    setProjectName: (projectName: string) => Promise<NotesState>
    /** Pops a note out into its own always-on-top sticky window (or focuses an open one). */
    popOut: (id: string) => Promise<{ ok: boolean }>
    /** Appends Markdown to an existing note. */
    appendMarkdown: (id: string, markdown: string) => Promise<NotesState>
    /** Finds or creates the "Session log" note for quick captures. */
    findSessionLog: () => Promise<{ id: string; state: NotesState }>
    /** Fires when notes change anywhere, so panels and sticky windows stay in sync. */
    onChanged: (cb: (state: NotesState) => void) => () => void
  }
  session: {
    getState: () => Promise<SessionState>
    append: (entry: SessionAppendInput) => Promise<SessionState>
    togglePin: (id: string) => Promise<SessionState>
    clear: () => Promise<SessionState>
    copyHandoff: (includeGitDiff?: boolean, pinRecentIfEmpty?: number) => Promise<SessionHandoffResult>
    /** Copies only pinned audit/terminal fix prompts (not the narrative handoff). */
    copyFixPrompts: () => Promise<SessionHandoffResult>
    /** Sets the active intent contract (current task) for this project session. */
    setIntent: (intent: Omit<IntentContract, 'updatedAt'>) => Promise<SessionState>
    clearIntent: () => Promise<SessionState>
    /** Re-runs the verify command attached to a pinned fix entry in Smart Terminal. */
    rerunVerify: (entryId: string) => Promise<{ accepted: boolean; reason?: string }>
    onChanged: (cb: (state: SessionState) => void) => () => void
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
  resources: {
    /** A resource widget subscribes to receive each polled system-usage snapshot. */
    onPush: (cb: (snapshot: ResourceSnapshot) => void) => () => void
  }
  quickLaunch: {
    /** Lists configured quick-launch apps (built-in Cursor/Codex + any the user added). */
    list: () => Promise<QuickLaunchApp[]>
    /** Launches an app by id, opening the active project folder when one is selected. */
    run: (
      id: string,
      options?: { pasteAfterOpen?: boolean; fromCopyToast?: boolean }
    ) => Promise<QuickLaunchResult>
    /** Builds Cursor bootstrap, copies to clipboard, opens Cursor on project path. */
    prepareCursor: () => Promise<PrepareCursorResult>
    /** Opens a native picker to add a new app; returns the updated list. */
    add: () => Promise<QuickLaunchApp[]>
    /** Removes an app by id; returns the updated list. */
    remove: (id: string) => Promise<QuickLaunchApp[]>
    /** Opens a native picker to set/replace an app's executable path; returns the updated list. */
    locate: (id: string) => Promise<QuickLaunchApp[]>
    /** Shows/hides an app in the toolbar (it stays listed in Settings); returns the updated list. */
    setVisible: (id: string, visible: boolean) => Promise<QuickLaunchApp[]>
    /** Fires when the app list changes (kept in sync across overlay + detached windows). */
    onChanged: (cb: (apps: QuickLaunchApp[]) => void) => () => void
  }
  mcp: {
    /** Returns MCP server enabled/running state and Cursor mcp.json snippet. */
    getStatus: () => Promise<McpServerStatus>
    onChanged: (cb: (status: McpServerStatus) => void) => () => void
  }
  app: {
    quit: () => Promise<{ ok: boolean }>
    /** First-run onboarding visibility state. */
    getOnboardingState: () => Promise<OnboardingState>
    /** Marks onboarding complete (skip / don't show again). */
    completeOnboarding: () => Promise<OnboardingState>
    /** Re-opens the onboarding wizard from Settings. */
    showOnboardingAgain: () => Promise<OnboardingState>
    /** Opens the centered "Close Vibe Bar" confirmation popup (the toolbar power button). */
    confirmQuit: () => Promise<{ ok: boolean }>
    /** Dismisses the confirmation popup without quitting (its "No" button). */
    cancelQuit: () => Promise<{ ok: boolean }>
  }
}
