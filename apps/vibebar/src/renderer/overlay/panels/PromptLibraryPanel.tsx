import { filterTemplates, PROMPT_CATEGORIES } from '@vibebar/prompt-engine'
import { useEffect, useMemo, useState } from 'react'
import type { ProjectProfile, PromptListResult, PromptTemplate } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { Chip, PanelHeader, Toggle } from '../../shared/ui'
import { PromptCard } from './PromptCard'
import { PromptEditor } from './PromptEditor'

const CATEGORY_OPTIONS = ['All', ...PROMPT_CATEGORIES] as const

function stackSummary(profile: ProjectProfile | null): string {
  if (!profile) return 'No project selected'
  const parts = [profile.framework, profile.language, profile.testRunner].filter(
    (p) => p && p !== 'unknown'
  )
  return parts.length ? parts.join(' \u00b7 ') : 'stack unknown'
}

export function PromptLibraryPanel({
  profile,
  onClose,
  onCopyOutcome,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  onClose: () => void
  onCopyOutcome: (copied: boolean, text: string) => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the library out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [data, setData] = useState<PromptListResult | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('All')
  const [draft, setDraft] = useState<PromptTemplate | null>(null)

  async function reload(): Promise<void> {
    setData(await window.vibebar.prompts.list())
  }

  useEffect(() => {
    void reload()
  }, [profile?.rootPath])

  const filtered = useMemo(() => {
    if (!data) return []
    const list = filterTemplates(data.prompts, { stacks: data.stacks, category, query })
    return [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite))
  }, [data, category, query])

  async function handleCopy(id: string): Promise<void> {
    const result = await window.vibebar.prompts.copy(id)
    onCopyOutcome(result.copied, result.text)
    void reload()
  }

  async function handleToggleFavorite(id: string): Promise<void> {
    setData(await window.vibebar.prompts.toggleFavorite(id))
  }

  async function handleDelete(id: string): Promise<void> {
    setData(await window.vibebar.prompts.remove(id))
  }

  async function handleGuardrails(next: boolean): Promise<void> {
    setData(await window.vibebar.prompts.setGuardrails(next))
  }

  async function startNew(): Promise<void> {
    const seedCategory = category === 'All' ? 'Security' : category
    setDraft(await window.vibebar.prompts.newDraft(seedCategory as never))
  }

  async function saveNew(template: PromptTemplate): Promise<void> {
    setData(await window.vibebar.prompts.create(template))
    setDraft(null)
  }

  if (draft) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          title="New prompt"
          onClose={() => setDraft(null)}
          solid={solid}
          onToggleSolid={onToggleSolid}
        />
        <PromptEditor draft={draft} onSave={saveNew} onCancel={() => setDraft(null)} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Prompt Library"
        onClose={onClose}
        solid={solid}
        onToggleSolid={onToggleSolid}
      >
        {onDetach && (
          <button
            type="button"
            onClick={onDetach}
            title="Detach into a floating window"
            aria-label="Detach Prompt Library"
            className="vibe-no-drag rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="ExternalLink" size={16} />
          </button>
        )}
      </PanelHeader>

      <div className="border-b border-vibe-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-vibe-muted">
          <Icon name="FolderOpen" size={14} />
          <span className="font-medium text-vibe-text">{profile?.folderName ?? 'No project'}</span>
          {profile?.gitBranch && (
            <>
              <Icon name="GitBranch" size={13} />
              <span>{profile.gitBranch}</span>
            </>
          )}
          <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-vibe-accent-2">
            {stackSummary(profile)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-vibe-border bg-black/30 px-2.5">
            <Icon name="Search" size={15} className="text-vibe-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts"
              className="vibe-no-drag w-full bg-transparent py-1.5 text-sm text-vibe-text outline-none placeholder:text-vibe-muted"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-vibe-muted">
            <Icon name="ShieldCheck" size={14} className="text-vibe-accent-2" />
            Harden prompts
          </span>
          <Toggle
            checked={data?.guardrailsEnabled ?? true}
            onChange={(next) => void handleGuardrails(next)}
            label="Toggle guardrails"
          />
        </div>
      </div>

      <div className="vibe-scroll border-b border-vibe-border px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="vibe-scroll flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-vibe-muted">
            No prompts match. Try another category or clear the search.
          </p>
        )}
        {filtered.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            onCopy={(id) => void handleCopy(id)}
            onToggleFavorite={(id) => void handleToggleFavorite(id)}
            onDelete={(id) => void handleDelete(id)}
          />
        ))}
      </div>

      <div className="border-t border-vibe-border p-3">
        <button
          type="button"
          onClick={() => void startNew()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-vibe-border py-2 text-sm text-vibe-muted transition-colors hover:border-vibe-accent hover:text-vibe-text"
        >
          <Icon name="Plus" size={16} /> New prompt
        </button>
      </div>
    </div>
  )
}
