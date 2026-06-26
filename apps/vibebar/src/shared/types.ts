import type { ProjectProfile, ProjectFramework, ProjectLanguage, TestRunner } from '@vibebar/project-detector'
import type { PromptCategory, PromptTemplate, ResolvedVariable } from '@vibebar/prompt-engine'

export type DockSide = 'left' | 'right' | 'top'
export type Orientation = 'vertical' | 'horizontal'

export interface OverlayLayout {
  dock: DockSide
  orientation: Orientation
  /** Toolbar position along the dock edge (px from work-area start). Sent with every layout push. */
  anchorOffset?: number
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
  /** Global hotkeys (toolbar toggle, command palette, terminal). Defaults to on. */
  hotkeysEnabled: boolean
  /** Run a localhost MCP server so Cursor Agent can read VibeBar state (opt-in). */
  mcpServerEnabled?: boolean
  /** After opening Cursor from Quick Launch / copy toast, attempt one-shot paste (opt-in). */
  pasteAfterOpenCursor?: boolean
  /** Scan clipboard before paste-after-open; default on when paste is enabled. */
  prePasteSafetyGate?: boolean
  /** Pin Fix with Context session entries automatically when copied (opt-in). */
  autoPinFixWithContext?: boolean
  /** After Fix with Context copy, queue verify command in Smart Terminal (opt-in). */
  autoRunVerifyAfterFix?: boolean
}

/** Live status of the optional VibeBar MCP server. */
export interface McpServerStatus {
  enabled: boolean
  running: boolean
  port: number
  host: string
  connectionSnippet: string
  error?: string | null
  /** Epoch ms when an MCP resource or tool was last read (null until first access). */
  lastAgentAccessAt?: number | null
}

/** A recently opened project folder, persisted for quick switching. */
export interface RecentProject {
  path: string
  label: string
  /** Epoch ms when the project was last opened. */
  lastOpenedAt: number
}

