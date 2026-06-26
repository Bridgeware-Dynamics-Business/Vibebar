import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/api.js'
import type {
  DockSide,
  ProjectProfile,
  ProjectStackOverrides,
  QuickLaunchApp,
  ResourceWidgetId
} from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'

const DOCKS: { id: DockSide; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'top', label: 'Top' },
  { id: 'right', label: 'Right' }
]

const RESOURCE_WIDGETS: { id: ResourceWidgetId; label: string }[] = [
  { id: 'ram', label: 'RAM usage' },
  { id: 'cpu', label: 'CPU load' },
  { id: 'disk', label: 'Disk free space' },
  { id: 'appMem', label: 'VibeBar memory' }
]

export function SettingsPanel({
  onClose,
  onShowOnboardingAgain,
  onOpenCursorAgent,
  solid,
  onToggleSolid,
  onDetach
}: {
  onClose: () => void
  onShowOnboardingAgain?: () => void
  /** Opens the dedicated Cursor Agent / MCP panel from the redirect card. */
  onOpenCursorAgent?: () => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the panel out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [state, setState] = useState<SettingsState | null>(null)
  const [quickLaunch, setQuickLaunch] = useState<QuickLaunchApp[]>([])
  const [githubDesktopPath, setGithubDesktopPath] = useState('')
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [stackOverrides, setStackOverrides] = useState<ProjectStackOverrides>({})

  useEffect(() => {
    void window.vibebar.settings.get().then((s) => {
      setState(s)
      setGithubDesktopPath(s.githubDesktopPath ?? '')
    })
    void window.vibebar.project.get().then(setProfile)
    void window.vibebar.project.getStackOverrides().then(setStackOverrides)
    void window.vibebar.quickLaunch.list().then(setQuickLaunch)
    const offQuickLaunch = window.vibebar.quickLaunch.onChanged(setQuickLaunch)
    const offProject = window.vibebar.project.onChanged((p) => {
      setProfile(p)
      void window.vibebar.project.getStackOverrides().then(setStackOverrides)
    })
    return () => {
      offQuickLaunch()
      offProject()
    }
  }, [])

  async function save(partial: Parameters<typeof window.vibebar.settings.save>[0]): Promise<void> {
    const next = await window.vibebar.settings.save(partial)
    setState(next)
  }

  function toggleDisplay(id: string): void {
    if (!state) return
    const current = state.settings.enabledDisplayIds
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    void save({ enabledDisplayIds: next })
  }

  function showOnAll(): void {
    if (!state) return
    void save({ enabledDisplayIds: state.displays.map((d) => d.id) })
  }

  function showOnPrimary(): void {
    void save({ enabledDisplayIds: [] })
  }

  function toggleConsoleDisplay(id: string): void {
    if (!state) return
    const current = state.settings.errorConsoleDisplayIds
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    void save({ errorConsoleDisplayIds: next })
  }

  function showConsoleOnAll(): void {
    if (!state) return
    void save({ errorConsoleDisplayIds: state.displays.map((d) => d.id) })
  }

  function showConsoleOnPrimary(): void {
    void save({ errorConsoleDisplayIds: [] })
  }

  function toggleResourceDisplay(id: string): void {
    if (!state) return
    const current = state.settings.resourceMonitorDisplayIds ?? []
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    void save({ resourceMonitorDisplayIds: next })
  }

  function showResourceOnAll(): void {
    if (!state) return
    void save({ resourceMonitorDisplayIds: state.displays.map((d) => d.id) })
  }

  function showResourceOnPrimary(): void {
    void save({ resourceMonitorDisplayIds: [] })
  }

  function toggleResourceWidget(id: ResourceWidgetId): void {
    if (!state) return
    const current = state.settings.resourceMonitorWidgets ?? []
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    void save({ resourceMonitorWidgets: next })
  }

  if (!state) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          title="Settings"
          onClose={onClose}
          solid={solid}
          onToggleSolid={onToggleSolid}
        >
          {onDetach && <DetachButton onDetach={onDetach} label="Detach Settings" />}
        </PanelHeader>
        <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
      </div>
    )
  }

  const { settings, displays } = state
  const onPrimaryOnly = settings.enabledDisplayIds.length === 0
  const onAll =
    displays.length > 0 && displays.every((d) => settings.enabledDisplayIds.includes(d.id))
  const consoleOnPrimaryOnly = settings.errorConsoleDisplayIds.length === 0
  const consoleOnAll =
    displays.length > 0 && displays.every((d) => settings.errorConsoleDisplayIds.includes(d.id))
  const resourceEnabled = Boolean(settings.resourceMonitorEnabled)
  const resourceDisplayIds = settings.resourceMonitorDisplayIds ?? []
  const resourceWidgets = settings.resourceMonitorWidgets ?? []
  const resourceOnPrimaryOnly = resourceDisplayIds.length === 0
  const resourceOnAll =
    displays.length > 0 && displays.every((d) => resourceDisplayIds.includes(d.id))

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Settings" />}
      </PanelHeader>

      <div className="vibe-scroll flex-1 space-y-5 overflow-y-auto p-4">
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200/90">
            Toolbar missing?
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            Brings the floating toolbar back on screen and resets its dock position. Also try the
            tray icon or <kbd className="rounded bg-white/10 px-1">Ctrl+Shift+H</kbd>.
          </p>
          <button
            type="button"
            onClick={() => void window.vibebar.overlay.resetToolbar()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/30"
          >
            <Icon name="RefreshCw" size={16} />
            Show toolbar
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Monitors
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            Choose which displays show the toolbar. None selected shows the primary display only.
          </p>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={showOnAll}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition-colors ${
                onAll
                  ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                  : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
              }`}
            >
              <Icon name="Monitor" size={14} /> Show on all
            </button>
            <button
              type="button"
              onClick={showOnPrimary}
              className={`flex-1 rounded-lg border py-1.5 text-xs transition-colors ${
                onPrimaryOnly
                  ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                  : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
              }`}
            >
              Primary only
            </button>
          </div>
          <div className="space-y-1.5">
            {displays.map((d) => {
              const checked = onPrimaryOnly ? d.isPrimary : settings.enabledDisplayIds.includes(d.id)
              return (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-sm text-vibe-text"
                >
                  <Icon name="Monitor" size={16} className="text-vibe-muted" />
                  <span className="flex-1">{d.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDisplay(d.id)}
                    className="accent-vibe-accent"
                  />
                </label>
              )
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Error Console
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            Choose which displays show the in-app error console (bottom-left). None selected shows
            the primary display only. Closing it on any monitor closes it on all of them.
          </p>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={showConsoleOnAll}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition-colors ${
                consoleOnAll
                  ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                  : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
              }`}
            >
              <Icon name="Monitor" size={14} /> Show on all
            </button>
            <button
              type="button"
              onClick={showConsoleOnPrimary}
              className={`flex-1 rounded-lg border py-1.5 text-xs transition-colors ${
                consoleOnPrimaryOnly
                  ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                  : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
              }`}
            >
              Primary only
            </button>
          </div>
          <div className="space-y-1.5">
            {displays.map((d) => {
              const checked = consoleOnPrimaryOnly
                ? d.isPrimary
                : settings.errorConsoleDisplayIds.includes(d.id)
              return (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-sm text-vibe-text"
                >
                  <Icon name="Bug" size={16} className="text-vibe-muted" />
                  <span className="flex-1">{d.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleConsoleDisplay(d.id)}
                    className="accent-vibe-accent"
                  />
                </label>
              )
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-vibe-muted">
              System resource usage
            </h3>
            <Toggle
              checked={resourceEnabled}
              onChange={(next) => void save({ resourceMonitorEnabled: next })}
            />
          </div>
          <p className="mb-2 text-xs text-vibe-muted">
            Floating widgets show live RAM, CPU, disk space, and VibeBar memory above all windows.
            By default they stack beside the toolbar in an L shape and follow it when you move the
            bar. Drag any widget away to pin it independently.
          </p>
          {resourceEnabled && (
            <>
              <div className="mb-3 flex items-center justify-between rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2">
                <div>
                  <span className="text-sm text-vibe-text">Sync with toolbar</span>
                  <p className="text-[11px] text-vibe-muted">
                    Widgets follow the toolbar until you drag one to a new spot.
                  </p>
                </div>
                <Toggle
                  checked={settings.resourceMonitorSyncWithToolbar !== false}
                  onChange={(next) => void save({ resourceMonitorSyncWithToolbar: next })}
                />
              </div>
              {settings.resourceMonitorSyncWithToolbar !== false && (
                <div className="mb-3">
                  <p className="mb-2 text-xs text-vibe-muted">Stack synced widgets</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void save({ resourceMonitorPlacement: 'below' })}
                      className={`flex-1 rounded-lg border py-2 text-xs transition-colors ${
                        (settings.resourceMonitorPlacement ?? 'below') === 'below'
                          ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                          : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
                      }`}
                    >
                      Below toolbar (L)
                    </button>
                    <button
                      type="button"
                      onClick={() => void save({ resourceMonitorPlacement: 'above' })}
                      className={`flex-1 rounded-lg border py-2 text-xs transition-colors ${
                        settings.resourceMonitorPlacement === 'above'
                          ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                          : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
                      }`}
                    >
                      Above toolbar (reverse L)
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-vibe-muted">
                    Below places a horizontal row directly under the toolbar. Above places the same
                    row directly above it. Toggle sync off and on to reset widgets you moved manually.
                  </p>
                </div>
              )}
              <div className="mb-3 space-y-1.5">
                {RESOURCE_WIDGETS.map((w) => (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-sm text-vibe-text"
                  >
                    <Icon name="Activity" size={16} className="text-vibe-muted" />
                    <span className="flex-1">{w.label}</span>
                    <input
                      type="checkbox"
                      checked={resourceWidgets.includes(w.id)}
                      onChange={() => toggleResourceWidget(w.id)}
                      className="accent-vibe-accent"
                    />
                  </label>
                ))}
              </div>
              <p className="mb-2 text-xs text-vibe-muted">
                Choose which displays show the widgets. None selected shows the primary display
                only.
              </p>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={showResourceOnAll}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition-colors ${
                    resourceOnAll
                      ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                      : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
                  }`}
                >
                  <Icon name="Monitor" size={14} /> Show on all
                </button>
                <button
                  type="button"
                  onClick={showResourceOnPrimary}
                  className={`flex-1 rounded-lg border py-1.5 text-xs transition-colors ${
                    resourceOnPrimaryOnly
                      ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                      : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
                  }`}
                >
                  Primary only
                </button>
              </div>
              <div className="space-y-1.5">
                {displays.map((d) => {
                  const checked = resourceOnPrimaryOnly ? d.isPrimary : resourceDisplayIds.includes(d.id)
                  return (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-sm text-vibe-text"
                    >
                      <Icon name="Monitor" size={16} className="text-vibe-muted" />
                      <span className="flex-1">{d.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleResourceDisplay(d.id)}
                        className="accent-vibe-accent"
                      />
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Dock position
          </h3>
          <div className="flex gap-2">
            {DOCKS.map((dock) => (
              <button
                key={dock.id}
                type="button"
                onClick={() => void save({ dock: dock.id })}
                className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                  settings.dock === dock.id
                    ? 'border-vibe-accent bg-vibe-accent/15 text-white'
                    : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:text-vibe-text'
                }`}
              >
                {dock.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Behavior
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-vibe-text">Harden prompts by default</span>
            <Toggle
              checked={settings.guardrailsEnabled}
              onChange={(next) => void save({ guardrailsEnabled: next })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-vibe-text">Launch on startup</span>
            <Toggle
              checked={settings.launchOnStartup}
              onChange={(next) => void save({ launchOnStartup: next })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-vibe-text">Global hotkeys</span>
            <Toggle
              checked={settings.hotkeysEnabled}
              onChange={(next) => void save({ hotkeysEnabled: next })}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-vibe-muted">
            Ctrl+Alt+Shift+P command palette · Ctrl+Shift+H hide/show toolbar · Ctrl+Shift+T Smart
            Terminal
          </p>
          <button
            type="button"
            onClick={() => onShowOnboardingAgain?.()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-xs font-medium text-vibe-text hover:bg-white/10"
          >
            <Icon name="Sparkles" size={14} />
            Show onboarding again
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Cursor Agent
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            MCP connection status, the mcp.json snippet, and Cursor automation toggles now live in
            their own toolbar menu.
          </p>
          <button
            type="button"
            onClick={() => onOpenCursorAgent?.()}
            className="flex w-full items-center gap-2.5 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-vibe-accent/50 bg-vibe-accent/15 text-vibe-accent">
              <Icon name="PlugZap" size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-vibe-text">Open Cursor Agent</span>
              <span className="block text-[11px] text-vibe-muted">Plug icon on the toolbar</span>
            </span>
            <Icon name="ChevronRight" size={16} className="shrink-0 text-vibe-muted" />
          </button>
        </section>

        {profile &&
          profile.language === 'unknown' &&
          profile.framework === 'unknown' && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
                Stack detection
              </h3>
              <p className="mb-2 text-xs text-vibe-muted">
                Auto-detection could not infer this project&apos;s stack. Override language, framework,
                and test runner for prompts, parsers, and verify recipes.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block text-[10px] text-vibe-muted">
                  Language
                  <select
                    value={stackOverrides.language ?? ''}
                    onChange={(e) =>
                      setStackOverrides((o) => ({ ...o, language: e.target.value as ProjectStackOverrides['language'] }))
                    }
                    className="mt-1 w-full rounded-md border border-vibe-border bg-black/20 px-2 py-1.5 text-xs text-vibe-text"
                  >
                    <option value="">—</option>
                    {['typescript', 'javascript', 'python', 'rust', 'go', 'php'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] text-vibe-muted">
                  Framework
                  <select
                    value={stackOverrides.framework ?? ''}
                    onChange={(e) =>
                      setStackOverrides((o) => ({ ...o, framework: e.target.value as ProjectStackOverrides['framework'] }))
                    }
                    className="mt-1 w-full rounded-md border border-vibe-border bg-black/20 px-2 py-1.5 text-xs text-vibe-text"
                  >
                    <option value="">—</option>
                    {['electron', 'next', 'react', 'vue', 'svelte', 'fastapi', 'flask', 'django', 'laravel'].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="block text-[10px] text-vibe-muted">
                  Test runner
                  <select
                    value={stackOverrides.testRunner ?? ''}
                    onChange={(e) =>
                      setStackOverrides((o) => ({
                        ...o,
                        testRunner: e.target.value as ProjectStackOverrides['testRunner']
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-vibe-border bg-black/20 px-2 py-1.5 text-xs text-vibe-text"
                  >
                    <option value="">—</option>
                    {['vitest', 'jest', 'pytest', 'playwright'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void window.vibebar.project.saveStackOverrides(stackOverrides).then(setStackOverrides)
                  }
                  className="rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white"
                >
                  Save overrides
                </button>
                <button
                  type="button"
                  onClick={() => void window.vibebar.project.clearStackOverrides().then(setStackOverrides)}
                  className="rounded-lg px-3 py-1.5 text-xs text-vibe-muted hover:text-vibe-text"
                >
                  Clear overrides
                </button>
              </div>
            </section>
          )}

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            GitHub Desktop
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            Optional path override when auto-detection fails. Leave empty to auto-detect.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-2.5 py-2">
            <Icon name="Github" size={16} className="shrink-0 text-vibe-muted" />
            <input
              value={githubDesktopPath}
              onChange={(e) => setGithubDesktopPath(e.target.value)}
              onBlur={() =>
                void window.vibebar.github.setDesktopPath(githubDesktopPath).then((r) => {
                  setGithubDesktopPath(r.path)
                })
              }
              placeholder="Auto-detect GitHub Desktop…"
              className="min-w-0 flex-1 bg-transparent text-sm text-vibe-text outline-none placeholder:text-vibe-muted"
            />
            <button
              type="button"
              title="Locate GitHub Desktop executable"
              onClick={() =>
                void window.vibebar.github.locateDesktop().then((r) => setGithubDesktopPath(r.path))
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-vibe-border text-vibe-muted hover:border-white/20 hover:text-vibe-text"
            >
              <Icon name="FolderOpen" size={13} />
            </button>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Quick Launch
          </h3>
          <p className="mb-2 text-xs text-vibe-muted">
            One-click launchers in the toolbar (under GitHub). Launching opens your current project
            in the app when one is selected.
          </p>
          <div className="space-y-1.5">
            {quickLaunch.map((app) => (
              <div
                key={app.id}
                className={`flex items-center gap-2.5 rounded-lg border border-vibe-border bg-white/[0.03] px-2.5 py-2 transition-opacity ${
                  app.visible === false ? 'opacity-55' : ''
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-vibe-accent-2/50 bg-vibe-accent-2/12 text-vibe-accent-2">
                  <Icon name={app.icon} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-vibe-text">{app.name}</span>
                    {app.builtIn && (
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-vibe-muted">
                        Built-in
                      </span>
                    )}
                  </div>
                  <p
                    className={`truncate text-[11px] ${app.path ? 'text-vibe-muted' : 'text-amber-400'}`}
                    title={app.path || undefined}
                  >
                    {app.path || 'Path not set — click the pencil to locate it'}
                  </p>
                </div>
                {(() => {
                  const isVisible = app.visible !== false
                  return (
                    <button
                      type="button"
                      title={
                        isVisible
                          ? `${app.name} is shown in the toolbar — click to hide`
                          : `${app.name} is hidden from the toolbar — click to show`
                      }
                      aria-label={isVisible ? `Hide ${app.name} from toolbar` : `Show ${app.name} in toolbar`}
                      aria-pressed={isVisible}
                      onClick={() =>
                        void window.vibebar.quickLaunch
                          .setVisible(app.id, !isVisible)
                          .then(setQuickLaunch)
                      }
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        isVisible
                          ? 'border-vibe-accent-2/50 bg-vibe-accent-2/12 text-vibe-accent-2 hover:bg-vibe-accent-2/20'
                          : 'border-vibe-border text-vibe-muted hover:border-white/20 hover:text-vibe-text'
                      }`}
                    >
                      <Icon name={isVisible ? 'Eye' : 'EyeOff'} size={13} />
                    </button>
                  )
                })()}
                <button
                  type="button"
                  title={`Set ${app.name}'s executable path`}
                  aria-label={`Set ${app.name}'s executable path`}
                  onClick={() => void window.vibebar.quickLaunch.locate(app.id).then(setQuickLaunch)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-vibe-border text-vibe-muted transition-colors hover:border-white/20 hover:text-vibe-text"
                >
                  <Icon name="Pencil" size={13} />
                </button>
                <button
                  type="button"
                  title={`Remove ${app.name}`}
                  aria-label={`Remove ${app.name}`}
                  onClick={() => void window.vibebar.quickLaunch.remove(app.id).then(setQuickLaunch)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Icon name="Trash2" size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void window.vibebar.quickLaunch.add().then(setQuickLaunch)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-vibe-accent-2/40 py-2 text-xs text-vibe-accent-2 transition-colors hover:border-vibe-accent-2 hover:bg-vibe-accent-2/10"
          >
            <Icon name="Plus" size={14} /> Add application
          </button>
        </section>
      </div>

      <div className="border-t border-vibe-border p-3">
        <button
          type="button"
          onClick={() => void window.vibebar.app.quit()}
          className="w-full rounded-lg border border-red-500/30 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
        >
          Quit VibeBar
        </button>
      </div>
    </div>
  )
}
