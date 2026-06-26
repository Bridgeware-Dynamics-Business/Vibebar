import type {
  NotesState,
  ProjectCommand,
  SessionAppendInput,
  SessionState,
  ShellReady,
  ShellType,
  TerminalIssueUpdate,
  TerminalState,
  TerminalStatus
} from './types.js'

/**
 * One of the eight compass directions a resize grip can pull. Combined edges (corners) move two
 * sides at once. Used by the renderer's resize handles and validated on the main side.
 */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * The typed bridge exposed to the Smart Terminal renderer as `window.terminal`. The terminal
 * runs in its own frameless always-on-top window; it reaches the main process only through
 * these methods, every one of which is an allowlisted, Zod-validated channel.
 */
export interface TerminalBridge {
  getState: () => Promise<TerminalState>
  run: (command: string) => Promise<{ accepted: boolean; reason?: string }>
  cancel: () => Promise<{ ok: boolean }>
  clear: () => Promise<{ ok: boolean }>
  hide: () => Promise<{ ok: boolean }>
  /** Snapshots the window's current bounds as the anchor for an interactive resize drag. */
  resizeStart: () => Promise<{ ok: boolean }>
  /**
   * Resizes the window relative to the snapshot taken by {@link resizeStart}. `dx`/`dy` are the
   * cumulative cursor delta (in screen pixels) since the drag began, so out-of-order delivery
   * still converges on the latest size.
   */
  resize: (edge: ResizeEdge, dx: number, dy: number) => Promise<{ ok: boolean }>
  /** Write arbitrary text to the system clipboard (used for "copy fix prompt"). */
  copy: (text: string) => Promise<{ copied: boolean }>
  /** Packages failure + MVC context into one clipboard bundle. */
  fixWithContext: (issueId?: string) => Promise<{ copied: boolean; text: string; noResult?: boolean }>
  /** Marks an issue fingerprint dismissed (persists across commands). */
  dismissIssue: (fingerprint: string) => Promise<{ ok: boolean }>
  /** Runs the full security audit and presents findings in this terminal. */
  runAudit: (quiet: boolean) => Promise<{ findings: number; noProject: boolean }>
  /** Export the latest audit report (requires a prior scan). */
  exportAuditSarif: () => Promise<{ saved: boolean; path?: string; reason?: string; fromCache?: boolean }>
  exportAuditMarkdown: () => Promise<{ saved: boolean; path?: string; reason?: string; fromCache?: boolean }>
  /** Opens Cursor on the active project via the main-process quick launcher. */
  openCursor: () => Promise<{ ok: boolean; error?: string }>
  /** Append a session timeline event (terminal runs in a separate window). */
  sessionAppend: (entry: SessionAppendInput) => Promise<SessionState>
  notes: {
    getState: () => Promise<NotesState>
    appendMarkdown: (id: string, markdown: string) => Promise<NotesState>
    findSessionLog: () => Promise<{ id: string; state: NotesState }>
  }
  /** Streamed stdout/stderr chunks for the running command. */
  onData: (cb: (chunk: string) => void) => () => void
  /** Status updates: a command started, finished (with exit code), or the cwd changed. */
  onStatus: (cb: (status: TerminalStatus) => void) => () => void
  /** Issues detected in the most recent command's output, or findings from an audit. */
  onIssues: (cb: (update: TerminalIssueUpdate) => void) => () => void

  /**
   * The built-in interactive shell — a persistent cmd/PowerShell process rooted at the active
   * project, surfaced as an expandable terminal at the bottom of the Smart Terminal window.
   */
  shell: {
    /** Spawns (or reuses) the interactive shell with the given shell program. */
    start: (shell: ShellType) => Promise<{ ok: boolean }>
    /** Sends one entered command line to the shell. */
    input: (line: string) => Promise<{ ok: boolean }>
    /** Switches the shell program, restarting the session. */
    setShell: (shell: ShellType) => Promise<{ ok: boolean }>
    /** Tears down the interactive shell process. */
    stop: () => Promise<{ ok: boolean }>
    /** Suggested copy/run-able commands for the active project. */
    projectCommands: () => Promise<ProjectCommand[]>
    /** Streamed stdout/stderr from the interactive shell. */
    onData: (cb: (chunk: string) => void) => () => void
    /** Fires when a command completes and the shell is ready for the next prompt. */
    onReady: (cb: (ready: ShellReady) => void) => () => void
    /** Fires when the shell process exits/closes. */
    onClosed: (cb: () => void) => () => void
  }
}
