import type { SyncInstanceConfig } from '@vibebar/codesync/api'
import { resolveSyncDestRoot, sourceContextFolderName } from '@vibebar/codesync/destRoot'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../shared/icons'
import { FillToggle, useFillToggle } from '../shared/ui'

const MAX_LINES_PER_INSTANCE = 250

function mbToBytes(mb: number): number | null {
  if (!Number.isFinite(mb) || mb <= 0) return null
  return Math.round(mb * 1024 * 1024)
}

function bytesToMb(bytes: number | null): number {
  if (bytes === null) return 0
  return Math.round(bytes / 1024 / 1024)
}

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}\u2026`
}

interface FieldProps {
  label: string
  value: string
  onBrowse: () => void
}

function FolderField({ label, value, onBrowse }: FieldProps): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-xs text-vibe-muted">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          placeholder="Choose folder…"
          className="flex-1 rounded-lg border border-vibe-border bg-black/30 px-3 py-2 text-sm text-vibe-text"
        />
        <button
          type="button"
          onClick={onBrowse}
          className="rounded-lg border border-vibe-border bg-white/5 px-3 py-2 text-sm text-vibe-text hover:bg-white/10"
        >
          Browse…
        </button>
      </div>
    </div>
  )
}

export function CodeSyncApp(): JSX.Element {
  const [instances, setInstances] = useState<SyncInstanceConfig[]>([])
  const [ignoreText, setIgnoreText] = useState('')
  const [debounceMs, setDebounceMs] = useState(350)
  const [maxMb, setMaxMb] = useState(100)
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [feedback, setFeedback] = useState('')
  // Fill toggle: solid (opaque, easiest to read) vs. glass (translucent). Defaults to solid
  // since this is a working tool, and the choice persists across sessions.
  const [solid, toggleSolid] = useFillToggle('codesync.solid')
  const logRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  const appendLog = useCallback((instanceId: string, line: string) => {
    setLogs((prev) => {
      const buf = [...(prev[instanceId] ?? []), line].slice(-MAX_LINES_PER_INSTANCE)
      return { ...prev, [instanceId]: buf }
    })
  }, [])

  const refreshStatus = useCallback(async () => {
    const status = await window.codesync.syncStatus()
    setRunning(new Set(status.instances.filter((i) => i.running).map((i) => i.id)))
  }, [])

  useEffect(() => {
    void window.codesync.loadConfig().then((cfg) => {
      setIgnoreText(cfg.ignoreText)
      setDebounceMs(cfg.debounceMs)
      setMaxMb(bytesToMb(cfg.maxFileBytes))
      setInstances(
        cfg.instances.length
          ? cfg.instances
          : [{ id: crypto.randomUUID(), sourcePath: '', syncPath: '' }]
      )
    })
    void refreshStatus()
    const off = window.codesync.onLog((entry) => appendLog(entry.instanceId, entry.line))
    // The window is hidden (not destroyed) when closed, and the controller stops every sync on
    // hide/close. Re-query on focus/visibility so the toggles reflect that stopped state instead
    // of a stale "running" from before it was closed.
    const onFocus = (): void => void refreshStatus()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [appendLog, refreshStatus])

  useEffect(() => {
    for (const ta of Object.values(logRefs.current)) {
      if (ta) ta.scrollTop = ta.scrollHeight
    }
  }, [logs])

  function localLog(id: string, message: string): void {
    appendLog(id, `[${new Date().toISOString()}] ${message}`)
  }

  function updateInstance(id: string, patch: Partial<SyncInstanceConfig>): void {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function browse(id: string, field: 'sourcePath' | 'syncPath'): Promise<void> {
    const path = await window.codesync.pickFolder()
    if (path) updateInstance(id, { [field]: path })
  }

  function addInstance(): void {
    setInstances((prev) => [...prev, { id: crypto.randomUUID(), sourcePath: '', syncPath: '' }])
  }

  function removeInstance(id: string): void {
    setInstances((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.id !== id)))
  }

  async function startOne(inst: SyncInstanceConfig): Promise<void> {
    if (!inst.sourcePath || !inst.syncPath) {
      localLog(inst.id, 'Choose both folders first.')
      return
    }
    const destRoot = resolveSyncDestRoot(inst.syncPath, inst.sourcePath)
    const result = await window.codesync.startSync({
      instanceId: inst.id,
      sourceRoot: inst.sourcePath,
      destRoot,
      ignoreText,
      maxFileBytes: mbToBytes(maxMb),
      debounceMs: Number.isFinite(debounceMs) ? debounceMs : 350
    })
    if (result.ok) {
      localLog(inst.id, `Sync started → ${destRoot}`)
      void refreshStatus()
    } else {
      localLog(inst.id, `Start failed: ${result.error}`)
    }
  }

  async function stopOne(id: string): Promise<void> {
    await window.codesync.stopSync(id)
    localLog(id, 'Sync stopped.')
    void refreshStatus()
  }

  async function save(): Promise<void> {
    await window.codesync.saveConfig({
      instances,
      ignoreText,
      debounceMs: Number.isFinite(debounceMs) ? debounceMs : 350,
      maxFileBytes: mbToBytes(maxMb)
    })
    setFeedback('Settings saved.')
    window.setTimeout(() => setFeedback(''), 4000)
  }

  // Solid stays mostly opaque for readability; glass keeps the frosted, translucent look.
  const shellClass = solid
    ? 'bg-vibe-bg/95 backdrop-blur-xl backdrop-saturate-150'
    : 'bg-vibe-bg/55 backdrop-blur-xl backdrop-saturate-150'

  return (
    <div className="flex h-screen w-screen flex-col p-2 text-vibe-text">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-vibe-border shadow-2xl shadow-black/50 ring-1 ring-white/5 ${shellClass}`}
      >
        <header className="vibe-drag flex items-center gap-2 border-b border-vibe-border bg-black/30 px-4 py-3">
          <Icon name="FolderSync" size={16} className="text-vibe-accent-2" />
          <span className="text-sm font-semibold tracking-wide">Code Sync</span>
          <div className="flex-1" />
          <div className="vibe-no-drag flex items-center gap-1">
            <FillToggle solid={solid} onToggle={toggleSolid} />
            <button
              type="button"
              onClick={() => void window.codesyncWindow.hide()}
              title="Hide (reopen from the toolbar)"
              aria-label="Hide Code Sync"
              className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        </header>

        <div className="vibe-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-xs leading-relaxed text-vibe-muted">
            One-way mirror tuned for AI context: only files that actually changed are copied.
            Defaults skip <code className="text-vibe-accent-2">node_modules</code>,{' '}
            <code className="text-vibe-accent-2">.git</code>, caches, and build output. Multiple
            instances run side by side.
          </p>

          <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={addInstance}
          className="rounded-lg border border-vibe-border bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          + Add sync instance
        </button>
      </div>

      <div className="space-y-4">
        {instances.map((inst) => {
          const on = running.has(inst.id)
          return (
            <section
              key={inst.id}
              className="rounded-2xl border border-vibe-border bg-black/25 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  Instance <code className="text-vibe-muted">{shortId(inst.id)}</code>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-vibe-muted'
                  }`}
                >
                  {on ? 'Running' : 'Stopped'}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FolderField
                  label="Source folder"
                  value={inst.sourcePath}
                  onBrowse={() => void browse(inst.id, 'sourcePath')}
                />
                <div className="space-y-1">
                  <FolderField
                    label="AI context folder (parent)"
                    value={inst.syncPath}
                    onBrowse={() => void browse(inst.id, 'syncPath')}
                  />
                  {inst.sourcePath && inst.syncPath ? (
                    <p className="text-[11px] text-vibe-muted">
                      Mirrors into{' '}
                      <code className="text-vibe-accent-2">
                        {sourceContextFolderName(inst.sourcePath)}
                      </code>{' '}
                      under this folder.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void startOne(inst)}
                  disabled={on}
                  className="rounded-lg bg-vibe-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => void stopOne(inst.id)}
                  disabled={!on}
                  className="rounded-lg border border-vibe-border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => removeInstance(inst.id)}
                  disabled={on || instances.length <= 1}
                  className="rounded-lg border border-vibe-border px-3 py-1.5 text-sm text-vibe-muted disabled:opacity-40"
                >
                  Remove
                </button>
              </div>

              <textarea
                ref={(el) => {
                  logRefs.current[inst.id] = el
                }}
                readOnly
                rows={8}
                value={(logs[inst.id] ?? []).join('\n')}
                className="vibe-scroll mt-3 w-full resize-none rounded-lg border border-vibe-border bg-black/30 p-2 font-mono text-[11px] text-vibe-muted"
              />
            </section>
          )
        })}
      </div>

      <section className="mt-6 space-y-4 rounded-2xl border border-vibe-border bg-black/25 p-4">
        <div>
          <label className="text-xs text-vibe-muted">
            Extra ignore patterns (one per line, glob) — shared by all instances
          </label>
          <textarea
            rows={4}
            value={ignoreText}
            onChange={(e) => setIgnoreText(e.target.value)}
            spellCheck={false}
            className="vibe-scroll mt-1 w-full resize-y rounded-lg border border-vibe-border bg-black/30 p-2 font-mono text-xs"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-vibe-muted">Debounce (ms)</label>
            <input
              type="number"
              min={50}
              step={10}
              value={debounceMs}
              onChange={(e) => setDebounceMs(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-vibe-border bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-vibe-muted">Max file size (MB, 0 = no limit)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={maxMb}
              onChange={(e) => setMaxMb(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-vibe-border bg-black/30 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
          Warning: files in each instance&apos;s mirror folder (e.g.{' '}
          <code className="text-amber-200">components context</code>) that are not in its source
          (and not ignored) are deleted during sync.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-lg bg-vibe-accent px-4 py-2 text-sm font-medium text-white"
          >
            Save settings
          </button>
          <span className="text-xs text-vibe-muted">{feedback}</span>
        </div>
      </section>
        </div>
      </div>
    </div>
  )
}
