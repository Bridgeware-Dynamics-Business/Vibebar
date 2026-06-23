import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteDetail, NotesState, ProjectProfile } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'
import { NoteEditor, type NoteEditorHandle } from './NoteEditor'

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

/** First-run setup shown when the active project has no Notes folder yet. */
function SetupView({
  profile,
  onCreate
}: {
  profile: ProjectProfile | null
  onCreate: (projectName: string, addToGitignore: boolean) => void
}): JSX.Element {
  const [projectName, setProjectName] = useState(profile?.folderName ?? '')
  const [addToGitignore, setAddToGitignore] = useState(true)

  return (
    <div className="vibe-scroll flex-1 space-y-5 overflow-y-auto p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-vibe-border bg-white/5 text-vibe-accent-2">
          <Icon name="StickyNote" size={22} />
        </span>
        <h3 className="text-sm font-semibold text-vibe-text">Set up notes for this project</h3>
        <p className="text-xs leading-relaxed text-vibe-muted">
          Notes are stored as Markdown in a <code className="text-vibe-accent-2">Notes</code> folder
          inside <span className="text-vibe-text">{profile?.folderName ?? 'your project'}</span>, so
          they travel with the repo and stay tied to this project.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-vibe-muted">Name these notes</label>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. Roadmap & ideas"
          className="w-full rounded-lg border border-vibe-border bg-black/30 px-3 py-2 text-sm text-vibe-text outline-none focus:border-vibe-accent"
        />
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-3">
        <span>
          <span className="block text-sm text-vibe-text">Add to .gitignore</span>
          <span className="block text-xs text-vibe-muted">
            Keep notes local and out of commits (recommended).
          </span>
        </span>
        <Toggle checked={addToGitignore} onChange={setAddToGitignore} label="Add Notes to .gitignore" />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCreate(projectName, addToGitignore)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-vibe-accent/90"
        >
          <Icon name="Check" size={15} /> Create notes folder
        </button>
      </div>
    </div>
  )
}

