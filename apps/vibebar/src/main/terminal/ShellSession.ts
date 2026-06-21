import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { ShellType } from '@shared/types.js'

export interface ShellSessionOptions {
  shell: ShellType
  cwd: string
  onData: (chunk: string) => void
  /** Called when a command finishes (or the shell first becomes ready), with its exit code. */
  onReady: (exitCode: number | null) => void
  onClosed: () => void
}

const RESET = '\u001b[0m'
const RED = '\u001b[31m'

/**
 * A persistent, line-oriented interactive shell (cmd.exe or PowerShell) rooted at the active
 * project. Unlike the one-shot {@link TerminalSession} command runner, this keeps a single
 * long-lived shell process alive so working directory, environment, and activated venvs persist
 * across commands — backing the Smart Terminal's expandable bottom terminal.
 *
 * Each submitted line is followed by a unique sentinel echo so the main process can detect when
 * the command finished and recover its exit code, then tell the renderer to draw a fresh prompt.
 * This deliberately uses piped stdio (no native PTY dependency): great for builds/tests/git and
 * project commands, but full-screen TUIs (vim) and stdin-reading REPLs are out of scope.
 */
export class ShellSession {
  private shellType: ShellType
  private cwd: string
  private child: ChildProcessWithoutNullStreams | null = null
  private readonly onData: (chunk: string) => void
  private readonly onReady: (exitCode: number | null) => void
  private readonly onClosed: () => void
  private readonly marker = `__VIBE_DONE_${randomBytes(6).toString('hex')}__`
  private readonly markerRe: RegExp
  private buffer = ''

  constructor(opts: ShellSessionOptions) {
    this.shellType = opts.shell
    this.cwd = opts.cwd
    this.onData = opts.onData
    this.onReady = opts.onReady
    this.onClosed = opts.onClosed
    this.markerRe = new RegExp(`^${this.marker} (-?\\d+)\\s*$`)
  }

  get shell(): ShellType {
    return this.shellType
  }

  start(): void {
    if (this.child) return
    const { file, args } = this.resolveShell(this.shellType)
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(file, args, {
        cwd: existsSync(this.cwd) ? this.cwd : process.cwd(),
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      })
    } catch (err) {
      this.onData(`${RED}Failed to start shell: ${(err as Error).message}${RESET}\r\n`)
      return
    }
    this.child = child
    child.stdout.on('data', (d: Buffer) => this.handleChunk(d))
    child.stderr.on('data', (d: Buffer) => this.handleChunk(d))
    child.on('error', (err) => this.onData(`${RED}${err.message}${RESET}\r\n`))
    child.on('close', () => {
      this.child = null
      this.onClosed()
    })
    // Draw the first prompt immediately; the shell banner is suppressed via launch flags.
    this.onReady(0)
  }

  /** Runs one user-entered line, then a sentinel so we can detect completion + exit code. */
  runLine(line: string): void {
    if (!this.child) this.start()
    const child = this.child
    if (!child) return
    if (this.shellType === 'cmd') {
      child.stdin.write(`${line}\r\n`)
      child.stdin.write(`echo ${this.marker} %ERRORLEVEL%\r\n`)
    } else if (this.shellType === 'bash') {
      child.stdin.write(`${line}\n`)
      child.stdin.write(`printf '%s %s\\n' '${this.marker}' "$?"\n`)
    } else {
      // PowerShell: $? is a reliable boolean for the last statement's success.
      child.stdin.write(`${line}\n`)
      child.stdin.write(`Write-Output "${this.marker} $(if ($?) {0} else {1})"\n`)
    }
  }

  /** Points the live shell at a new directory (e.g. the active project changed). */
  setCwd(path: string): void {
    if (!path || !existsSync(path)) return
    this.cwd = path
    if (!this.child) return
    const quoted = this.shellType === 'cmd' ? `cd /d "${path}"` : `cd "${path}"`
    this.runLine(quoted)
  }

  dispose(): void {
    if (this.child && !this.child.killed) this.child.kill()
    this.child = null
  }

  private resolveShell(shell: ShellType): { file: string; args: string[] } {
    if (process.platform === 'win32') {
      if (shell === 'cmd') return { file: 'cmd.exe', args: ['/Q'] }
      return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
    }
    return { file: process.env['SHELL'] || '/bin/bash', args: [] }
  }

  /**
   * Buffers stdout/stderr and emits complete lines, intercepting the sentinel to fire `onReady`.
   * The final partial line (no trailing newline) is held until more arrives so the sentinel is
   * never split mid-match.
   */
  private handleChunk(d: Buffer): void {
    this.buffer += d.toString('utf8')
    const parts = this.buffer.split(/\r?\n/)
    this.buffer = parts.pop() ?? ''
    for (const line of parts) {
      const m = this.markerRe.exec(line)
      if (m) {
        this.onReady(Number(m[1]))
      } else {
        this.onData(`${line}\r\n`)
      }
    }
  }
}
