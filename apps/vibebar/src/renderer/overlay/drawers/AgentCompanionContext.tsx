import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentCompanionState } from '@shared/agentCompanionApi.js'
import type {
  GitStatus,
  McpServerStatus,
  ProjectProfile,
  ReadyCheckResult,
  ReadyCheckStatus,
  SessionState
} from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { buildWhatsNextSuggestions } from '../panels/sessionWhatsNext'

const READY_META: Record<
  ReadyCheckStatus,
  { label: string; ring: string; icon: string }
> = {
  blocked: {
    label: 'Blocked',
    ring: 'border-red-500/40 bg-red-500/10 text-red-200',
    icon: 'Ban'
  },
  'needs-review': {
    label: 'Needs review',
    ring: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    icon: 'AlertTriangle'
  },
  'looks-ready': {
    label: 'Looks ready',
    ring: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    icon: 'ShieldCheck'
  }
}

export function formatGitLine(git: GitStatus | null, profile: ProjectProfile | null): string {
  if (!profile) return 'Select a project'
  if (!git?.isRepo) return 'Not a git repository'
  const parts: string[] = []
  if (git.branch) parts.push(git.branch)
  else parts.push('detached')
  if (git.changeCount === 0) parts.push('clean')
  else parts.push(git.changeCount === 1 ? '1 change' : `${git.changeCount} changes`)
  if (git.ahead > 0) parts.push(`${git.ahead}↑`)
  if (git.behind > 0) parts.push(`${git.behind}↓`)
  return parts.join(' · ')
}

function stackLabel(profile: ProjectProfile | null): string {
  if (!profile) return ''
  const tags = profile.stacks.filter((s) => s !== 'unknown').slice(0, 4)
  if (tags.length === 0) return profile.language !== 'unknown' ? profile.language : 'unknown stack'
  return tags.join(' · ')
}

function useWorkspaceContext(): {
  profile: ProjectProfile | null
  gitStatus: GitStatus | null
  session: SessionState | null
  mcpStatus: McpServerStatus | null
  ready: ReadyCheckResult | null
  readyLoading: boolean
} {
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [session, setSession] = useState<SessionState | null>(null)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [ready, setReady] = useState<ReadyCheckResult | null>(null)
  const [readyLoading, setReadyLoading] = useState(false)

  const loadReady = useCallback((hasProject: boolean) => {
    if (!hasProject) {
      setReady(null)
      return
    }
    setReadyLoading(true)
    void window.vibebar.readyCheck
      .get()
      .then(setReady)
      .finally(() => setReadyLoading(false))
  }, [])

  useEffect(() => {
    void window.vibebar.project.get().then((p) => {
      setProfile(p)
      loadReady(Boolean(p?.rootPath))
    })
    void window.vibebar.git.getStatus().then(setGitStatus)
    void window.vibebar.session.getState().then(setSession)
    void window.vibebar.mcp.getStatus().then(setMcpStatus)

    const offProject = window.vibebar.project.onChanged((p) => {
      setProfile(p)
      loadReady(Boolean(p?.rootPath))
    })
    const offGit = window.vibebar.git.onStatusChanged(setGitStatus)
    const offSession = window.vibebar.session.onChanged(setSession)
    const offMcp = window.vibebar.mcp.onChanged(setMcpStatus)

    return () => {
      offProject()
      offGit()
      offSession()
      offMcp()
    }
  }, [loadReady])

  return { profile, gitStatus, session, mcpStatus, ready, readyLoading }
}

