import { homedir } from 'node:os'
import { type BrowserWindow, screen } from 'electron'
import type { ProjectProfile } from '@vibebar/project-detector'
import { CH } from '@shared/channels.js'
import type {
  AuditFinding,
  AuditReport,
  AuditSeverity,
  DetectedIssue,
  DockSide,
  IntentContract,
  IssueSeverity,
  ProjectCommand,
  ShellType,
  TerminalAuditSummary,
  TerminalIssueUpdate,
  TerminalRunResult,
  TerminalState
} from '@shared/types.js'
import type { ResizeEdge } from '@shared/terminalApi.js'
import type { ProjectService } from '../project/ProjectService.js'
import type { AppStore } from '../settings/store.js'
import { createTerminalWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'
import { trackWindowBounds, clampWindowBounds } from '../overlay/windowBounds.js'
import { TerminalSession, type CommandResult } from './TerminalSession.js'
import { ShellSession } from './ShellSession.js'
import { generateProjectCommands } from './projectCommands.js'
import { analyzeOutput } from './outputAnalyzer.js'
import { runFixWithContext } from './fixWithContext.js'

const DEFAULT_W = 960
const DEFAULT_H = 620
const MARGIN = 88
/** Must mirror minWidth/minHeight in createTerminalWindow so renderer-driven resizing clamps too. */
const MIN_W = 420
const MIN_H = 280

const AUDIT_SEVERITY: Record<AuditSeverity, IssueSeverity> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info'
}

/** Maps a security-audit finding into the terminal's issue shape, carrying both prompts + context. */
function findingToIssue(f: AuditFinding): DetectedIssue {
  return {
    id: f.id,
    severity: AUDIT_SEVERITY[f.severity],
    title: f.title,
    summary: f.detail,
    evidence: f.evidence ?? '',
    prompt: f.fixPrompt,
    testPrompt: f.testPrompt,
    category: f.category,
    source: 'audit',
    auditSeverity: f.severity,
    confidence: f.confidence,
    file: f.file,
    line: f.line,
    codeContext: f.codeContext,
    cwe: f.cwe,
    references: f.references,
    status: f.status
  }
}

function auditSummary(report: AuditReport): TerminalAuditSummary {
  return {
    ranAt: report.ranAt,
    projectName: report.projectName,
    scannedFiles: report.scannedFiles,
    totalCandidates: report.totalCandidates,
    truncated: report.truncated,
    noProject: report.noProject,
    score: report.score,
    delta: report.delta,
    durationMs: report.durationMs,
    cachedFiles: report.cachedFiles
  }
}

function gradeTag(report: AuditReport): string {
  if (!report.score) return ''
  return ` \u2014 grade ${report.score.grade} (${report.score.value}/100)`
}

/**
 * Owns the Smart Terminal window and its session. The window is created lazily and reused; the
 * toolbar button toggles its visibility (hiding preserves scrollback and session state). It
 * spawns on the side opposite the toolbar dock, stays always-on-top, and analyzes every
 * finished command for fixable issues using the active project's profile.
 */
export class TerminalController {
  private readonly store: AppStore
  private readonly projects: ProjectService
  private readonly onVisibility?: (visible: boolean) => void
  private readonly onCommandComplete?: (result: CommandResult) => void
  private win: BrowserWindow | null = null
  private session: TerminalSession | null = null
  /** The expandable bottom terminal's persistent interactive shell (created on demand). */
  private shell: ShellSession | null = null
  /** Resolves once the current window's renderer has loaded, so early writes aren't lost. */
  private ready: Promise<void> = Promise.resolve()
  /** Window bounds captured at the start of a renderer-driven resize drag (see resizeStart). */
  private resizeAnchor: Rect | null = null
  /** Last issue count pushed to the renderer (for bridge hints). */
  private lastIssueCount = 0
  /** Last finished command — used by Fix with context. */
  private lastResult: CommandResult | null = null
  private lastIssues: DetectedIssue[] = []
  /** Dismissed issue fingerprints persist across commands within this terminal session. */
  private dismissedFingerprints = new Set<string>()
  private untrackBounds: (() => void) | null = null

