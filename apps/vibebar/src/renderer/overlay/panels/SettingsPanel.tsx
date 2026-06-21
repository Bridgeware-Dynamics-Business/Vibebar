import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/api.js'
import type { DockSide } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { PanelHeader, Toggle } from '../../shared/ui'

const DOCKS: { id: DockSide; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'top', label: 'Top' },
  { id: 'right', label: 'Right' }
]

export function SettingsPanel({
  onClose,
  solid,
  onToggleSolid
}: {
  onClose: () => void
  solid?: boolean
  onToggleSolid?: () => void
}): JSX.Element {
  const [state, setState] = useState<SettingsState | null>(null)

  useEffect(() => {
    void window.vibebar.settings.get().then(setState)
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

  if (!state) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          title="Settings"
          onClose={onClose}
          solid={solid}
          onToggleSolid={onToggleSolid}
        />
        <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
      </div>
    )
  }

  const { settings, displays } = state
  const onPrimaryOnly = settings.enabledDisplayIds.length === 0
  const onAll =
    displays.length > 0 && displays.every((d) => settings.enabledDisplayIds.includes(d.id))

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid} />

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
