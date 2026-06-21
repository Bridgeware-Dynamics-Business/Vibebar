import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { AnimatePresence, motion } from 'framer-motion'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectCommand, ShellType } from '@shared/types.js'
import { Icon } from '../shared/icons'

const THEME = {
  background: '#0b0d12',
  foreground: '#e8eaed',
  cursor: '#6366f1',
  selectionBackground: 'rgba(99,102,241,0.35)',
  black: '#0b0d12',
  brightBlack: '#5b6270'
}

const RESET = '\u001b[0m'
const CYAN = '\u001b[36m'
const MAGENTA = '\u001b[35m'
const DIM = '\u001b[2m'

const MIN_HEIGHT = 140
const SHELL_LABEL: Record<ShellType, string> = {
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  bash: 'Bash'
}

function maxHeight(): number {
  return Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.72))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function ProjectCommandsPanel({
  onRun,
  onClose
}: {
  onRun: (command: string) => void
  onClose: () => void
}): JSX.Element {
  const [commands, setCommands] = useState<ProjectCommand[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    void window.terminal.shell.projectCommands().then(setCommands)
  }, [])

  const groups = (commands ?? []).reduce<Record<string, ProjectCommand[]>>((acc, c) => {
    ;(acc[c.group] ??= []).push(c)
    return acc
  }, {})

  async function copy(c: ProjectCommand): Promise<void> {
    await window.terminal.copy(c.command)
    setCopiedId(c.id)
    window.setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 1500)
  }

  return (
    <motion.div
      className="vibe-no-drag flex h-full w-1/2 min-w-[15rem] flex-col overflow-hidden border-l border-vibe-border bg-black/30"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
    >
        <div className="flex items-center gap-2 border-b border-vibe-border px-3 py-1.5">
          <Icon name="ListChecks" size={14} className="text-vibe-accent-2" />
          <span className="text-xs font-semibold text-vibe-text">Project commands</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        <div className="vibe-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {commands === null && (
            <p className="px-2 py-4 text-center text-xs text-vibe-muted">Reading project…</p>
          )}
          {commands !== null && commands.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-vibe-muted">
              No commands detected. Select a project, or add scripts/README commands.
            </p>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-1.5">
              <p className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-vibe-muted">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/[0.04]"
                    title={c.command}
                  >
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[11px] font-medium text-vibe-text">
                        {c.label}
                      </span>
                      <code className="block truncate font-mono text-[10px] text-vibe-accent-2">
                        {c.command}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copy(c)}
                      title="Copy command"
                      className="rounded p-1 text-vibe-muted opacity-60 hover:bg-white/10 hover:text-vibe-text group-hover:opacity-100"
                    >
                      <Icon name={copiedId === c.id ? 'Check' : 'Copy'} size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRun(c.command)}
                      title="Run in terminal"
                      className="flex items-center gap-1 rounded bg-vibe-accent px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-vibe-accent/85"
                    >
                      <Icon name="Play" size={10} /> Run
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
    </motion.div>
  )
}

/**
 * The expandable, resizable interactive terminal docked at the bottom of the Smart Terminal —
 * a persistent cmd/PowerShell session rooted at the active project (like Cursor's panel). Handles
 * local line editing/echo (the main-process shell uses piped stdio, not a PTY) and exposes a
 * "Project commands" popup that copies or auto-runs project-relevant commands.
 */
