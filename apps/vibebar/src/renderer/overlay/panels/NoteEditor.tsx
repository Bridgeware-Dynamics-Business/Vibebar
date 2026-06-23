import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from 'tiptap-markdown'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Icon } from '../../shared/icons'
import { NoteItemCopy } from './noteItemCopy'

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
      attributes: { class: 'vibe-scroll h-full overflow-y-auto px-3 py-2' }
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
    if (!editor) return
    const update = (): void => {
      setTick((t) => t + 1)
      onChange?.()
    }
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor, onChange])

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
    </div>
  )
})
