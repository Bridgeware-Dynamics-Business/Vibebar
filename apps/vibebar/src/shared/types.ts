import type { ProjectProfile } from '@vibebar/project-detector'
import type { PromptCategory, PromptTemplate, ResolvedVariable } from '@vibebar/prompt-engine'

export type DockSide = 'left' | 'right' | 'top'
export type Orientation = 'vertical' | 'horizontal'

export interface OverlayLayout {
  dock: DockSide
  orientation: Orientation
}

/** Per-monitor placement of the toolbar: which edge it docks to and where along that edge. */
export interface DisplayLayout {
  dock: DockSide
  /** Free-axis position (y for left/right, x for top) in that display's work-area coordinates. */
  anchor: number
}

export interface DisplayInfo {
  id: string
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

export interface VibeSettings {
  dock: DockSide
  /** Display ids the overlay should appear on. Empty means primary display only. */
  enabledDisplayIds: string[]
  /** Display ids the in-app error console should appear on. Empty means primary display only. */
  errorConsoleDisplayIds: string[]
  guardrailsEnabled: boolean
  launchOnStartup: boolean
}

export interface ProjectInfo {
  profile: ProjectProfile | null
}

/**
 * Live working-tree state for the active project, driving the GitHub toolbar badge.
 * `changeCount` is the number of changed entries (staged + unstaged + untracked).
 */
export interface GitStatus {
  isRepo: boolean
  branch: string | null
  changeCount: number
  /** Commits ahead of the upstream branch, if one is tracked. */
  ahead: number
  /** Commits behind the upstream branch, if one is tracked. */
  behind: number
}

/** Result of asking the main process to open GitHub Desktop for the active project. */
export interface GitHubOpenResult {
  ok: boolean
  /** How the app was launched, when successful. */
  method?: 'desktop' | 'protocol'
  /** A user-facing reason when `ok` is false. */
  error?: string
}

/**
 * A user-configured external editor/app that can be launched straight from the toolbar. The
 * renderer only ever references an app by `id`; the executable `path` is set in the main process
 * (via the native file picker or built-in auto-detection) and never accepted from the renderer,
 * so the IPC surface cannot be coerced into spawning an arbitrary path.
 */
export interface QuickLaunchApp {
  id: string
  name: string
  /** Absolute path to the executable / app bundle. Empty until detected or located. */
  path: string
  /** lucide-react icon name, resolved in the renderer. */
  icon: string
  /** Seeded defaults (Cursor, Codex). Editable and removable like any custom entry. */
  builtIn?: boolean
  /**
   * Whether this app shows in the toolbar's Quick Launch cluster. Absent means visible, so
   * existing stored apps and seeded built-ins default to shown. Hidden apps still appear in
   * Settings so they can be re-shown; the toolbar condenses (drops the cluster + dividers)
   * when none are visible.
   */
  visible?: boolean
}

/** Result of asking the main process to launch a quick-launch app. */
export interface QuickLaunchResult {
  ok: boolean
  /** A user-facing reason when `ok` is false (e.g. path not set or not found). */
  error?: string
}

/**
 * A frozen screenshot of the display under the cursor, handed to the snip overlay so the user
 * can draw a selection box over a still image (Windows Snipping Tool style) rather than over a
 * moving live screen. Sized in device pixels so the renderer can map a CSS-space selection back
 * to the source pixels when cropping.
 */
export interface SnipCapture {
  /** PNG data URL of the full target display. */
  dataUrl: string
  /** Device-pixel width of the capture. */
  width: number
  /** Device-pixel height of the capture. */
  height: number
}

/** Result of saving a snipped region into the active project's AI context folder. */
export interface SnipSaveResult {
  ok: boolean
  /** File name of the saved image, e.g. "snip-20260621-090800.png". */
  fileName?: string
  /** Absolute path of the AI context folder the image landed in. */
  folderPath?: string
  /** Absolute path of the saved image file. */
  filePath?: string
  /** A ready-to-paste prompt line that points an AI assistant at the saved image. */
  prompt?: string
  /** A user-facing reason when `ok` is false (e.g. no project selected). */
  error?: string
}

export interface CopyResult {
  copied: boolean
  text: string
  resolvedVariables: ResolvedVariable[]
  findings: SecretFinding[]
}

export interface PreviewResult {
  text: string
  resolvedVariables: ResolvedVariable[]
}

export interface PromptListResult {
  prompts: PromptTemplate[]
  favorites: string[]
  guardrailsEnabled: boolean
  stacks: string[]
}

export interface HistoryEntry {
  promptId: string
  title: string
  at: number
}

export interface SecretFinding {
  kind: string
  match: string
  index: number
}

export interface ScanResult {
  findings: SecretFinding[]
  redactedText: string
}

export interface PackNode {
  path: string
  name: string
  isDir: boolean
}

export interface PackResult {
  copied: boolean
  text: string
  fileCount: number
  skipped: number
  findings: SecretFinding[]
}

export type IssueSeverity = 'error' | 'warning' | 'info'

/**
 * A problem the Smart Terminal detected in a command's output, paired with a ready-to-paste,
 * project-aware prompt the user can hand to their AI to fix it.
 */
export interface DetectedIssue {
  id: string
  severity: IssueSeverity
  title: string
  summary: string
  /** The matched output line(s) that triggered the detection. */
  evidence: string
  /** A sculpted, copy-paste prompt that guides the AI to a correct, safe fix. */
  prompt: string
  /** Optional secondary prompt — for audit findings, a behavioral test that proves the fix. */
  testPrompt?: string
  /** Optional grouping label (e.g. the audit category) shown as a chip in the terminal. */
  category?: string
  /** Where the issue came from, so the terminal can label it. Defaults to terminal output. */
  source?: 'terminal' | 'audit'
  /** The original audit severity (critical/high/medium/low), for richer chips than error/warn/info. */
  auditSeverity?: AuditSeverity
  /** Relative file path of the finding (audit findings). */
  file?: string
  /** 1-based line of the match (audit findings). */
  line?: number
  /** A numbered code frame around the match, marking the offending line (audit findings). */
  codeContext?: string
  /** Mapped weakness, e.g. "CWE-79 — ... (XSS)" (audit findings). */
  cwe?: string
  /** Industry standards mapped to this finding (audit findings). */
  references?: string[]
}

export interface TerminalRunResult {
  accepted: boolean
  reason?: string
}

export interface TerminalStatus {
  running: boolean
  cwd: string
  exitCode: number | null
  lastCommand: string | null
}

export interface TerminalState {
  status: TerminalStatus
  projectName: string | null
}

/** Shells the built-in interactive terminal can spawn. `bash` is the non-Windows fallback. */
export type ShellType = 'powershell' | 'cmd' | 'bash'

/** Emitted when the interactive shell finishes a command and is ready for the next prompt. */
export interface ShellReady {
  exitCode: number | null
}

/**
 * A suggested, copy/run-able command for the active project, derived from its package scripts,
 * detected stack, and README. Surfaced in the Smart Terminal's "Project commands" popup.
 */
export interface ProjectCommand {
  id: string
  /** Short human label, e.g. "Start dev server". */
  label: string
  /** The exact command to copy or run, e.g. "npm run dev". */
  command: string
  /** Optional one-line context for the command. */
  description?: string
  /** Grouping header, e.g. "Scripts", "Detected", "From README". */
  group: string
  /** Where the suggestion came from. */
  source: 'scripts' | 'detected' | 'readme'
}

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low'

export type AuditCategory =
  | 'Exposed Secrets'
  | 'Access Control'
  | 'Input Validation'
  | 'Auth Flow'
  | 'Supply Chain'
  | 'Config'

/**
 * A single behavioral/structural security finding. Each finding carries two prompts: one to
 * fix the code, and one to generate the runtime behavioral test that proves the fix works —
 * the layer static scanners cannot cover.
 */
export interface AuditFinding {
  id: string
  category: AuditCategory
  severity: AuditSeverity
  title: string
  detail: string
  /** Where the signal was found (relative path), if file-based. */
  file?: string
  /** 1-based line of the match, when known. */
  line?: number
  /** 1-based column of the match, when known. */
  column?: number
  /** A numbered code frame around the match (the offending line marked), like an error log. */
  codeContext?: string
  /** The mapped weakness, e.g. "CWE-798 — Use of Hard-coded Credentials". */
  cwe?: string
  /** Industry standards this maps to, e.g. ["OWASP API1:2023 — BOLA"]. */
  references?: string[]
  /** A short snippet of matched evidence. */
  evidence?: string
  fixPrompt: string
  testPrompt: string
}

export interface AuditReport {
  ranAt: number
  projectName: string | null
  scannedFiles: number
  /** Total source files that matched before the per-run scan cap was applied. */
  totalCandidates: number
  /** True when more files matched than were scanned, so the panel can warn about partial coverage. */
  truncated: boolean
  findings: AuditFinding[]
  /** True when no project is selected, so the panel can prompt the user to pick one. */
  noProject: boolean
  /** True when this run was also mirrored into the open Smart Terminal. */
  mirroredToTerminal?: boolean
}

export type { PromptCategory, PromptTemplate, ResolvedVariable, ProjectProfile }
