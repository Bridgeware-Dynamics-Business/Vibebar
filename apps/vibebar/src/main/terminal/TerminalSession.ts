import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import type { TerminalRunResult, TerminalStatus } from '@shared/types.js'
import { classifyCommand, resolveCdTarget } from './commandUtils.js'

export interface CommandResult {
  command: string
  output: string
  exitCode: number | null
}

export interface TerminalSessionOptions {
  cwd: string
  onData: (chunk: string) => void
  onStatus: (status: TerminalStatus) => void
  onResult: (result: CommandResult) => void
}

const RESET = '\u001b[0m'
const CYAN = '\u001b[36m'
const MAGENTA = '\u001b[35m'
const RED = '\u001b[31m'
const DIM = '\u001b[2m'
const CLEAR = '\u001b[2J\u001b[3J\u001b[H'

/**
 * A cwd-aware command runner backing the Smart Terminal. Each command is spawned in its own
 * child process (no long-lived shell to wedge), while `cd`/`clear` are handled in-process so
 * the working directory persists across commands. Output streams chunk-by-chunk; on completion
 * the full buffer is handed back for issue analysis. No interactive TUI input — this is built
 * for running and reading build/test/lint/git commands, which is exactly the guidance use case.
 */
export class TerminalSession {
  private cwd: string
  private readonly onData: (chunk: string) => void
  private readonly onStatus: (status: TerminalStatus) => void
  private readonly onResult: (result: CommandResult) => void
  private child: ChildProcess | null = null
  private buffer = ''
  private running = false
  private exitCode: number | null = null
  private lastCommand: string | null = null

  constructor(opts: TerminalSessionOptions) {
    this.cwd = opts.cwd
    this.onData = opts.onData
    this.onStatus = opts.onStatus
    this.onResult = opts.onResult
  }

  getStatus(): TerminalStatus {
    return {
      running: this.running,
      cwd: this.cwd,
      exitCode: this.exitCode,
      lastCommand: this.lastCommand
    }
  }

  setCwd(path: string): void {
    if (path && existsSync(path)) {
      this.cwd = path
      this.onStatus(this.getStatus())
    }
  }

  run(raw: string): TerminalRunResult {
    if (this.running) return { accepted: false, reason: 'A command is already running.' }
    const classified = classifyCommand(raw)

    if (classified.type === 'noop') return { accepted: false }

    if (classified.type === 'clear') {
      this.onData(CLEAR)
      return { accepted: true }
    }

    if (classified.type === 'cd') {
      const target = resolveCdTarget(this.cwd, classified.arg, homedir())
      if (existsSync(target) && statSync(target).isDirectory()) {
        this.cwd = target
        this.echoPrompt(raw)
        this.onData(`${DIM}→ ${target}${RESET}\r\n`)
        this.onStatus(this.getStatus())
      } else {
        this.echoPrompt(raw)
        this.onData(`${RED}cd: no such directory: ${classified.arg}${RESET}\r\n`)
      }
      return { accepted: true }
    }

    this.spawnCommand(raw)
    return { accepted: true }
  }

  cancel(): void {
    if (this.child && !this.child.killed) {
      this.child.kill()
      this.onData(`\r\n${RED}^C command cancelled${RESET}\r\n`)
    }
  }

  dispose(): void {
    if (this.child && !this.child.killed) this.child.kill()
    this.child = null
  }

  private echoPrompt(command: string): void {
    this.onData(`\r\n${CYAN}${this.cwd}${RESET}${MAGENTA} ❯ ${RESET}${command}\r\n`)
  }

  private spawnCommand(command: string): void {
    this.echoPrompt(command)
    this.buffer = ''
    this.running = true
    this.exitCode = null
    this.lastCommand = command
    this.onStatus(this.getStatus())

    const isWin = process.platform === 'win32'
    const file = isWin ? 'powershell.exe' : '/bin/bash'
    const args = isWin ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command]

    let child: ChildProcess
    try {
      child = spawn(file, args, {
        cwd: this.cwd,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      })
    } catch (err) {
      this.running = false
      this.onData(`${RED}Failed to start command: ${(err as Error).message}${RESET}\r\n`)
      this.onStatus(this.getStatus())
      return
    }

    this.child = child

    const onChunk = (data: Buffer): void => {
      const text = data.toString('utf8')
      this.buffer += text
      // xterm expects CRLF; normalize lone LFs so lines don't stair-step.
      this.onData(text.replace(/\r?\n/g, '\r\n'))
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    child.on('error', (err) => {
      this.onData(`${RED}${err.message}${RESET}\r\n`)
    })

    child.on('close', (code) => {
      this.running = false
      this.exitCode = code
      this.child = null
      const tag = code === 0 ? `${DIM}✓ exit 0${RESET}` : `${RED}✗ exit ${code ?? '?'}${RESET}`
      this.onData(`${tag}\r\n`)
      this.onStatus(this.getStatus())
      this.onResult({ command, output: this.buffer, exitCode: code })
    })
  }
}
