import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import type { NoteAppendInput, NotesState } from '@shared/types.js'
import { Icon } from './icons'

type NotesBridge = {
  getState: () => Promise<NotesState>
  appendMarkdown: (id: string, markdown: string) => Promise<unknown>
  findSessionLog: () => Promise<{ id: string }>
}

function notesBridge(): NotesBridge | null {
  const w = window as Window & {
    vibebar?: { notes: NotesBridge }
    terminal?: { notes: NotesBridge }
  }
  if (w.vibebar?.notes) return w.vibebar.notes
  if (w.terminal?.notes) return w.terminal.notes
  return null
}

/** Builds a markdown bullet for appending a finding/issue to a note. */
export function buildNoteBullet(input: NoteAppendInput): string {
  const loc = input.fileLine ? ` (${input.fileLine})` : ''
  const excerpt = input.excerpt.trim().slice(0, 400)
  return `- **${input.title}**${loc}\n  ${excerpt.replace(/\n/g, '\n  ')}`
}

export function SaveToNotePicker({
  open,
  onClose,
  markdown,
  onSaved
}: {
  open: boolean
  onClose: () => void
  markdown: string
  onSaved?: () => void
}): JSX.Element | null {
  const [notesState, setNotesState] = useState<NotesState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const bridge = notesBridge()
    if (bridge) void bridge.getState().then(setNotesState)
  }, [open])

  const saveTo = useCallback(
    async (noteId: string) => {
      const bridge = notesBridge()
      if (!bridge) return
      setBusy(true)
      try {
        await bridge.appendMarkdown(noteId, markdown)
        onSaved?.()
        onClose()
      } finally {
        setBusy(false)
      }
    },
    [markdown, onClose, onSaved]
  )

  const saveSessionLog = useCallback(async () => {
    const bridge = notesBridge()
    if (!bridge) return
    setBusy(true)
    try {
      const { id } = await bridge.findSessionLog()
      if (id) await bridge.appendMarkdown(id, markdown)
      onSaved?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }, [markdown, onClose, onSaved])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="vibe-no-drag fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          className="vibe-glass w-full max-w-sm overflow-hidden rounded-2xl border border-vibe-border shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-vibe-border px-4 py-3">
            <span className="text-sm font-semibold text-vibe-text">Save to note</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
          <div className="vibe-scroll max-h-64 overflow-y-auto p-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSessionLog()}
              className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-vibe-text hover:bg-vibe-accent/15 disabled:opacity-50"
            >
              <Icon name="Sparkles" size={16} className="shrink-0 text-vibe-accent-2" />
              <span>
                <span className="block font-medium">New session note</span>
                <span className="block text-[11px] text-vibe-muted">Append to Session log</span>
              </span>
            </button>
            {notesState?.noProject && (
              <p className="px-3 py-4 text-center text-xs text-vibe-muted">Select a project first.</p>
            )}
            {notesState && !notesState.hasFolder && !notesState.noProject && (
              <p className="px-3 py-4 text-center text-xs text-vibe-muted">
                Set up Notes first, or use Session log above.
              </p>
            )}
            {notesState?.notes.map((note) => (
              <button
                key={note.id}
                type="button"
                disabled={busy}
                onClick={() => void saveTo(note.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-vibe-muted hover:bg-white/5 hover:text-vibe-text disabled:opacity-50"
              >
                <Icon name="StickyNote" size={15} className="shrink-0" />
                <span className="truncate">{note.title}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
