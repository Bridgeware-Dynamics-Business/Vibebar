import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentCompanionToolActivity } from '@shared/agentCompanionApi.js'
import {
  formatToolDetailPath,
  summarizeAgentToolActivity,
  summarizeStepKinds,
  toolKindMeta
} from '@shared/agentCompanionActivity.js'
import { Icon } from '../../shared/icons'

function StepStatusDot({ status }: { status: AgentCompanionToolActivity['status'] }): JSX.Element {
  if (status === 'running') {
    return (
      <span className="agent-echo-dot agent-echo-dot--active relative flex h-2 w-2 shrink-0 rounded-full bg-vibe-accent-2 shadow-[0_0_8px_rgba(34,211,238,0.55)]" />
    )
  }
  if (status === 'failed') {
    return <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-400/90" />
  }
  return <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-400/70" />
}

function EchoStepRow({ step, isLast }: { step: AgentCompanionToolActivity; isLast: boolean }): JSX.Element {
  const meta = toolKindMeta(step.kind)
  const path = formatToolDetailPath(step.detail)

  return (
    <li className="relative flex min-w-0 gap-2.5 pb-2.5 last:pb-0">
      {!isLast && (
        <span
          className="absolute left-[7px] top-3 h-[calc(100%-4px)] w-px bg-gradient-to-b from-white/10 to-white/[0.03]"
          aria-hidden
        />
      )}
      <div className="relative z-[1] flex w-4 shrink-0 justify-center pt-1">
        <StepStatusDot status={step.status} />
      </div>
      <div
        className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 transition-colors ${
          step.status === 'running'
            ? 'border-vibe-accent-2/25 bg-vibe-accent-2/[0.06]'
            : step.status === 'failed'
              ? 'border-red-500/25 bg-red-500/[0.06]'
              : 'border-white/[0.06] bg-white/[0.02]'
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/20 ${meta.tone}`}
          >
            <Icon name={meta.icon} size={11} />
          </span>
          <span
            className={`min-w-0 truncate text-[11px] font-medium ${
              step.status === 'running' ? 'text-vibe-text' : 'text-vibe-text/85'
            }`}
          >
            {step.label}
          </span>
          {step.status === 'running' && (
            <Icon name="Loader2" size={11} className="ml-auto shrink-0 animate-spin text-vibe-accent-2/80" />
          )}
        </div>
        {path && (
          <div className="mt-0.5 truncate pl-6 font-mono text-[10px] text-vibe-muted/80" title={step.detail}>
            {path}
          </div>
        )}
      </div>
    </li>
  )
}

export function AgentEchoTimeline({
  steps,
  live = false
}: {
  steps: AgentCompanionToolActivity[]
  /** True while the agent turn is in progress — timeline stays open and tracks the active step. */
  live?: boolean
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(live)
  const listRef = useRef<HTMLUListElement>(null)
  const summary = useMemo(() => summarizeAgentToolActivity(steps), [steps])
  const kindSummary = useMemo(() => summarizeStepKinds(steps), [steps])

  useEffect(() => {
    if (live) setExpanded(true)
  }, [live])

  useEffect(() => {
    if (!live || !expanded) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [steps, live, expanded])

  if (steps.length === 0) return null

  const failedCount = summary.failedCount
  const headerDetail = live && summary.active
    ? summary.active.label
    : kindSummary.length > 0
      ? kindSummary.join(' · ')
      : `${steps.length} step${steps.length === 1 ? '' : 's'}`

  return (
    <div className="agent-echo-timeline mt-2.5 overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Icon
          name={expanded ? 'ChevronDown' : 'ChevronRight'}
          size={13}
          className="shrink-0 text-vibe-muted"
        />
        <Icon name="Activity" size={13} className="shrink-0 text-vibe-accent-2/80" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">Work trace</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-vibe-text/80">{headerDetail}</span>
        {live && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-vibe-accent-2/30 bg-vibe-accent-2/10 px-1.5 py-0.5 text-[9px] font-medium text-vibe-accent-2">
            <span className="agent-echo-dot agent-echo-dot--active h-1.5 w-1.5 rounded-full bg-vibe-accent-2" />
            Live
          </span>
        )}
        {!live && failedCount > 0 && (
          <span className="shrink-0 text-[10px] text-red-300/90">
            {failedCount} failed
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] px-2.5 py-2">
          <ul
            ref={listRef}
            className={`vibe-scroll space-y-0 ${steps.length > 6 ? 'max-h-44 overflow-y-auto pr-1' : ''}`}
          >
            {steps.map((step, index) => (
              <EchoStepRow key={step.id} step={step} isLast={index === steps.length - 1} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