function ContextRow({
  icon,
  label,
  value,
  mono
}: {
  icon: string
  label: string
  value: string
  mono?: boolean
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon name={icon} size={13} className="mt-0.5 shrink-0 text-vibe-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-vibe-muted">{label}</div>
        <div
          className={`mt-0.5 text-[11px] leading-snug text-vibe-text ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function QuickChip({
  icon,
  label,
  onClick
}: {
  icon: string
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-vibe-border bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-vibe-muted transition-colors hover:border-white/20 hover:text-vibe-text"
    >
      <Icon name={icon} size={11} />
      {label}
    </button>
  )
}

export const AgentCompanionContextPanel = memo(function AgentCompanionContextPanel({
  agentState
}: {
  agentState: AgentCompanionState
}): JSX.Element {
  const { profile, gitStatus, session, mcpStatus, ready, readyLoading } = useWorkspaceContext()
  const [expanded, setExpanded] = useState(true)

  const gitLine = useMemo(() => formatGitLine(gitStatus, profile), [gitStatus, profile])
  const stacks = useMemo(() => stackLabel(profile), [profile])
  const intent = session?.intent
  const pinnedCount = session?.pinnedCount ?? 0
  const failureCount = session?.recentFailures?.length ?? 0
  const lastGreen = session?.flight?.lastGreen
  const mcpOn = Boolean(mcpStatus?.enabled && mcpStatus.running)
  const readyMeta = ready?.status ? READY_META[ready.status] : null

  const suggestions = useMemo(
    () =>
      buildWhatsNextSuggestions({
        state: session,
        gitStatus,
        terminalIssueCount: failureCount
      }),
    [session, gitStatus, failureCount]
  )

  const collapsedSummary = useMemo(() => {
    const parts: string[] = []
    if (profile) parts.push(profile.folderName)
    if (gitStatus?.isRepo && gitStatus.branch) parts.push(gitStatus.branch)
    if (gitStatus && gitStatus.changeCount > 0) parts.push(`${gitStatus.changeCount}Δ`)
    if (intent?.goal) parts.push(intent.goal.slice(0, 40) + (intent.goal.length > 40 ? '…' : ''))
    return parts.join(' · ') || 'Workspace context'
  }, [profile, gitStatus, intent?.goal])

  return (
    <div className="vibe-no-drag shrink-0 border-b border-vibe-border bg-black/25">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03]"
      >
        <Icon
          name={expanded ? 'ChevronDown' : 'ChevronRight'}
          size={14}
          className="shrink-0 text-vibe-muted"
        />
        <Icon name="Layers" size={14} className="shrink-0 text-vibe-accent-2" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-vibe-text">
          {expanded ? 'Workspace' : collapsedSummary}
        </span>
        {!expanded && readyMeta && (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${readyMeta.ring}`}
          >
            {readyMeta.label}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-vibe-border/60 px-3 py-2.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <ContextRow
              icon="FolderOpen"
              label="Project"
              value={
                profile
                  ? `${profile.folderName}${profile.isMonorepo ? ' · monorepo' : ''}`
                  : 'No project selected'
              }
            />
            <ContextRow icon="GitBranch" label="Git" value={gitLine} mono />
            <ContextRow icon="Boxes" label="Stack" value={stacks || '—'} />
            <ContextRow
              icon="Radio"
              label="Agent"
              value={`${agentState.mode} · ${agentState.connection}${agentState.projectPath ? '' : ' · no cwd'}`}
            />
          </div>

          <div className="rounded-lg border border-vibe-border bg-white/[0.02] p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">
              <Icon name="Target" size={12} />
              Current task
            </div>
            {intent?.goal ? (
              <p className="text-[11px] leading-relaxed text-vibe-text">{intent.goal}</p>
            ) : (
              <p className="text-[11px] text-vibe-muted">Set a task in Session Hub for focused agent work.</p>
            )}
            {intent?.verifyCommand && (
              <p className="mt-1.5 truncate font-mono text-[10px] text-vibe-muted" title={intent.verifyCommand}>
                verify: {intent.verifyCommand}
              </p>
            )}
            {intent?.filesInScope && intent.filesInScope.length > 0 && (
              <p className="mt-1 truncate text-[10px] text-vibe-muted" title={intent.filesInScope.join(', ')}>
                scope: {intent.filesInScope.slice(0, 3).join(', ')}
                {intent.filesInScope.length > 3 ? ` +${intent.filesInScope.length - 3}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {readyLoading ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-vibe-muted">
                <Icon name="Loader2" size={11} className="animate-spin" />
                Ready check…
              </span>
            ) : readyMeta ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${readyMeta.ring}`}
              >
                <Icon name={readyMeta.icon} size={11} />
                {readyMeta.label}
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                mcpOn
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-vibe-border text-vibe-muted'
              }`}
            >
              <Icon name="PlugZap" size={11} />
              MCP {mcpOn ? 'on' : 'off'}
            </span>
            {pinnedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-vibe-border px-2 py-0.5 text-[10px] text-vibe-muted">
                <Icon name="Pin" size={11} />
                {pinnedCount} pinned
              </span>
            )}
            {failureCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                <Icon name="SquareTerminal" size={11} />
                {failureCount} terminal issue{failureCount === 1 ? '' : 's'}
              </span>
            )}
            {lastGreen && (
              <span
                className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-200/90"
                title={lastGreen.command}
              >
                <Icon name="CircleCheck" size={11} />
                last green: {lastGreen.command}
              </span>
            )}
          </div>

          {ready?.brief?.summaryLine && (
            <p className="text-[10px] leading-relaxed text-vibe-muted">{ready.brief.summaryLine}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <QuickChip
              icon="GitBranch"
              label="Copy diff"
              onClick={() => void window.vibebar.git.copyDiffPrompt()}
            />
            <QuickChip
              icon="PackageOpen"
              label="Pack changed"
              onClick={() => void window.vibebar.packer.packChanged()}
            />
            <QuickChip
              icon="MousePointer2"
              label="Prepare Cursor"
              onClick={() => void window.vibebar.quickLaunch.prepareCursor()}
            />
            {suggestions.map((s) => (
              <QuickChip
                key={s.id}
                icon={s.icon}
                label={s.label.length > 28 ? `${s.label.slice(0, 26)}…` : s.label}
                onClick={() => {
                  if (s.id === 'copy-diff') void window.vibebar.git.copyDiffPrompt()
                  else if (s.id === 'open-terminal') void window.vibebar.terminal.toggle()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
