import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'

export function AuditExportMenu({
  onExport,
  compact
}: {
  onExport: (format: 'sarif' | 'markdown') => Promise<void>
  /** Smaller styling for the terminal dock. */
  compact?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const run = useCallback(
    async (format: 'sarif' | 'markdown') => {
      setBusy(true)
      try {
        await onExport(format)
      } finally {
        setBusy(false)
        setOpen(false)
      }
    },
    [onExport]
  )

  const btnClass = compact
    ? 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-vibe-muted hover:bg-white/10 hover:text-vibe-text disabled:opacity-50'
    : 'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-vibe-muted hover:text-vibe-text disabled:opacity-50'

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy} className={btnClass}>
        <Icon name={busy ? 'Loader2' : 'Download'} size={compact ? 12 : 14} className={busy ? 'animate-spin' : ''} />{' '}
        Export
      </button>
      {open && (
        <div
          className={`absolute bottom-full right-0 z-10 mb-1 overflow-hidden rounded-lg border border-vibe-border bg-vibe-bg/95 py-1 shadow-xl backdrop-blur ${compact ? 'w-40' : 'w-44'}`}
        >
          <button
            type="button"
            onClick={() => void run('sarif')}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-vibe-text hover:bg-white/10 ${compact ? 'text-[11px]' : 'text-xs'}`}
          >
            <Icon name="FileText" size={compact ? 12 : 13} /> SARIF {compact ? '(CI)' : '2.1.0 (CI)'}
          </button>
          <button
            type="button"
            onClick={() => void run('markdown')}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-vibe-text hover:bg-white/10 ${compact ? 'text-[11px]' : 'text-xs'}`}
          >
            <Icon name="FileText" size={compact ? 12 : 13} /> Markdown {compact ? '' : 'report'}
          </button>
        </div>
      )}
    </div>
  )
}
