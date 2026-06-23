import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteDetail } from '@shared/types.js'
import { Icon } from '../shared/icons'
import { FillToggle, useFillToggle } from '../shared/ui'
import { NoteEditor, type NoteEditorHandle } from '../overlay/panels/NoteEditor'

const AUTOSAVE_MS = 800

/**
 * A single note as a standalone "sticky" window. Reuses the shared NoteEditor and autosaves
 * (debounced) so the note behaves like a Microsoft Sticky Note — it lives on screen on its own,
 * survives the main Notes panel closing, and quietly persists to disk as the user types.
 */
export function NoteWindowApp({ noteId }: { noteId: string }): JSX.Element {
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [solid, toggleSolid] = useFillToggle(`note.${noteId}.solid`)
  const editorRef = useRef<NoteEditorHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef('')

  useEffect(() => {
    void window.vibebar.notes.read(noteId).then((detail) => {
      if (detail) {
        setNote(detail)
        setTitle(detail.title)
        titleRef.current = detail.title
        document.title = `${detail.title || 'Note'} — VibeBar`
      } else {
        setMissing(true)
      }
    })
  }, [noteId])

  const save = useCallback(async (): Promise<void> => {
    if (!note) return
    const markdown = editorRef.current?.getMarkdown() ?? note.markdown
    setSaving(true)
    await window.vibebar.notes.save(note.id, titleRef.current, markdown)
    setSaving(false)
  }, [note])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }, [save])

  // Flush a pending save when the window is closing so nothing is lost.
  useEffect(() => {
    const flush = (): void => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      void save()
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [save])

  const shellClass = solid
    ? 'bg-vibe-bg/95 backdrop-blur-xl backdrop-saturate-150'
    : 'bg-vibe-bg/55 backdrop-blur-xl backdrop-saturate-150'

  return (
    <div className="relative flex h-screen w-screen flex-col p-2 text-vibe-text">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-vibe-border shadow-2xl shadow-black/50 ring-1 ring-white/5 ${shellClass}`}
      >
        <header className="vibe-drag flex items-center gap-2 border-b border-vibe-border bg-black/30 px-3 py-2.5">
          <Icon name="StickyNote" size={15} className="shrink-0 text-vibe-accent-2" />
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              titleRef.current = e.target.value
              document.title = `${e.target.value || 'Note'} — VibeBar`
              scheduleSave()
            }}
            placeholder="Untitled note"
            disabled={missing}
            className="vibe-no-drag min-w-0 flex-1 bg-transparent text-sm font-semibold text-vibe-text outline-none placeholder:text-vibe-muted"
          />
          <span className="vibe-no-drag shrink-0 text-[10px] text-vibe-muted">
            {saving ? 'Saving…' : 'Saved'}
          </span>
          <div className="vibe-no-drag flex items-center gap-1">
            <FillToggle solid={solid} onToggle={toggleSolid} />
            <button
              type="button"
              onClick={() => {
                if (saveTimer.current) clearTimeout(saveTimer.current)
                void save().finally(() => window.close())
              }}
              title="Close note"
              aria-label="Close note"
              className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {missing ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Icon name="AlertTriangle" size={22} className="text-amber-400" />
              <p className="text-sm text-vibe-text">This note is no longer available</p>
              <p className="text-xs text-vibe-muted">
                It may have been deleted, or its project is no longer the active one.
              </p>
            </div>
          ) : note ? (
            <NoteEditor
              key={note.id}
              ref={editorRef}
              initialMarkdown={note.markdown}
              onChange={scheduleSave}
            />
          ) : (
            <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
          )}
        </div>
      </div>
    </div>
  )
}