export function ShellPanel({
  cwd,
  projectName,
  onClose
}: {
  cwd: string
  projectName: string | null
  onClose: () => void
}): JSX.Element {
  const termHostRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const lineRef = useRef('')
  const readyRef = useRef(false)
  const firstPromptRef = useRef(true)
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const cwdRef = useRef(cwd)
  const shellTypeRef = useRef<ShellType>('powershell')
  const projectNameRef = useRef(projectName)

  const [shellType, setShellType] = useState<ShellType>('powershell')
  const [height, setHeight] = useState(260)
  const [popupOpen, setPopupOpen] = useState(false)

  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])
  useEffect(() => {
    projectNameRef.current = projectName
  }, [projectName])
  useEffect(() => {
    shellTypeRef.current = shellType
  }, [shellType])

  // Reads live values from refs so it stays stable (the xterm mount effect depends on it).
  const promptString = useCallback((): string => {
    const label = shellTypeRef.current === 'powershell' ? 'PS ' : ''
    const dir = cwdRef.current || projectNameRef.current || ''
    return `${CYAN}${label}${dir}${RESET}${MAGENTA} ❯ ${RESET}`
  }, [])

  const writePrompt = useCallback(() => {
    const term = xtermRef.current
    if (!term) return
    term.write(`${firstPromptRef.current ? '' : '\r\n'}${promptString()}`)
    firstPromptRef.current = false
  }, [promptString])

  const submitLine = useCallback(() => {
    const term = xtermRef.current
    if (!term) return
    const line = lineRef.current
    term.write('\r\n')
    lineRef.current = ''
    historyIdxRef.current = -1
    if (line.trim()) {
      historyRef.current = [line, ...historyRef.current.filter((c) => c !== line)].slice(0, 100)
    }
    readyRef.current = false
    void window.terminal.shell.input(line)
  }, [])

  const runCommand = useCallback((command: string) => {
    const term = xtermRef.current
    if (!term || !readyRef.current) return
    term.write(`${command}\r\n`)
    lineRef.current = ''
    historyRef.current = [command, ...historyRef.current.filter((c) => c !== command)].slice(0, 100)
    historyIdxRef.current = -1
    readyRef.current = false
    void window.terminal.shell.input(command)
  }, [])

  // Mount xterm + wire the persistent shell. Runs once; reads live props via refs.
  useEffect(() => {
    if (!termHostRef.current) return
    const term = new Terminal({
      fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termHostRef.current)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit

    const eraseLine = (): void => {
      const n = lineRef.current.length
      if (n > 0) term.write('\b'.repeat(n) + ' '.repeat(n) + '\b'.repeat(n))
    }
    const navHistory = (dir: -1 | 1): void => {
      const h = historyRef.current
      if (h.length === 0) return
      const next = clamp(historyIdxRef.current + (dir === -1 ? 1 : -1), -1, h.length - 1)
      historyIdxRef.current = next
      eraseLine()
      const val = next >= 0 ? (h[next] ?? '') : ''
      lineRef.current = val
      term.write(val)
    }

    const offKey = term.onData((data) => {
      if (!readyRef.current) {
        if (data === '\u0003') term.write('^C')
        return
      }
      if (data === '\u001b[A') return navHistory(-1)
      if (data === '\u001b[B') return navHistory(1)
      if (data === '\r') return submitLine()
      if (data === '\u007f' || data === '\b') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }
      if (data === '\u0003') {
        term.write('^C')
        lineRef.current = ''
        readyRef.current = true
        writePrompt()
        return
      }
      if (data.startsWith('\u001b')) return
      const clean = data.replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u001f]/g, '')
      if (clean) {
        lineRef.current += clean
        term.write(clean)
      }
    })

    const offData = window.terminal.shell.onData((chunk) => term.write(chunk))
    const offReady = window.terminal.shell.onReady(() => {
      readyRef.current = true
      writePrompt()
    })
    const offClosed = window.terminal.shell.onClosed(() => {
      readyRef.current = false
      term.write(`\r\n${DIM}— shell exited —${RESET}\r\n`)
    })

    term.write(
      `${DIM}VibeBar terminal — interactive ${SHELL_LABEL[shellTypeRef.current]} rooted at the project.${RESET}\r\n`
    )
    void window.terminal.shell.start(shellTypeRef.current)

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore transient sizing errors */
      }
    })
    ro.observe(termHostRef.current)

    return () => {
      offKey.dispose()
      offData()
      offReady()
      offClosed()
      ro.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [submitLine, writePrompt])

  // Refit when the panel is resized or the commands split opens/closes so xterm reflows.
  useEffect(() => {
    try {
      fitRef.current?.fit()
    } catch {
      /* ignore */
    }
  }, [height, popupOpen])

  const changeShell = useCallback((next: ShellType) => {
    setShellType(next)
    shellTypeRef.current = next
    firstPromptRef.current = true
    readyRef.current = false
    lineRef.current = ''
    const term = xtermRef.current
    if (term) {
      term.clear()
      term.write(`${DIM}Switching to ${SHELL_LABEL[next]}…${RESET}\r\n`)
    }
    void window.terminal.shell.setShell(next)
  }, [])

  const restart = useCallback(() => {
    firstPromptRef.current = true
    readyRef.current = false
    lineRef.current = ''
    xtermRef.current?.clear()
    void window.terminal.shell.stop()
    void window.terminal.shell.start(shellTypeRef.current)
  }, [])

  const onHandleDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: PointerEvent): void => {
      setHeight(clamp(startH + (startY - ev.clientY), MIN_HEIGHT, maxHeight()))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [height])

  return (
    <div
      className="vibe-no-drag relative flex shrink-0 flex-col border-t border-vibe-border bg-[#0b0d12]"
      style={{ height }}
    >
      {/* Drag handle to resize */}
      <div
        onPointerDown={onHandleDown}
        title="Drag to resize"
        className="group flex h-2 w-full cursor-ns-resize items-center justify-center hover:bg-white/5"
      >
        <Icon name="GripHorizontal" size={14} className="text-vibe-muted/50 group-hover:text-vibe-muted" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-vibe-border bg-black/40 px-3 py-1.5">
        <Icon name="Terminal" size={14} className="text-vibe-accent-2" />
        <select
          value={shellType}
          onChange={(e) => changeShell(e.target.value as ShellType)}
          className="rounded-md border border-vibe-border bg-black/30 px-1.5 py-1 text-[11px] text-vibe-text outline-none focus:border-vibe-accent"
        >
          <option value="powershell">PowerShell</option>
          <option value="cmd">Command Prompt</option>
        </select>
        <span className="truncate font-mono text-[10px] text-vibe-muted">{cwd}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPopupOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="ListChecks" size={13} /> Project commands
        </button>
        <button
          type="button"
          onClick={restart}
          title="Restart shell"
          className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="RotateCcw" size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Hide terminal"
          className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="PanelBottomClose" size={15} />
        </button>
      </div>

      {/* Terminal surface + side-by-side project commands split */}
      <div className="flex min-h-0 flex-1">
        <div ref={termHostRef} className="min-w-0 flex-1 p-2" />
        <AnimatePresence>
          {popupOpen && (
            <ProjectCommandsPanel
              onRun={(cmd) => {
                runCommand(cmd)
                setPopupOpen(false)
              }}
              onClose={() => setPopupOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
