import { useEffect } from 'react'
import { Icon } from '../shared/icons'

/**
 * The centered "Close Vibe Bar" confirmation popup. It fills its small, centered window with a
 * single glass card. Yes quits the app; No (or Escape) dismisses the popup via the main process.
 */
export function ConfirmQuitApp(): JSX.Element {
  const cancel = (): void => void window.vibebar.app.cancelQuit()
  const confirm = (): void => void window.vibebar.app.quit()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel()
      else if (event.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full w-full items-center justify-center p-3">
      <div className="vibe-glass is-solid flex w-full flex-col gap-4 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-400">
            <Icon name="Power" size={20} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-vibe-text">Close Vibe Bar?</h2>
            <p className="text-xs text-vibe-muted">This will quit VibeBar completely.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={cancel}
            className="flex-1 rounded-lg border border-vibe-border bg-white/[0.03] py-2 text-sm text-vibe-text transition-colors hover:bg-white/[0.08]"
          >
            No
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 rounded-lg border border-red-500/40 bg-red-500/15 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/25"
          >
            Yes, close
          </button>
        </div>
      </div>
    </div>
  )
}
