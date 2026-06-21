import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Icon } from './icons'

/**
 * Shown when an automatic clipboard write fails (or as a manual escape hatch). Presents the
 * text in a selected textarea so the user can copy it by hand. Reused by every copy flow.
 */
export function ClipboardFallbackModal({
  open,
  text,
  onClose
}: {
  open: boolean
  text: string
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="vibe-glass vibe-no-drag w-full max-w-md rounded-2xl p-4"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-vibe-text">Copy manually</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
                aria-label="Close"
              >
                <Icon name="X" size={16} />
              </button>
            </div>
            <p className="mb-2 text-xs text-vibe-muted">
              Automatic copy was blocked. Select all and copy this text yourself.
            </p>
            <textarea
              ref={ref}
              readOnly
              value={text}
              rows={10}
              className="vibe-scroll w-full resize-none rounded-lg border border-vibe-border bg-black/30 p-3 font-mono text-xs text-vibe-text"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
