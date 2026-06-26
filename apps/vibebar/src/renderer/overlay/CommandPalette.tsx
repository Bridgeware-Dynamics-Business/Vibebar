import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ToolId } from '@shared/tools.js'
import type { RecentProject } from '@shared/types.js'
import { Icon } from '../shared/icons'

export interface CommandPaletteAction {
  id: string
  label: string
  keywords: string
  icon: string
  run: () => void | Promise<void>
}

function scoreMatch(query: string, action: CommandPaletteAction): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const label = action.label.toLowerCase()
  const keys = action.keywords.toLowerCase()
  if (label.startsWith(q)) return 100
  if (label.includes(q)) return 80
  if (keys.includes(q)) return 60
  const parts = q.split(/\s+/).filter(Boolean)
  if (parts.every((p) => label.includes(p) || keys.includes(p))) return 40
  return 0
}

const SEARCH_DEBOUNCE_MS = 150
const PALETTE_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }

export function CommandPalette({
  open,
  onClose,
  onClosed,
  actions
}: {
  open: boolean
  onClose: () => void
  onClosed: () => void
  actions: CommandPaletteAction[]
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setActiveIdx(0)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    const scored = actions
      .map((a) => ({ action: a, score: scoreMatch(debouncedQuery.trim(), a) }))
      .filter((x) => x.score > 0 || !debouncedQuery.trim())
      .sort((a, b) => b.score - a.score || a.action.label.localeCompare(b.action.label))
    return scored.map((x) => x.action)
  }, [actions, debouncedQuery])

  useEffect(() => {
    setActiveIdx(0)
  }, [debouncedQuery])

  const run = useCallback(
    async (action: CommandPaletteAction) => {
      onClose()
      await action.run()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && filtered[activeIdx]) {
        e.preventDefault()
        void run(filtered[activeIdx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, activeIdx, onClose, run])

  return (
    <AnimatePresence onExitComplete={onClosed}>
      {open ? (
        <motion.div
          key="command-palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={PALETTE_TRANSITION}
          className="vibe-no-drag fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[18vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={PALETTE_TRANSITION}
            className="vibe-glass w-full max-w-lg overflow-hidden rounded-2xl border border-vibe-border shadow-2xl"
          >
          <div className="flex items-center gap-2 border-b border-vibe-border px-3 py-2.5">
            <Icon name="Search" size={16} className="text-vibe-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command…"
              className="min-w-0 flex-1 bg-transparent text-sm text-vibe-text outline-none placeholder:text-vibe-muted"
            />
            <kbd className="rounded border border-vibe-border px-1.5 py-0.5 text-[10px] text-vibe-muted">
              esc
            </kbd>
          </div>
          <ul className="vibe-scroll max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-vibe-muted">No matching commands.</li>
            )}
            {filtered.map((action, idx) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => void run(action)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                    idx === activeIdx ? 'bg-vibe-accent/15 text-vibe-text' : 'text-vibe-muted hover:bg-white/5 hover:text-vibe-text'
                  }`}
                >
                  <Icon name={action.icon} size={16} className="shrink-0" />
                  <span>{action.label}</span>
                </button>
              </li>
            ))}
          </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Factory for palette actions wired from App.tsx tool handlers. */
export function buildPaletteActions(handlers: {
  onTool: (id: ToolId) => void
  onSelectProject: () => void
  onCopyGitDiff: () => void
  onPackChanged: () => void
  onCopySessionHandoff: () => void
  onViewAiDocs: () => void
  onAuditConfig: () => void
  onSnip: () => void
  onSetCurrentTask?: () => void
  recents?: RecentProject[]
  onOpenRecent?: (path: string) => void
}): CommandPaletteAction[] {
  const recentActions: CommandPaletteAction[] = (handlers.recents ?? []).map((r) => ({
    id: `project-recent-${r.path}`,
    label: `Switch project: ${r.label}`,
    keywords: `switch project recent folder ${r.label} ${r.path}`,
    icon: 'FolderOpen',
    run: () => handlers.onOpenRecent?.(r.path)
  }))

  return [
    ...recentActions,
    {
      id: 'switch-project',
      label: 'Switch project…',
      keywords: 'switch project folder browse recent workspace',
      icon: 'FolderOpen',
      run: handlers.onSelectProject
    },
    {
      id: 'set-current-task',
      label: 'Set current task',
      keywords: 'intent task goal scope acceptance verify session brief',
      icon: 'Target',
      run: () => handlers.onSetCurrentTask?.()
    },
    {
      id: 'session-hub',
      label: 'Open Session Hub',
      keywords: 'session hub timeline handoff pin',
      icon: 'Sparkles',
      run: () => handlers.onTool('session-hub')
    },
    {
      id: 'copy-handoff',
      label: 'Copy session handoff',
      keywords: 'session handoff pinned bundle ai paste',
      icon: 'Copy',
      run: handlers.onCopySessionHandoff
    },
    {
      id: 'ai-docs',
      label: 'Sync / view AI docs',
      keywords: 'agents.md cursor rules ai context project docs',
      icon: 'BookOpen',
      run: handlers.onViewAiDocs
    },
    {
      id: 'audit-config',
      label: 'Audit config',
      keywords: 'audit config baseline rules vibebar-audit.json',
      icon: 'SlidersHorizontal',
      run: handlers.onAuditConfig
    },
    {
      id: 'audit',
      label: 'Run security audit',
      keywords: 'scan security audit check',
      icon: 'ScanSearch',
      run: () => handlers.onTool('security-audit')
    },
    {
      id: 'ready-check',
      label: 'Open Ready Check',
      keywords: 'ready check commit pre-commit trust gate review blocked',
      icon: 'ShieldCheck',
      run: () => handlers.onTool('ready-check')
    },
    {
      id: 'terminal',
      label: 'Open Smart Terminal',
      keywords: 'terminal shell command run',
      icon: 'SquareTerminal',
      run: () => handlers.onTool('terminal')
    },
    {
      id: 'git-diff',
      label: 'Copy git diff prompt',
      keywords: 'git diff changes commit paste ai',
      icon: 'GitBranch',
      run: handlers.onCopyGitDiff
    },
    {
      id: 'pack-changed',
      label: 'Pack changed files',
      keywords: 'context packer git changed files',
      icon: 'PackageOpen',
      run: handlers.onPackChanged
    },
    {
      id: 'prompts',
      label: 'Open Prompt Library',
      keywords: 'prompt library template',
      icon: 'Library',
      run: () => handlers.onTool('prompt-library')
    },
    {
      id: 'snip',
      label: 'Snip to AI context',
      keywords: 'screenshot snip capture image',
      icon: 'Crop',
      run: handlers.onSnip
    },
    {
      id: 'packer',
      label: 'Open Context Packer',
      keywords: 'context pack files bundle',
      icon: 'PackageOpen',
      run: () => handlers.onTool('context-packer')
    },
    {
      id: 'notes',
      label: 'Open Notes',
      keywords: 'notes markdown sticky',
      icon: 'StickyNote',
      run: () => handlers.onTool('notes')
    },
    {
      id: 'settings',
      label: 'Open Settings',
      keywords: 'preferences config hotkeys',
      icon: 'Settings',
      run: () => handlers.onTool('settings')
    }
  ]
}
