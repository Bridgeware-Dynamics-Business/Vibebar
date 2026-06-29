import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from 'tiptap-markdown'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatContextFolderInsert, matchContextFolderTrigger } from '@shared/contextFolderSuggestion.js'
import { Icon } from '../../shared/icons'
import { NoteItemCopy } from './noteItemCopy'

/** A live keyword suggestion: the doc range to replace and where to float the hint on screen. */
interface ContextFolderSuggestion {
  from: number
  to: number
  left: number
  top: number
  /** Matched suffix as typed (casing preserved), used for insert preview and accept. */
  typedSuffix: string
}

/** Copies a single item's text using the app clipboard bridge, falling back to the Web API. */
function copyItemText(text: string): void {
  const bridge = window.vibebar?.clipboard
  if (bridge) {
    void bridge.write(text)
    return
  }
  void navigator.clipboard?.writeText(text)
}

/** Imperative handle so a parent can pull the current note body as Markdown on save. */
export interface NoteEditorHandle {
  getMarkdown: () => string
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: string
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-vibe-accent bg-vibe-accent/20 text-white'
          : 'border-vibe-border text-vibe-muted hover:border-white/20 hover:text-vibe-text'
      }`}
    >
      <Icon name={icon} size={14} />
    </button>
  )
}

/**
 * The shared rich-note editor used by both the inline Notes panel and the sticky pop-out window.
 * Built on TipTap (ProseMirror): bold text, bullet lists, and clickable task-list checkboxes that
 * strike through completed items. Content is read/written as Markdown so notes stay human-readable
 * and git-friendly on disk. Remount (via a `key` on the note id) to load a different note.
 */
export const NoteEditor = forwardRef<NoteEditorHandle, {
  initialMarkdown: string
  editable?: boolean
  onChange?: () => void
}>(function NoteEditor({ initialMarkdown, editable = true, onChange }, ref): JSX.Element {
  // A bump counter so the toolbar's active states refresh as the selection/content changes.
  const [, setTick] = useState(0)
  // Optional separator lines between items, to help sort thoughts. Preference persists.
  const [dividers, setDividers] = useState<boolean>(
    () => window.localStorage.getItem('note.dividers') === 'true'
  )

  useEffect(() => {
    window.localStorage.setItem('note.dividers', String(dividers))
  }, [dividers])

  // Inline "type a keyword → press Enter to insert `phrase:: path`" suggestion.
  // The path is resolved once from the active project; the popup floats next to the caret.
  // On accept the typed phrase is kept, `::` is added, then the folder path is appended.
  const [contextPath, setContextPath] = useState<string | null>(null)
  const contextPathRef = useRef<string | null>(null)
  const [suggestion, setSuggestion] = useState<ContextFolderSuggestion | null>(null)
  const suggestionRef = useRef<ContextFolderSuggestion | null>(null)
  const editorInstanceRef = useRef<Editor | null>(null)

  const updateSuggestion = useCallback((next: ContextFolderSuggestion | null) => {
    suggestionRef.current = next
    setSuggestion(next)
  }, [])

  const acceptSuggestion = useCallback(() => {
    const ed = editorInstanceRef.current
    const active = suggestionRef.current
    const path = contextPathRef.current
    if (!ed || !active || !path) return
    const insert = formatContextFolderInsert(active.typedSuffix, path)
    ed.chain().focus().insertContentAt({ from: active.from, to: active.to }, insert).run()
    updateSuggestion(null)
  }, [updateSuggestion])

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start typing your note…' }),
      Markdown.configure({ html: false, transformPastedText: true }),
      NoteItemCopy.configure({ onCopy: copyItemText })
    ],
    content: initialMarkdown,
    editorProps: {
      attributes: { class: 'vibe-scroll h-full overflow-y-auto px-3 py-2' },
      handleKeyDown: (_view, event) => {
        if (!suggestionRef.current) return false
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          acceptSuggestion()
          return true
        }
        if (event.key === 'Escape') {
          updateSuggestion(null)
          return true
        }
        return false
      }
    }
  })

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        // tiptap-markdown stores its serializer on `editor.storage.markdown`; its module
        // augmentation isn't always picked up, so read it through a narrow cast.
        const md = editor?.storage as { markdown?: { getMarkdown: () => string } } | undefined
        return md?.markdown?.getMarkdown() ?? initialMarkdown
      }
    }),
    [editor, initialMarkdown]
  )

  useEffect(() => {
    editorInstanceRef.current = editor ?? null
  }, [editor])

  // Resolve the active project's AI context folder path once so the suggestion can offer it.
  useEffect(() => {
    if (!editable) return
    let cancelled = false
    void window.vibebar?.project
      ?.getContextFolderPath?.()
      .then((res) => {
        if (cancelled) return
        const path = res?.path ?? null
        contextPathRef.current = path
        setContextPath(path)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [editable])

  // Show the suggestion when the text right before a collapsed caret ends with a trigger keyword.
  const detectSuggestion = useCallback(
    (ed: Editor): void => {
      const clear = (): void => {
        if (suggestionRef.current) updateSuggestion(null)
      }
      if (!editable || !contextPathRef.current) return clear()
      const { state, view } = ed
      const { selection } = state
      if (!selection.empty) return clear()
      const cursor = selection.from
      const blockStart = selection.$from.start()
      const textBefore = state.doc.textBetween(blockStart, cursor, '\n', '\n')
      const matchLen = matchContextFolderTrigger(textBefore)
      if (matchLen == null) return clear()
      let coords: { left: number; bottom: number }
      try {
        coords = view.coordsAtPos(cursor)
      } catch {
        return
      }
      updateSuggestion({
        from: cursor - matchLen,
        to: cursor,
        left: coords.left,
        top: coords.bottom + 6,
        typedSuffix: state.doc.textBetween(cursor - matchLen, cursor, '\n', '\n')
      })
    },
    [editable, updateSuggestion]
  )

  useEffect(() => {
    if (!editor) return
    const update = (): void => {
      setTick((t) => t + 1)
      onChange?.()
      detectSuggestion(editor)
    }
    const dismiss = (): void => updateSuggestion(null)
    editor.on('transaction', update)
    editor.on('blur', dismiss)
    return () => {
      editor.off('transaction', update)
      editor.off('blur', dismiss)
    }
  }, [editor, onChange, detectSuggestion, updateSuggestion])

  const isBold = editor?.isActive('bold') ?? false
  const isBullet = editor?.isActive('bulletList') ?? false
  const isTask = editor?.isActive('taskList') ?? false

  return (
    <div className={`note-editor flex h-full flex-col ${dividers ? 'show-dividers' : ''}`}>
      {editable && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-vibe-border px-3 py-2">
          <ToolbarButton
            icon="Bold"
            label="Bold (Ctrl+B)"
            active={isBold}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            icon="List"
            label="Bullet list"
            active={isBullet}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            icon="ListChecks"
            label="Checklist"
            active={isTask}
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
          />
          <span className="mx-0.5 h-5 w-px bg-vibe-border" aria-hidden />
          <ToolbarButton
            icon="SeparatorHorizontal"
            label={dividers ? 'Hide separator lines' : 'Show separator lines between items'}
            active={dividers}
            onClick={() => setDividers((v) => !v)}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorContent editor={editor} className="h-full" />
      </div>
      {editable && suggestion && contextPath
        ? createPortal(
            <button
              type="button"
              // Keep focus in the editor so accepting via click doesn't blur (and dismiss) first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={acceptSuggestion}
              style={{ position: 'fixed', left: suggestion.left, top: suggestion.top, zIndex: 9999 }}
              className="flex max-w-[min(360px,90vw)] items-center gap-2 rounded-lg border border-vibe-accent/50 bg-vibe-bg/95 px-2.5 py-1.5 text-xs text-vibe-text shadow-xl shadow-black/40 backdrop-blur-md backdrop-saturate-150"
            >
              <Icon name="FolderCheck" size={13} className="shrink-0 text-vibe-accent-2" />
              <span className="shrink-0">
                Press <kbd className="rounded bg-white/10 px-1 font-sans text-[10px]">Enter</kbd> to
                insert
              </span>
              <span className="truncate font-mono text-[11px] text-vibe-muted">
                {formatContextFolderInsert(suggestion.typedSuffix, contextPath)}
              </span>
            </button>,
            document.body
          )
        : null}
    </div>
  )
})