/** The notes library: a grid of note cards plus a "New note" composer. */
function LibraryView({
  state,
  onOpen,
  onCreate,
  onDelete
}: {
  state: NotesState
  onOpen: (id: string) => void
  onCreate: (title: string) => void
  onDelete: (id: string) => void
}): JSX.Element {
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (composing) inputRef.current?.focus()
  }, [composing])

  function submit(): void {
    const t = title.trim()
    if (!t) return
    onCreate(t)
    setTitle('')
    setComposing(false)
  }

  return (
    <div className="vibe-scroll flex-1 space-y-3 overflow-y-auto p-4">
      {composing ? (
        <div className="flex items-center gap-2 rounded-lg border border-vibe-accent/50 bg-vibe-accent/5 p-2">
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setComposing(false)
                setTitle('')
              }
            }}
            placeholder="Note title…"
            className="flex-1 rounded-md border border-vibe-border bg-black/30 px-2.5 py-1.5 text-sm text-vibe-text outline-none focus:border-vibe-accent"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-vibe-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Create
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-vibe-accent/40 py-2.5 text-sm text-vibe-accent transition-colors hover:border-vibe-accent hover:bg-vibe-accent/10"
        >
          <Icon name="Plus" size={15} /> New note
        </button>
      )}

      {state.notes.length === 0 && !composing && (
        <p className="px-1 pt-6 text-center text-xs text-vibe-muted">
          No notes yet. Create your first note to get started.
        </p>
      )}

      <div className="space-y-2">
        {state.notes.map((note) => (
          <div
            key={note.id}
            className="group flex items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            <button
              type="button"
              onClick={() => onOpen(note.id)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
            >
              <span className="w-full truncate text-sm text-vibe-text">{note.title}</span>
              <span className="flex items-center gap-2 text-[11px] text-vibe-muted">
                <span>{timeAgo(note.updatedAt)}</span>
                {note.total > 0 && (
                  <span className="flex items-center gap-1">
                    <Icon name="ListChecks" size={11} />
                    {note.done}/{note.total}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              title="Pop out into a sticky window"
              aria-label="Pop out note"
              onClick={() => void window.vibebar.notes.popOut(note.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-vibe-border text-vibe-muted opacity-0 transition-all hover:border-white/20 hover:text-vibe-text group-hover:opacity-100"
            >
              <Icon name="ExternalLink" size={13} />
            </button>
            <button
              type="button"
              title="Delete note"
              aria-label="Delete note"
              onClick={() => onDelete(note.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 text-red-400 opacity-0 transition-all hover:bg-red-500/10 group-hover:opacity-100"
            >
              <Icon name="Trash2" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function NotesPanel({
  profile,
  onClose,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  onClose: () => void
  solid?: boolean
  onToggleSolid?: () => void
  onDetach?: () => void
}): JSX.Element {
  const [state, setState] = useState<NotesState | null>(null)
  const [active, setActive] = useState<NoteDetail | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const editorRef = useRef<NoteEditorHandle | null>(null)

  const refresh = useCallback(async () => {
    setState(await window.vibebar.notes.getState())
  }, [])

  useEffect(() => {
    void refresh()
    return window.vibebar.notes.onChanged(setState)
  }, [refresh])

  // Reloading state when the active project changes keeps the panel tied to the open project.
  useEffect(() => {
    setActive(null)
    void refresh()
  }, [profile?.rootPath, refresh])

  const openNote = useCallback(async (id: string) => {
    const detail = await window.vibebar.notes.read(id)
    if (!detail) return
    setActive(detail)
    setDraftTitle(detail.title)
    setDirty(false)
  }, [])

  const createNote = useCallback(
    async (title: string) => {
      const { id } = await window.vibebar.notes.create(title)
      if (id) await openNote(id)
    },
    [openNote]
  )

  const deleteNote = useCallback(async (id: string) => {
    await window.vibebar.notes.remove(id)
  }, [])

  const saveActive = useCallback(async (): Promise<void> => {
    if (!active) return
    const markdown = editorRef.current?.getMarkdown() ?? active.markdown
    await window.vibebar.notes.save(active.id, draftTitle, markdown)
    setActive({ ...active, title: draftTitle, markdown })
    setDirty(false)
  }, [active, draftTitle])

  const popOutActive = useCallback(async () => {
    if (!active) return
    await saveActive()
    await window.vibebar.notes.popOut(active.id)
    setActive(null)
  }, [active, saveActive])

  const header = (
    <PanelHeader title="Notes" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
      {onDetach && <DetachButton onDetach={onDetach} label="Detach Notes" />}
    </PanelHeader>
  )

  if (!state) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
      </div>
    )
  }

  if (state.noProject) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="FolderOpen" size={26} className="text-vibe-muted" />
          <p className="text-sm text-vibe-text">No project selected</p>
          <p className="text-xs text-vibe-muted">
            Select a project from the toolbar to start taking notes.
          </p>
        </div>
      </div>
    )
  }

  // Editing a single note inline (with pop-out + save).
  if (active) {
    return (
      <div className="flex h-full flex-col">
        <div className="vibe-drag flex items-center gap-2 border-b border-vibe-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => void saveActive().then(() => setActive(null))}
            title="Back to library"
            aria-label="Back to library"
            className="vibe-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="ChevronRight" size={16} className="rotate-180" />
          </button>
          <input
            value={draftTitle}
            onChange={(e) => {
              setDraftTitle(e.target.value)
              setDirty(true)
            }}
            placeholder="Untitled note"
            className="vibe-no-drag min-w-0 flex-1 bg-transparent text-sm font-semibold text-vibe-text outline-none placeholder:text-vibe-muted"
          />
          <div className="vibe-no-drag flex items-center gap-1">
            <button
              type="button"
              onClick={() => void popOutActive()}
              title="Pop out into a sticky window"
              aria-label="Pop out note"
              className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              <Icon name="ExternalLink" size={16} />
            </button>
            <button
              type="button"
              onClick={() => void saveActive()}
              disabled={!dirty}
              title="Save note"
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dirty
                  ? 'bg-vibe-accent text-white hover:bg-vibe-accent/90'
                  : 'bg-white/5 text-vibe-muted'
              }`}
            >
              {dirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <NoteEditor
            key={active.id}
            ref={editorRef}
            initialMarkdown={active.markdown}
            onChange={() => setDirty(true)}
          />
        </div>
      </div>
    )
  }

  if (!state.hasFolder) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <SetupView
          profile={profile}
          onCreate={(name, ignore) => void window.vibebar.notes.init(name, ignore)}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={state.projectName || 'Notes'}
        onClose={onClose}
        solid={solid}
        onToggleSolid={onToggleSolid}
      >
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Notes" />}
      </PanelHeader>
      <LibraryView
        state={state}
        onOpen={(id) => void openNote(id)}
        onCreate={(title) => void createNote(title)}
        onDelete={(id) => void deleteNote(id)}
      />
    </div>
  )
}
