import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitStatus, ProjectAiDocs, ProjectProfile, SessionEntry, SessionState } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { buildNoteBullet, SaveToNotePicker } from '../../shared/saveToNote'
import { DetachButton, PanelHeader } from '../../shared/ui'
import {
  buildWhatsNextSuggestions,
  capSessionEntries,
  SESSION_DISPLAY_CAP,
  type WhatsNextSuggestion
} from './sessionWhatsNext'

type FilterChip = 'all' | 'prompt' | 'audit-finding' | 'terminal-issue' | 'git-diff'

const TYPE_ICON: Record<SessionEntry['type'], string> = {
  prompt: 'Library',
  'terminal-issue': 'SquareTerminal',
  'audit-finding': 'ScanSearch',
  note: 'StickyNote',
  'git-diff': 'GitBranch'
}

const TYPE_LABEL: Record<SessionEntry['type'], string> = {
  prompt: 'Prompt',
  'terminal-issue': 'Terminal',
  'audit-finding': 'Audit',
  note: 'Note',
  'git-diff': 'Git diff'
}

const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'audit-finding', label: 'Audit' },
  { id: 'terminal-issue', label: 'Terminal' },
  { id: 'git-diff', label: 'Git' }
]

function isToday(ts: number): boolean {
  const d = new Date(ts)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function entryNoteMarkdown(entry: SessionEntry): string {
  if (entry.type === 'audit-finding') {
    return buildNoteBullet({
      title: entry.title,
      fileLine: entry.file,
      excerpt: entry.fullText ?? entry.fixExcerpt ?? `[${entry.severity}] audit finding`
    })
  }
  if (entry.type === 'terminal-issue') {
    return buildNoteBullet({
      title: entry.title,
      excerpt: entry.fullText ?? (entry.command ? `Command: ${entry.command}` : 'Terminal issue')
    })
  }
  return buildNoteBullet({ title: entry.title, excerpt: entry.fullText ?? entry.type })
}

function matchesFilter(entry: SessionEntry, filter: FilterChip): boolean {
  if (filter === 'all') return true
  return entry.type === filter
}

function EntryRow({
  entry,
  onTogglePin,
  onSaveToNote
}: {
  entry: SessionEntry
  onTogglePin: (id: string) => void
  onSaveToNote: (entry: SessionEntry) => void
}): JSX.Element {
  const preview =
    entry.fullText?.slice(0, 120) ??
    (entry.type === 'note' ? entry.text : entry.type === 'audit-finding' ? entry.fixExcerpt : undefined)

  return (
    <div className="flex items-start gap-2 rounded-xl border border-vibe-border bg-white/[0.03] px-3 py-2.5">
      <Icon name={TYPE_ICON[entry.type]} size={16} className="mt-0.5 shrink-0 text-vibe-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-vibe-muted">
            {TYPE_LABEL[entry.type]}
          </span>
          {entry.pinned && (
            <span className="rounded-full bg-vibe-accent/20 px-2 py-0.5 text-[10px] font-semibold text-vibe-accent-2">
              pinned
            </span>
          )}
          <span className="text-sm font-medium text-vibe-text">{entry.title}</span>
        </div>
        {entry.type === 'audit-finding' && entry.file && (
          <p className="mt-1 font-mono text-[10px] text-vibe-muted">{entry.file}</p>
        )}
        {preview && (
          <p className="mt-1 line-clamp-2 text-[11px] text-vibe-muted">{preview}</p>
        )}
        <p className="mt-1 text-[10px] text-vibe-muted/80">{formatTime(entry.timestamp)}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          title={entry.pinned ? 'Unpin' : 'Pin for handoff'}
          onClick={() => onTogglePin(entry.id)}
          className={`rounded-md p-1.5 transition-colors ${
            entry.pinned ? 'bg-vibe-accent/20 text-vibe-accent-2' : 'text-vibe-muted hover:bg-white/10 hover:text-vibe-text'
          }`}
        >
          <Icon name={entry.pinned ? 'PinOff' : 'Pin'} size={14} />
        </button>
        <button
          type="button"
          title="Save to note"
          onClick={() => onSaveToNote(entry)}
          className="rounded-md p-1.5 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="StickyNote" size={14} />
        </button>
      </div>
    </div>
  )
}

function AiDocsSection({ profile }: { profile: ProjectProfile }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<ProjectAiDocs | null>(null)
  const [confirmAppend, setConfirmAppend] = useState(false)

  const refresh = useCallback(async () => {
    setDocs(await window.vibebar.project.getAiDocs())
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh, profile.rootPath])

  const hasAgents = Boolean(docs?.agentsMd)
  const ruleCount = docs?.cursorRules.length ?? 0
  const hasContext = Boolean(docs?.contextReadme)

  async function appendToAgents(): Promise<void> {
    const handoff = await window.vibebar.session.copyHandoff(false)
    if (!handoff.text) return
    const block = `## Session update (${new Date().toISOString().slice(0, 10)})\n\n${handoff.text}`
    const result = await window.vibebar.project.appendAgentsMd(block)
    if (result.ok) {
      setConfirmAppend(false)
      void refresh()
    }
  }

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={14} className="text-vibe-muted" />
        <Icon name="BookOpen" size={14} className="text-vibe-muted" />
        <span className="font-medium text-vibe-text">Sync project context</span>
        <span className="ml-auto text-vibe-muted">
          {hasAgents ? 'AGENTS.md' : 'no AGENTS.md'}
          {ruleCount > 0 ? ` · ${ruleCount} rule(s)` : ''}
          {hasContext ? ' · AI Context' : ''}
        </span>
      </button>
      {open && docs && (
        <div className="space-y-2 border-t border-vibe-border px-3 py-2.5 text-xs text-vibe-muted">
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <Icon name={hasAgents ? 'Check' : 'Minus'} size={12} />
              AGENTS.md {hasAgents ? `(${docs.agentsMd!.length.toLocaleString()} chars)` : '— not found'}
            </li>
            <li className="flex items-center gap-2">
              <Icon name={ruleCount > 0 ? 'Check' : 'Minus'} size={12} />
              .cursor/rules/ — {ruleCount} file{ruleCount === 1 ? '' : 's'}
            </li>
            <li className="flex items-center gap-2">
              <Icon name={hasContext ? 'Check' : 'Minus'} size={12} />
              AI Context README {hasContext ? '' : '— not found'}
            </li>
          </ul>
          <p className="text-[10px] leading-relaxed">
            AGENTS.md excerpt is included in session handoffs. Keep project AI docs current for better Cursor context.
          </p>
          {confirmAppend ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void appendToAgents()}
                className="rounded-lg bg-vibe-accent px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Confirm append to AGENTS.md
              </button>
              <button
                type="button"
                onClick={() => setConfirmAppend(false)}
                className="rounded-lg px-2.5 py-1 text-[11px] text-vibe-muted hover:text-vibe-text"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmAppend(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-vibe-text hover:bg-white/15"
            >
              <Icon name="FilePlus" size={12} />
              Update AGENTS.md from session
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WhatsNextFooter({
  suggestions,
  onAction
}: {
  suggestions: WhatsNextSuggestion[]
  onAction: (id: string) => void
}): JSX.Element | null {
  if (suggestions.length === 0) return null
  return (
    <div className="border-t border-vibe-border bg-white/[0.02] px-4 py-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">
        What&apos;s next?
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onAction(s.id)}
            className="flex items-center gap-1.5 rounded-lg border border-vibe-border bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-vibe-text hover:bg-white/10"
          >
            <Icon name={s.icon} size={12} className="text-vibe-accent-2" />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SessionHubPanel({
  profile,
  gitStatus,
  onClose,
  onCopyOutcome,
  onPackChanged,
  onCopyGitDiff,
  onOpenTerminal,
  onOpenPromptLibrary,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  gitStatus: GitStatus | null
  onClose: () => void
  onCopyOutcome: (copied: boolean, text: string, redactedCount?: number) => void
  onPackChanged: () => void
  onCopyGitDiff?: () => void
  onOpenTerminal?: () => void
  onOpenPromptLibrary?: () => void
  solid?: boolean
  onToggleSolid?: () => void
  onDetach?: () => void
}): JSX.Element {
  const [state, setState] = useState<SessionState | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [noteTarget, setNoteTarget] = useState<SessionEntry | null>(null)
  const [filter, setFilter] = useState<FilterChip>('all')
  const [showAllEntries, setShowAllEntries] = useState(false)
  const [terminalIssueCount, setTerminalIssueCount] = useState(0)
  const [preview, setPreview] = useState<{ charCount: number; tokenEstimate: number; fileCount: number } | null>(
    null
  )

  const refresh = useCallback(async () => {
    setState(await window.vibebar.session.getState())
    const p = await window.vibebar.packer.previewChanged()
    if (!p.noProject && !p.noFiles) {
      setPreview({ charCount: p.charCount, tokenEstimate: p.tokenEstimate, fileCount: p.fileCount })
    } else {
      setPreview(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void window.vibebar.terminal.getHints().then((h) => setTerminalIssueCount(h.issueCount))
    const off = window.vibebar.session.onChanged(setState)
    const offProject = window.vibebar.project.onChanged(() => void refresh())
    return () => {
      off()
      offProject()
    }
  }, [refresh])

  const pinnedCount = state?.pinnedCount ?? 0
  const fixPinCount = useMemo(
    () =>
      state?.entries.filter(
        (e) => e.pinned && (e.type === 'audit-finding' || e.type === 'terminal-issue')
      ).length ?? 0,
    [state]
  )

  const filteredEntries = useMemo(() => {
    const capped = capSessionEntries(state?.entries ?? [], showAllEntries)
    return capped.filter((e) => matchesFilter(e, filter))
  }, [state, filter, showAllEntries])

  const hiddenCount = useMemo(() => {
    const total = state?.entries.length ?? 0
    return total > SESSION_DISPLAY_CAP && !showAllEntries ? total - SESSION_DISPLAY_CAP : 0
  }, [state, showAllEntries])

  const whatsNext = useMemo(
    () =>
      buildWhatsNextSuggestions({
        state,
        gitStatus,
        terminalIssueCount
      }),
    [state, gitStatus, terminalIssueCount]
  )

  const groups = useMemo(() => {
    const today = filteredEntries.filter((e) => isToday(e.timestamp))
    const earlier = filteredEntries.filter((e) => !isToday(e.timestamp))
    return { today, earlier }
  }, [filteredEntries])

  async function copyHandoff(): Promise<void> {
    const result = await window.vibebar.session.copyHandoff(true)
    if (result.noProject) return
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }

  async function copyFixPrompts(): Promise<void> {
    const result = await window.vibebar.session.copyFixPrompts()
    if (result.noProject) return
    if (result.pinnedCount === 0) return
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }

  async function clearSession(): Promise<void> {
    await window.vibebar.session.clear()
    setConfirmClear(false)
  }

  function handleWhatsNext(id: string): void {
    if (id === 'pin-handoff') void copyHandoff()
    else if (id === 'open-terminal') onOpenTerminal?.()
    else if (id === 'copy-diff') onCopyGitDiff?.()
    else if (id === 'copy-prompt') onOpenPromptLibrary?.()
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Session Hub" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Session Hub" />}
      </PanelHeader>

      {!profile ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Icon name="Sparkles" size={28} className="text-vibe-accent-2" />
          <p className="text-sm text-vibe-muted">Select a project to start your session timeline.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-vibe-border px-4 py-3">
            <p className="text-xs leading-relaxed text-vibe-muted">
              Your vibe loop in one place: copy prompts, pack context, run audits, fix in terminal — pin
              what matters and hand off to your AI in one structured bundle.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyHandoff()}
                disabled={pinnedCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <Icon name="Copy" size={13} />
                Copy handoff ({pinnedCount})
              </button>
              <button
                type="button"
                onClick={() => void copyFixPrompts()}
                disabled={fixPinCount === 0}
                title="Copy only pinned audit/terminal fix prompts"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text hover:bg-white/15 disabled:opacity-40"
              >
                <Icon name="Wrench" size={13} />
                Copy fix prompts ({fixPinCount})
              </button>
              <button
                type="button"
                onClick={onPackChanged}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text hover:bg-white/15"
              >
                <Icon name="PackageOpen" size={13} />
                Pack changed
                {preview && (
                  <span className="text-vibe-muted">~{preview.tokenEstimate.toLocaleString()} tok</span>
                )}
              </button>
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => void clearSession()}
                    className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-300"
                  >
                    Confirm clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-vibe-muted hover:text-vibe-text"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="ml-auto rounded-lg px-2.5 py-1.5 text-xs text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
                >
                  Clear session
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                    filter === chip.id
                      ? 'bg-vibe-accent text-white'
                      : 'bg-white/5 text-vibe-muted hover:bg-white/10 hover:text-vibe-text'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="vibe-scroll flex-1 space-y-4 overflow-y-auto p-4">
            <AiDocsSection profile={profile} />

            {(state?.entries.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-vibe-border p-6 text-center">
                <Icon name="History" size={24} className="mx-auto mb-2 text-vibe-muted" />
                <p className="text-sm font-medium text-vibe-text">Nothing in this session yet</p>
                <p className="mt-1 text-xs text-vibe-muted">
                  Copy a prompt, git diff, or audit fix — events appear here automatically. Pin items
                  you want in your next AI handoff.
                </p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <p className="py-8 text-center text-xs text-vibe-muted">No entries match this filter.</p>
            ) : (
              <>
                {groups.today.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vibe-muted">
                      Today
                    </h3>
                    <div className="space-y-2">
                      {groups.today.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          onTogglePin={(id) => void window.vibebar.session.togglePin(id)}
                          onSaveToNote={setNoteTarget}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {groups.earlier.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vibe-muted">
                      Earlier
                    </h3>
                    <div className="space-y-2">
                      {groups.earlier.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          onTogglePin={(id) => void window.vibebar.session.togglePin(id)}
                          onSaveToNote={setNoteTarget}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllEntries(true)}
                className="w-full rounded-lg border border-dashed border-vibe-border py-2 text-xs text-vibe-muted hover:bg-white/5 hover:text-vibe-text"
              >
                Show {hiddenCount} older entr{hiddenCount === 1 ? 'y' : 'ies'}
              </button>
            )}
          </div>

          <WhatsNextFooter suggestions={whatsNext} onAction={handleWhatsNext} />
        </>
      )}

      <SaveToNotePicker
        open={noteTarget !== null}
        onClose={() => setNoteTarget(null)}
        markdown={noteTarget ? entryNoteMarkdown(noteTarget) : ''}
      />
    </div>
  )
}
