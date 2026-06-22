import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/api.js'
import type { DockSide, QuickLaunchApp } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'

const DOCKS: { id: DockSide; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'top', label: 'Top' },
  { id: 'right', label: 'Right' }
]

export function SettingsPanel({
  onClose,
  solid,
  onToggleSolid,
  onDetach
}: {
  onClose: () => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the panel out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [state, setState] = useState<SettingsState | null>(null)
  const [quickLaunch, setQuickLaunch] = useState<QuickLaunchApp[]>([])

  useEffect(() => {
    void window.vibebar.settings.get().then(setState)
    void window.vibebar.quickLaunch.list().then(setQuickLaunch)
    // Keep this panel in sync when the list changes from the toolbar or another window.
    return window.vibebar.quickLaunch.onChanged(setQuickLaunch)
  }, [])

  async function save(partial: Parameters<typeof window.vibebar.settings.save>[0]): Promise<void> {
    setState(await window.vibebar.settings.save(partial))
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

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Settings" />}
      </PanelHeader>

      <div className="vibe-scroll flex-1 space-y-5 overflow-y-auto p-4">
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
