import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { PromptTemplate, ResolvedVariable } from '@shared/types.js'
import { Icon } from '../../shared/icons'

export function PromptCard({
  prompt,
  onCopy,
  onRunWithAgent,
  onToggleFavorite,
  onEdit,
  onDelete
}: {
  prompt: PromptTemplate
  onCopy: (id: string) => void
  onRunWithAgent?: (id: string) => void | Promise<void>
  onToggleFavorite: (id: string) => void
  onEdit?: (prompt: PromptTemplate) => void
  onDelete?: (id: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<string>('')
  const [variables, setVariables] = useState<ResolvedVariable[]>([])
  const [copied, setCopied] = useState(false)
  const [runningAgent, setRunningAgent] = useState(false)

  async function toggle(): Promise<void> {
    const next = !expanded
    setExpanded(next)
    if (next && !preview) {
      const result = await window.vibebar.prompts.preview(prompt.id)
      setPreview(result.text)
      setVariables(result.resolvedVariables)
    }
  }

  function handleCopy(): void {
    onCopy(prompt.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function handleRunWithAgent(): Promise<void> {
    if (!onRunWithAgent) return
    setRunningAgent(true)
    try {
      await onRunWithAgent(prompt.id)
    } finally {
      setRunningAgent(false)
    }
  }

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.03] transition-colors hover:border-white/15">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          <Icon
            name={expanded ? 'ChevronDown' : 'ChevronRight'}
            size={16}
            className="mt-0.5 shrink-0 text-vibe-muted"
          />
          <span className="flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-vibe-text">{prompt.title}</span>
              {prompt.builtIn === false && (
                <span className="rounded bg-vibe-accent-2/15 px-1.5 py-0.5 text-[10px] text-vibe-accent-2">
                  custom
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-vibe-muted">
              {prompt.description}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-1">
              {prompt.categories.map((c) => (
                <span key={c} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-vibe-muted">
                  {c}
                </span>
              ))}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onToggleFavorite(prompt.id)}
          aria-label={prompt.favorite ? 'Unpin' : 'Pin'}
          className={`rounded-md p-1 transition-colors ${
            prompt.favorite ? 'text-amber-400' : 'text-vibe-muted hover:text-vibe-text'
          }`}
        >
          <Icon name="Star" size={16} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-vibe-border px-3 py-3">
              {variables.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {variables.map((v) => (
                    <span
                      key={v.key}
                      className="rounded-full border border-vibe-accent/30 bg-vibe-accent/10 px-2 py-0.5 text-[10px] text-vibe-text"
                      title={v.label}
                    >
                      {v.label} = {v.value}
                    </span>
                  ))}
                </div>
              )}
              <pre className="vibe-scroll max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-vibe-text">
                {preview}
              </pre>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {onEdit && prompt.builtIn === false && (
                    <button
                      type="button"
                      onClick={() => onEdit(prompt)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-vibe-muted hover:text-vibe-text"
                    >
                      <Icon name="Pencil" size={14} /> Edit
                    </button>
                  )}
                  {onDelete && prompt.builtIn === false ? (
                    <button
                      type="button"
                      onClick={() => onDelete(prompt.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-vibe-muted hover:text-red-400"
                    >
                      <Icon name="Trash2" size={14} /> Delete
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onRunWithAgent && (
                    <button
                      type="button"
                      disabled={runningAgent}
                      onClick={() => void handleRunWithAgent()}
                      className="flex items-center gap-1.5 rounded-lg border border-vibe-accent-2/40 bg-vibe-accent-2/10 px-3 py-1.5 text-xs font-medium text-vibe-accent-2 transition-colors hover:bg-vibe-accent-2/20 disabled:opacity-50"
                    >
                      <Icon
                        name={runningAgent ? 'Loader2' : 'Sparkles'}
                        size={14}
                        className={runningAgent ? 'animate-spin' : undefined}
                      />
                      Run with Agent Companion
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-vibe-accent/85"
                  >
                    <Icon name={copied ? 'Check' : 'Copy'} size={14} />
                    {copied ? 'Copied' : 'Copy prompt'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
