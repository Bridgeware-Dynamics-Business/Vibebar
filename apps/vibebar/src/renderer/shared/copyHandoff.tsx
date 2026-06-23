import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

export interface CopyHandoffNotice {
  message: string
  showOpenCursor: boolean
}

/** Builds the post-copy notice text; returns null when copy failed. */
export function buildHandoffNotice(copied: boolean, redactedCount = 0): CopyHandoffNotice | null {
  if (!copied) return null
  const message =
    redactedCount > 0
      ? `Copied with ${redactedCount} secret${redactedCount === 1 ? '' : 's'} redacted.`
      : 'Copied to clipboard.'
  return { message, showOpenCursor: true }
}

/**
 * Toast shown after meaningful clipboard copies — optional "Open Cursor" via quickLaunch.
 * Auto-dismisses after a few seconds; user can dismiss early.
 */
export function CopyHandoffToast({
  notice,
  onDismiss,
  onOpenCursor
}: {
  notice: CopyHandoffNotice | null
  onDismiss: () => void
  /** When omitted, the Open Cursor button is hidden. */
  onOpenCursor?: () => void | Promise<void>
}): JSX.Element | null {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!notice) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(onDismiss, 5000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [notice, onDismiss])

  async function openCursor(): Promise<void> {
    if (onOpenCursor) await onOpenCursor()
    onDismiss()
  }

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="vibe-glass vibe-no-drag pointer-events-auto absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 text-xs text-vibe-text shadow-lg"
        >
          <Icon name="Check" size={14} className="shrink-0 text-emerald-400" />
          <span>{notice.message}</span>
          {notice.showOpenCursor && onOpenCursor && (
            <button
              type="button"
              onClick={() => void openCursor()}
              className="rounded-md bg-vibe-accent/20 px-2 py-0.5 text-[11px] font-medium text-vibe-accent-2 hover:bg-vibe-accent/30"
            >
              Open Cursor
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss"
            aria-label="Dismiss"
            className="rounded-md p-0.5 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="X" size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Hook pairing copy-outcome handling with the handoff toast + clipboard fallback modal state. */
export function useCopyHandoff(): {
  onCopyOutcome: (copied: boolean, text: string, redactedCount?: number) => void
  handoffNotice: CopyHandoffNotice | null
  dismissHandoff: () => void
  fallback: { open: boolean; text: string }
  closeFallback: () => void
} {
  const [handoffNotice, setHandoffNotice] = useState<CopyHandoffNotice | null>(null)
  const [fallback, setFallback] = useState<{ open: boolean; text: string }>({ open: false, text: '' })

  const dismissHandoff = useCallback(() => setHandoffNotice(null), [])

  const onCopyOutcome = useCallback((copied: boolean, text: string, redactedCount = 0) => {
    if (!copied) {
      setFallback({ open: true, text })
      return
    }
    setHandoffNotice(buildHandoffNotice(copied, redactedCount))
  }, [])

  const closeFallback = useCallback(() => setFallback({ open: false, text: '' }), [])

  return { onCopyOutcome, handoffNotice, dismissHandoff, fallback, closeFallback }
}
