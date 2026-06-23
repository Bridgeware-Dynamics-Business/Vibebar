import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const pluginKey = new PluginKey('noteItemCopy')

// Inline SVGs (lucide "copy" / "check") so the widget needs no React render and stays cheap.
const COPY_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

/** Item node types that get a per-item copy button. */
const ITEM_TYPES = new Set(['listItem', 'taskItem'])

function makeButton(getText: () => string, onCopy: (text: string) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'note-item-copy'
  button.title = 'Copy this item'
  button.setAttribute('aria-label', 'Copy this item')
  button.contentEditable = 'false'
  button.innerHTML = COPY_SVG
  // Keep the click from moving the editor selection or starting a drag.
  button.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const text = getText().trim()
    if (!text) return
    onCopy(text)
    button.classList.add('is-copied')
    button.innerHTML = CHECK_SVG
    window.setTimeout(() => {
      button.classList.remove('is-copied')
      button.innerHTML = COPY_SVG
    }, 1100)
  })
  return button
}

function buildDecorations(doc: ProseMirrorNode, onCopy: (text: string) => void): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!ITEM_TYPES.has(node.type.name)) return
    // Snapshot the item's start so the button always reads the node's live text at click time.
    const itemPos = pos
    const widget = Decoration.widget(
      pos + 1,
      (view) => {
        const text = (): string => {
          const resolved = view.state.doc.nodeAt(itemPos)
          return resolved ? resolved.textContent : node.textContent
        }
        return makeButton(text, onCopy)
      },
      { side: -1, key: `note-item-copy-${itemPos}`, ignoreSelection: true }
    )
    decorations.push(widget)
  })
  return DecorationSet.create(doc, decorations)
}

export interface NoteItemCopyOptions {
  /** Copies the given item's plain text (wired to the app clipboard in NoteEditor). */
  onCopy: (text: string) => void
}

/**
 * Adds a small "copy" button to every bullet and checklist item in the editor. The button is a
 * ProseMirror widget decoration (view-only, never serialized into the note's Markdown) and copies
 * just that item's plain text. Decorations rebuild only when the document changes.
 */
export const NoteItemCopy = Extension.create<NoteItemCopyOptions>({
  name: 'noteItemCopy',

  addOptions() {
    return { onCopy: () => {} }
  },

  addProseMirrorPlugins() {
    const { onCopy } = this.options
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_config, { doc }) => buildDecorations(doc, onCopy),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc, onCopy) : old)
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state) as DecorationSet | undefined
          }
        }
      })
    ]
  }
})