/** Saved window bounds (screen coordinates). */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** First-run onboarding state exposed to the overlay renderer. */
export interface OnboardingState {
  /** True when the wizard should auto-open (no project + onboarding not dismissed). */
  show: boolean
  complete: boolean
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

/** Result of copying a git diff prompt to the clipboard. */
export interface GitDiffCopyResult {
  copied: boolean
  text: string
  findings: SecretFinding[]
  noProject?: boolean
  noChanges?: boolean
  notRepo?: boolean
  /** True when changes exist but only as untracked files (no staged/unstaged diff). */
  untrackedOnly?: boolean
  untrackedCount?: number
  /** User-facing git error when diff read failed. */
  gitError?: string
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
  /** True when paste-after-open was attempted for Cursor. */
  pasteAttempted?: boolean
  /** True when the paste bridge reported success. */
  pasteSucceeded?: boolean
  /** Shown when paste was skipped or failed — user should paste manually. */
  pasteNotice?: string
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
  /** Whether the prompt was copied to the clipboard automatically. */
  copied?: boolean
  /** A user-facing reason when `ok` is false (e.g. no project selected). */
  error?: string
}

/**
 * A note's catalog entry as shown in the Notes library. Content lives on disk in
 * `<projectRoot>/Notes/<id>.md`; the title and timestamps are mirrored in the folder's
 * JSON index so the library can render without reading every file.
 */
export interface NoteSummary {
  id: string
  title: string
  /** Epoch ms of the last save. */
  updatedAt: number
  /** Total checklist items in the note. */
  total: number
  /** Completed (checked) checklist items, for a progress hint in the library. */
  done: number
}

/** A single note's full content, loaded when opening the editor. */
export interface NoteDetail {
  id: string
  title: string
  /** The note body as Markdown (bold, bullet lists, and `- [ ]` task lists). */
  markdown: string
}

/**
 * The Notes panel's view of the active project: whether a Notes folder exists yet, its
 * user-given project name, whether it is git-ignored, and the catalog of notes. `noProject`
 * is true when no project is selected, so the panel can prompt the user to pick one.
 */
export interface NotesState {
  hasFolder: boolean
  projectName: string
  gitignored: boolean
  notes: NoteSummary[]
  noProject: boolean
}

/** Result of a Notes mutation that also returns the refreshed state for the caller. */
export interface NotesResult {
  ok: boolean
  /** A user-facing reason when `ok` is false (e.g. no project selected). */
  error?: string
  state: NotesState
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

export type AiRiskSeverity = 'warn' | 'error'

/** Heuristic risk match in pasted AI output (not secrets). */
export interface AiRiskFinding {
  kind: string
  severity: AiRiskSeverity
  match: string
  index: number
}

export interface ScanResult {
  findings: SecretFinding[]
  redactedText: string
  /** AI output risk heuristics (dangerous flags, test skips, unpinned installs, etc.). */
  risks?: AiRiskFinding[]
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
  tier?: import('./contextPackTier.js').ContextPackTier
  charBudget?: number
  usedChars?: number
}

/** Preview of git-changed files before packing (char/token estimate). */
export interface PackChangedPreview {
  paths: string[]
  charCount: number
  /** Rough token estimate (chars / 4). */
  tokenEstimate: number
  fileCount: number
  skipped: number
  noProject?: boolean
  noFiles?: boolean
}

export type VerifyPinStatus = 'awaiting' | 'verified' | 'still-broken'

export interface IntentContract {
  goal: string
  constraints: string[]
  filesInScope: string[]
  acceptanceCriteria: string[]
  verifyCommand: string | null
  updatedAt: number
}

export interface FlightCommandRecord {
  command: string
  exitCode: number | null
  timestamp: number
  isTest?: boolean
  /** Short hash of command output when recorded from verify/test runs. */
  outputHash?: string
}

export interface FlightAuditRecord {
  ranAt: number
  score?: number
  grade?: string
  findingCount: number
}

export interface FlightFileSnapshot {
  timestamp: number
  reason: 'command' | 'audit' | 'verify-green'
  files: string[]
}

export interface LastGreenState {
  command: string
  timestamp: number
  filesAtGreen: string[]
  filesChangedSince: string[]
}

export interface FlightRecorderData {
  commands: FlightCommandRecord[]
  audits: FlightAuditRecord[]
  snapshots: FlightFileSnapshot[]
  lastGreen: LastGreenState | null
}

/** Compact flight log for Session Hub UI. */
export interface FlightLogView {
  recentCommands: FlightCommandRecord[]
  lastGreen: LastGreenState | null
  lastAudit: FlightAuditRecord | null
}

/** Stack frame captured from Smart Terminal failure output. */
export interface FailureStackFrame {
  file: string
  line: number
  column?: number
}

/** Persistent Smart Terminal failure record (failure black box). */
export interface TerminalFailureRecord {
  command: string
  exitCode: number
  kind: string
  fingerprint: string
  stackFrames: FailureStackFrame[]
  /** Trimmed terminal output excerpt. */
  rawOutput: string
  timestamp: number
}

export interface PrepareCursorResult {
  ok: boolean
  error?: string
  text?: string
  noProject?: boolean
  pasteAttempted?: boolean
  pasteSucceeded?: boolean
  pasteNotice?: string
}

export type SessionEntryType = 'prompt' | 'terminal-issue' | 'audit-finding' | 'note' | 'git-diff'

interface SessionEntryBase {
  id: string
  type: SessionEntryType
  title: string
  timestamp: number
  pinned: boolean
  /** Full prompt body captured at copy time (truncated to 8KB when stored). */
  fullText?: string
  /** Verify loop: command to re-run after a fix copy. */
  verifyCommand?: string | null
  /** Verify loop outcome for pinned fix entries. */
  verifyStatus?: VerifyPinStatus
  /** Hash of output from the last verify re-run (dedup / audit trail). */
  lastVerifyOutputHash?: string
}

export interface SessionPromptEntry extends SessionEntryBase {
  type: 'prompt'
  promptId: string
}

export interface SessionTerminalIssueEntry extends SessionEntryBase {
  type: 'terminal-issue'
  issueId: string
  command?: string
}

export interface SessionAuditFindingEntry extends SessionEntryBase {
  type: 'audit-finding'
  fingerprint: string
  severity: string
  file?: string
  fixExcerpt?: string
}

export interface SessionNoteEntry extends SessionEntryBase {
  type: 'note'
  noteId: string
  text: string
}

export interface SessionGitDiffEntry extends SessionEntryBase {
  type: 'git-diff'
}

export type SessionEntry =
  | SessionPromptEntry
  | SessionTerminalIssueEntry
  | SessionAuditFindingEntry
  | SessionNoteEntry
  | SessionGitDiffEntry

/** Input for appending a session event (id/timestamp/pinned assigned by the service). */
export type SessionAppendInput =
  | Omit<SessionPromptEntry, keyof SessionEntryBase>
  | Omit<SessionTerminalIssueEntry, keyof SessionEntryBase>
  | Omit<SessionAuditFindingEntry, keyof SessionEntryBase>
  | Omit<SessionNoteEntry, keyof SessionEntryBase>
  | Omit<SessionGitDiffEntry, keyof SessionEntryBase>

export interface SessionState {
  entries: SessionEntry[]
  noProject: boolean
  /** Count of pinned entries — included on every session:changed broadcast for toolbar badge. */
  pinnedCount: number
  /** Active intent contract for this project session. */
  intent: IntentContract | null
  /** Compact flight recorder summary for Session Hub. */
  flight: FlightLogView | null
  /** Recent Smart Terminal failures (newest first, capped for UI). */
  recentFailures: TerminalFailureRecord[]
  /** Session-local agent mistake patterns (Phase D). */
  mistakes: AgentMistake[]
}

export type MistakePattern = 'weak-types' | 'out-of-scope' | 'duplicate-file' | 'skipped-tests'

export interface AgentMistake {
  pattern: MistakePattern
  file: string
  message: string
  timestamp: number
  fingerprint: string
}

export type ProjectMemoryWarningSeverity = 'info' | 'warning'

export interface ProjectMemoryWarning {
  id: string
  message: string
  severity: ProjectMemoryWarningSeverity
}

export interface ProjectMemoryDiff {
  warnings: ProjectMemoryWarning[]
  agentsMdExists: boolean
  agentsMdAgeDays: number | null
  cursorRulesCount: number
  contextReadmeExists: boolean
  codesyncConfigured: boolean
  noProject?: boolean
}

/** Optional manual stack overrides when auto-detection is unknown. */
export interface ProjectStackOverrides {
  language?: ProjectLanguage | ''
  framework?: ProjectFramework | ''
  testRunner?: TestRunner | ''
}

export interface SessionHandoffResult {
  copied: boolean
  text: string
  findings: SecretFinding[]
  noProject?: boolean
  pinnedCount: number
}

/** Project AI documentation discovered on disk for context sync. */
export interface ProjectAiDocs {
  noProject?: boolean
  agentsMd: string | null
  /** Relative paths under `.cursor/rules/` with truncated content previews. */
  cursorRules: { name: string; content: string }[]
  contextReadme: string | null
}

/** View of `.vibebar-audit.json` for the audit config UI. */
export interface AuditConfigView {
  noProject?: boolean
  configPath?: string
  rules: { id: string; disabled: boolean }[]
  baselineCount: number
  disabledCount: number
}

export interface AuditAcceptRiskResult {
  ok: boolean
  config: AuditConfigView
}

/** Markdown snippet to append to a note from a finding or session item. */
export interface NoteAppendInput {
  title: string
  fileLine?: string
  excerpt: string
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
  /** Engine confidence for audit findings (taint-confirmed vs heuristic). */
  confidence?: AuditConfidence
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
  /** New/existing/resolved relative to the previous audit scan (audit findings). */
  status?: FindingStatus
  /** Stable fingerprint for dismiss persistence across terminal commands. */
  fingerprint?: string
  /** Relative paths referenced by structured parse (stack frames, failure sites). */
  relatedFiles?: string[]
}

/** Scan metadata pushed alongside audit findings in the Smart Terminal dock. */
export interface TerminalAuditSummary {
  ranAt: number
  projectName: string | null
  scannedFiles: number
  totalCandidates: number
  truncated: boolean
  noProject: boolean
  score?: AuditScore
  delta?: AuditDelta
  durationMs?: number
  cachedFiles?: number
}

/** Issues panel payload — command-output detections omit `audit`; audit runs include posture metadata. */
export interface TerminalIssueUpdate {
  issues: DetectedIssue[]
  audit: TerminalAuditSummary | null
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

/**
 * How sure the engine is that a finding is a real, reachable issue:
 * - `high`   — taint/data-flow confirms untrusted input reaches the sink (or an unambiguous match).
 * - `medium` — a strong structural match, but reachability could not be proven intra-file.
 * - `low`    — a heuristic/presence signal worth a human look, prone to false positives.
 */
export type AuditConfidence = 'high' | 'medium' | 'low'

/** Rough human effort to remediate, surfaced so users can triage quick wins first. */
export type RemediationEffort = 'trivial' | 'moderate' | 'involved'

/** Whether a finding is new, carried over, or fixed relative to the previous scan of this project. */
export type FindingStatus = 'new' | 'existing' | 'resolved'

export type AuditCategory =
  | 'Exposed Secrets'
  | 'Access Control'
  | 'Input Validation'
  | 'Auth Flow'
  | 'Supply Chain'
  | 'Config'
  | 'Cryptography'
  | 'Data Exposure'

/**
 * A single behavioral/structural security finding. Each finding carries two prompts: one to
 * fix the code, and one to generate the runtime behavioral test that proves the fix works —
 * the layer static scanners cannot cover.
 */
export interface AuditFinding {
  id: string
  category: AuditCategory
  severity: AuditSeverity
  /** How sure the engine is this is a real, reachable issue (taint-confirmed vs heuristic). */
  confidence: AuditConfidence
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
  /**
   * Stable, line-independent identity for this finding (hash of rule + file + normalized code).
   * Lets us diff scans (new vs resolved) and lets users baseline-mute specific findings.
   */
  fingerprint: string
  /** Rough remediation effort, for triage. */
  remediationEffort?: RemediationEffort
  /** Set during diffing: whether this finding is new/carried-over relative to the last scan. */
  status?: FindingStatus
  fixPrompt: string
  testPrompt: string
}

/** A weighted posture score (0-100) and its letter grade, derived from open findings. */
export interface AuditScore {
  /** 0-100, where 100 is "no signals". */
  value: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

/** Counts of new/resolved/existing findings versus the previous scan of the same project. */
export interface AuditDelta {
  new: number
  resolved: number
  existing: number
}

/** Result of exporting an audit report to a file (SARIF or Markdown). */
export interface AuditExportResult {
  saved: boolean
  /** Absolute path written to, when saved. */
  path?: string
  /** Why nothing was saved: the user cancelled, no project, or the write failed. */
  reason?: 'canceled' | 'no-project' | 'write-failed'
  /** True when the export reused a cached scan instead of re-running. */
  fromCache?: boolean
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
  /** Weighted posture score + grade for the open findings. */
  score?: AuditScore
  /** New/resolved/existing counts relative to the previous scan of this project. */
  delta?: AuditDelta
  /** Wall-clock duration of the scan in milliseconds. */
  durationMs?: number
  /** How many of the scanned files were served from the incremental cache. */
  cachedFiles?: number
}

export type ReadyCheckStatus = 'blocked' | 'needs-review' | 'looks-ready'

export type ReadyCheckSignalLevel = 'ok' | 'warning' | 'blocked'

export interface ReadyCheckSignal {
  id:
    | 'git-diff'
    | 'audit'
    | 'terminal'
    | 'secrets'
    | 'project'
    | 'tests-not-run'
    | 'diff-not-reviewed'
    | 'lockfile-audit'
    | 'audit-delta'
    | 'last-green-stale'
    | 'untracked-secrets'
  label: string
  level: ReadyCheckSignalLevel
  detail: string
}

/** One ranked signal with an explicit next action for agents and review prompts. */
export interface ReadyCheckBriefItem {
  id: ReadyCheckSignal['id']
  label: string
  level: ReadyCheckSignalLevel
  detail: string
  nextAction: string
}

/** Top blockers + next actions derived from Ready Check signals. */
export interface ReadyCheckBrief {
  status: ReadyCheckStatus
  topItems: ReadyCheckBriefItem[]
  summaryLine: string
}

/** Aggregated pre-commit trust gate from git, audit, terminal, secrets, and project signals. */
export interface ReadyCheckResult {
  status: ReadyCheckStatus
  signals: ReadyCheckSignal[]
  /** AI-ready review prompt (included on get; used by copy action). */
  reviewPrompt?: string
  /** Ranked top blockers with next actions (MCP brief + review prompt). */
  brief?: ReadyCheckBrief
  noProject?: boolean
  /** Profile-level context health warnings (stack, AGENTS.md, etc.) — informational only. */
  contextWarningCount?: number
  /** Ordered verify plan from package.json scripts (typecheck → test → lint → build). */
  verifyRecipe?: VerificationRecipe
  /** Untracked file secret-scan summary (Ready Check v3). */
  untrackedFiles?: UntrackedFileInspection[]
  /** Dependency diff when package.json changed. */
  dependencyChange?: DependencyChangeSummary
}

/** One untracked path scanned for Ready Check inspector. */
export interface UntrackedFileInspection {
  path: string
  sizeBytes: number
  skipped: boolean
  secretCount: number
}

/** Added/removed/changed deps when package.json is in the working tree. */
export interface DependencyChangeSummary {
  added: DependencyChangeEntry[]
  removed: DependencyChangeEntry[]
  changed: DependencyChangeEntry[]
  unpinned: DependencyChangeEntry[]
  lockfileSignalActive: boolean
}

export interface DependencyChangeEntry {
  name: string
  section: 'dependencies' | 'devDependencies'
  before?: string
  after?: string
  unpinned?: boolean
}

/** Ordered verify steps detected from the active project. */
export interface VerificationStep {
  id: string
  label: string
  command: string
}

export interface VerificationRecipe {
  steps: VerificationStep[]
  summary: string
}

export type { PromptCategory, PromptTemplate, ResolvedVariable, ProjectProfile }