  constructor(
    store: AppStore,
    projects: ProjectService,
    onVisibility?: (visible: boolean) => void,
    onCommandComplete?: (result: CommandResult) => void
  ) {
    this.store = store
    this.projects = projects
    this.onVisibility = onVisibility
    this.onCommandComplete = onCommandComplete
  }

  toggle(): { visible: boolean } {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide()
      this.emitVisibility(false)
      return { visible: false }
    }
    this.ensureWindow()
    this.win?.show()
    this.win?.focus()
    this.emitVisibility(true)
    return { visible: true }
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide()
    this.emitVisibility(false)
  }

  show(): void {
    this.ensureWindow()
    this.win?.show()
    this.win?.focus()
    this.emitVisibility(true)
  }

  /**
   * Captures the window's current bounds as the anchor for an interactive resize. The window is
   * frameless + transparent, so Windows gives it no draggable OS resize border; the renderer's
   * edge grips drive resizing through resizeStart + resizeBy instead.
   */
  resizeStart(): void {
    if (!this.win || this.win.isDestroyed()) return
    const b = this.win.getBounds()
    this.resizeAnchor = { x: b.x, y: b.y, width: b.width, height: b.height }
  }

  /**
   * Resizes the window relative to the anchor captured by {@link resizeStart}. `dx`/`dy` are the
   * cumulative screen-pixel delta since the drag began; west/north edges move the origin while
   * shrinking, and both axes clamp to the window's minimum size.
   */
  resizeBy(edge: ResizeEdge, dx: number, dy: number): void {
    if (!this.win || this.win.isDestroyed() || !this.resizeAnchor) return
    const a = this.resizeAnchor
    let { x, y, width, height } = a

    if (edge.includes('e')) width = a.width + dx
    if (edge.includes('s')) height = a.height + dy
    if (edge.includes('w')) {
      width = a.width - dx
      x = a.x + dx
    }
    if (edge.includes('n')) {
      height = a.height - dy
      y = a.y + dy
    }

    if (width < MIN_W) {
      if (edge.includes('w')) x = a.x + (a.width - MIN_W)
      width = MIN_W
    }
    if (height < MIN_H) {
      if (edge.includes('n')) y = a.y + (a.height - MIN_H)
      height = MIN_H
    }

    this.win.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    })
  }

  private emitVisibility(visible: boolean): void {
    this.onVisibility?.(visible)
  }

  /** True when the terminal window exists and is currently visible to the user. */
  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible())
  }

  /** Lightweight bridge hint for Session Hub "what's next" suggestions. */
  getHints(): { issueCount: number; isOpen: boolean } {
    return { issueCount: this.lastIssueCount, isOpen: this.isOpen() }
  }

  /**
   * Mirrors audit findings into the terminal *only if it is already open* — it never creates or
   * shows the window. Writes a single concise, timestamped status line and refreshes the findings
   * panel, so repeated/auto scans stream in live without spamming the scrollback. Returns whether
   * it was mirrored, so the caller can tell the user where the results went.
   */
  mirrorAuditIfOpen(report: AuditReport): boolean {
    if (!this.isOpen()) return false
    this.presentAudit(report, { quiet: true })
    return true
  }

  run(command: string): TerminalRunResult {
    this.ensureWindow()
    if (!this.session) return { accepted: false, reason: 'Terminal not ready.' }
    return this.session.run(command)
  }

  cancel(): void {
    this.session?.cancel()
  }

  clear(): void {
    /* The renderer clears its own buffer; nothing to persist here. */
  }

  // ---- Built-in interactive shell (expandable bottom terminal) ----

  /** Spawns (or reuses) the interactive shell. Switching shell program restarts the session. */
  shellStart(shell: ShellType): void {
    this.ensureWindow()
    if (this.shell && this.shell.shell === shell) {
      // Already running this shell: nudge a fresh prompt for the (re)opened panel.
      this.send(CH.shellReady, { exitCode: 0 })
      return
    }
    this.shell?.dispose()
    const cwd = this.projects.getProfile()?.rootPath ?? homedir()
    this.shell = new ShellSession({
      shell,
      cwd,
      onData: (chunk) => this.send(CH.shellData, chunk),
      onReady: (exitCode) => this.send(CH.shellReady, { exitCode }),
      onClosed: () => this.send(CH.shellClosed, undefined)
    })
    this.shell.start()
  }

  shellInput(line: string): void {
    this.shell?.runLine(line)
  }

  shellSetShell(shell: ShellType): void {
    this.shellStart(shell)
  }

  shellStop(): void {
    this.shell?.dispose()
    this.shell = null
  }

  projectCommands(): Promise<ProjectCommand[]> {
    return generateProjectCommands(this.projects.getProfile())
  }

  /** Shows the terminal and prints a scan banner before the (async) audit runs. */
  async beginAudit(): Promise<void> {
    this.ensureWindow()
    this.win?.show()
    this.win?.focus()
    this.emitVisibility(true)
    await this.ready
    const project = this.projects.getProfile()?.folderName ?? 'this project'
    this.writeLine('')
    this.writeLine('\u001b[38;5;213m\u25cf Security audit \u2014 deep repo scan\u001b[0m')
    this.writeLine(`\u001b[2mScanning ${project} for behavioral and supply-chain risks\u2026\u001b[0m`)
  }

  /**
   * Pushes findings to the issue panel and prints a summary. In `quiet` mode (used for mirrored
   * and auto scans) it prints a single compact, timestamped line instead of the full banner, so
   * the scrollback stays clean while findings refresh live.
   */
  presentAudit(report: AuditReport, opts: { quiet?: boolean } = {}): void {
    this.ensureWindow()
    if (report.noProject) {
      if (!opts.quiet) {
        this.writeLine('\u001b[33mNo project selected. Pick one from the toolbar, then run the audit again.\u001b[0m')
      }
      this.pushIssues({ issues: [], audit: null })
      return
    }

    const issues = report.findings.map(findingToIssue)
    const counts = report.findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1
      return acc
    }, {})
    const summary = (['critical', 'high', 'medium', 'low'] as AuditSeverity[])
      .filter((s) => counts[s])
      .map((s) => `${counts[s]} ${s}`)
      .join(', ')
    const grade = gradeTag(report)
    const deltaParts: string[] = []
    if (report.delta?.new) deltaParts.push(`+${report.delta.new} new`)
    if (report.delta?.resolved) deltaParts.push(`-${report.delta.resolved} resolved`)
    const delta = deltaParts.length > 0 ? ` (${deltaParts.join(', ')})` : ''

    if (opts.quiet) {
      const stamp = new Date().toLocaleTimeString()
      this.writeLine(
        issues.length === 0
          ? `\u001b[2m[${stamp}] audit \u2014 ${report.scannedFiles} files${grade}, no signals\u001b[0m`
          : `\u001b[38;5;213m[${stamp}] audit \u2014 ${report.scannedFiles} files${grade} \u2014 ${issues.length} issue(s): ${summary}${delta}\u001b[0m`
      )
    } else if (issues.length === 0) {
      this.writeLine(
        `\u001b[32m\u2713 Scanned ${report.scannedFiles} files${grade} \u2014 no behavioral-risk signals found.\u001b[0m`
      )
      this.writeLine('\u001b[2m  Absence of a signal is not proof of safety \u2014 still test auth and authorization.\u001b[0m')
    } else {
      this.writeLine(
        `\u001b[31m\u2713 Scanned ${report.scannedFiles} files${grade} \u2014 ${issues.length} issue(s): ${summary}${delta}\u001b[0m`
      )
      this.writeLine('\u001b[2m  Open an issue on the right \u2192 copy the fix prompt (and a behavioral test) into your AI.\u001b[0m')
    }
    this.pushIssues({ issues, audit: auditSummary(report) })
  }

  /** Pushes issue-panel updates to the renderer (audit metadata included when from a scan). */
  private pushIssues(update: TerminalIssueUpdate): void {
    const visible = update.issues.filter((issue) => {
      const fp = issue.fingerprint ?? `${issue.id}:${issue.evidence.slice(0, 120)}`
      return !this.dismissedFingerprints.has(fp)
    })
    this.lastIssueCount = visible.length
    this.send(CH.terminalIssues, { ...update, issues: visible })
  }

  dismissIssue(fingerprint: string): void {
    if (fingerprint) this.dismissedFingerprints.add(fingerprint)
  }

  issueFingerprint(issue: DetectedIssue): string {
    return issue.fingerprint ?? `${issue.id}:${issue.evidence.slice(0, 120)}`
  }

  async fixWithContext(
    issueId?: string,
    intent?: IntentContract | null
  ): Promise<{ copied: boolean; text: string; noResult?: boolean; verifyCommand?: string | null }> {
    if (!this.lastResult) {
      return { copied: false, text: '', noResult: true }
    }
    const issue =
      issueId != null
        ? this.lastIssues.find((i) => i.id === issueId) ?? null
        : this.lastIssues[0] ?? null
    const bundle = await runFixWithContext(
      { store: this.store, projects: this.projects },
      this.lastResult,
      issue,
      intent ?? null
    )
    return { copied: false, text: bundle.text, verifyCommand: bundle.verifyCommand }
  }

  /** Writes one line to the terminal view (CRLF for xterm). */
  private writeLine(text: string): void {
    this.send(CH.terminalData, `${text}\r\n`)
  }

  getState(): TerminalState {
    const profile = this.projects.getProfile()
    return {
      status: this.session?.getStatus() ?? {
        running: false,
        cwd: profile?.rootPath ?? homedir(),
        exitCode: null,
        lastCommand: null
      },
      projectName: profile?.folderName ?? null
    }
  }

  /** Called when the active project changes so the terminal follows the project root. */
  setProject(profile: ProjectProfile | null): void {
    if (profile?.rootPath) {
      this.session?.setCwd(profile.rootPath)
      this.shell?.setCwd(profile.rootPath)
    }
    this.pushState()
  }

  dispose(): void {
    this.untrackBounds?.()
    this.untrackBounds = null
    this.session?.dispose()
    this.session = null
    this.shell?.dispose()
    this.shell = null
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return
    const bounds = this.resolveBounds()
    const win = createTerminalWindow(bounds)
    this.win = win
    this.untrackBounds?.()
    this.untrackBounds = trackWindowBounds(win, (b) => this.store.setTerminalBounds(b))
    this.ready = new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', () => resolve())
    })

    const startCwd = this.projects.getProfile()?.rootPath ?? homedir()
    this.session = new TerminalSession({
      cwd: startCwd,
      onData: (chunk) => this.send(CH.terminalData, chunk),
      onStatus: (status) => this.send(CH.terminalStatus, status),
      onResult: ({ command, output, exitCode }) => {
        const result = { command, output, exitCode }
        this.lastResult = result
        const issues = analyzeOutput({
          command,
          output,
          exitCode,
          profile: this.projects.getProfile()
        })
        this.lastIssues = issues
        this.pushIssues({ issues, audit: null })
        this.onCommandComplete?.(result)
      }
    })

    win.on('closed', () => {
      this.untrackBounds?.()
      this.untrackBounds = null
      this.session?.dispose()
      this.session = null
      this.shell?.dispose()
      this.shell = null
      this.win = null
      this.emitVisibility(false)
    })
    win.webContents.on('did-finish-load', () => this.pushState())
  }

  private pushState(): void {
    this.send(CH.terminalStatus, this.getState().status)
  }

  private send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  private resolveBounds(): Rect {
    const saved = this.store.getTerminalBounds()
    const wa = screen.getPrimaryDisplay().workArea
    if (saved) return clampWindowBounds(saved, wa)
    return this.computeBounds()
  }

  private computeBounds(): Rect {
    const display = screen.getPrimaryDisplay()
    const wa = display.workArea
    const dock: DockSide = this.store.getSettings().dock
    const width = Math.min(DEFAULT_W, wa.width - 2 * MARGIN)
    const height = Math.min(DEFAULT_H, wa.height - 2 * MARGIN)

    let x: number
    let y = Math.round(wa.y + (wa.height - height) / 2)
    if (dock === 'right') {
      x = wa.x + MARGIN
    } else if (dock === 'top') {
      x = Math.round(wa.x + (wa.width - width) / 2)
      y = wa.y + wa.height - height - MARGIN
    } else {
      // Toolbar on the left → terminal on the right.
      x = wa.x + wa.width - width - MARGIN
    }
    return { x, y, width, height }
  }
}
