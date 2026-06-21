import { PROMPT_CATEGORIES } from '@vibebar/prompt-engine'
import { useState } from 'react'
import type { PromptCategory, PromptTemplate } from '@shared/types.js'
import { Chip } from '../../shared/ui'

/**
 * Authoring form for a new prompt. Seeded from a stack-aware draft so a non-expert starts
 * with a working skeleton (detected framework, starter guardrails, wired variables) rather
 * than a blank box.
 */
export function PromptEditor({
  draft,
  onSave,
  onCancel
}: {
  draft: PromptTemplate
  onSave: (template: PromptTemplate) => void
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState(draft.title)
  const [description, setDescription] = useState(draft.description)
  const [categories, setCategories] = useState<PromptCategory[]>(draft.categories)
  const [stacks, setStacks] = useState(draft.stacks.join(', '))
  const [body, setBody] = useState(draft.body)

  const canSave = title.trim().length > 0 && body.trim().length > 0 && categories.length > 0

  function toggleCategory(category: PromptCategory): void {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  function save(): void {
    const parsedStacks = stacks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    onSave({
      ...draft,
      title: title.trim(),
      description: description.trim(),
      categories,
      stacks: parsedStacks.length ? parsedStacks : ['any'],
      body,
      builtIn: false
    })
  }

  const fieldClass =
    'w-full rounded-lg border border-vibe-border bg-black/30 px-3 py-2 text-sm text-vibe-text outline-none focus:border-vibe-accent'

  return (
    <div className="vibe-scroll flex-1 space-y-3 overflow-y-auto p-4">
      <div>
        <label className="mb-1 block text-xs text-vibe-muted">Title</label>
        <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-vibe-muted">Description</label>
        <input
          className={fieldClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-vibe-muted">Categories</label>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CATEGORIES.map((c) => (
            <Chip key={c} active={categories.includes(c)} onClick={() => toggleCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-vibe-muted">
          Stacks (comma separated, use &quot;any&quot; for all)
        </label>
        <input className={fieldClass} value={stacks} onChange={(e) => setStacks(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-vibe-muted">
          Body — supports {'{{framework}}'} and {'{{#if isElectron}}...{{/if}}'}
        </label>
        <textarea
          className={`${fieldClass} vibe-scroll min-h-44 resize-y font-mono text-xs`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-vibe-muted hover:text-vibe-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="rounded-lg bg-vibe-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Save prompt
        </button>
      </div>
    </div>
  )
}
