import type {
  DetectedIssue,
  ProjectCommand,
  ShellReady,
  ShellType,
  TerminalState,
  TerminalStatus
} from './types.js'

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
  /** Write arbitrary text to the system clipboard (used for "copy fix prompt"). */
  copy: (text: string) => Promise<{ copied: boolean }>
  /** Runs the full security audit and presents findings in this terminal. */
  runAudit: (quiet: boolean) => Promise<{ findings: number; noProject: boolean }>
  /** Streamed stdout/stderr chunks for the running command. */
  onData: (cb: (chunk: string) => void) => () => void
  /** Status updates: a command started, finished (with exit code), or the cwd changed. */
  onStatus: (cb: (status: TerminalStatus) => void) => () => void
  /** Issues detected in the most recent command's output, or findings from an audit. */
  onIssues: (cb: (issues: DetectedIssue[]) => void) => () => void

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
