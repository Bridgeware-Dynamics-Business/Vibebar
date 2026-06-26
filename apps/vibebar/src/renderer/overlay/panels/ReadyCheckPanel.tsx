import { useCallback, useEffect, useState } from 'react'
import type { ReadyCheckResult, ReadyCheckSignal, ReadyCheckStatus } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader } from '../../shared/ui'

type CopyOutcome = (copied: boolean, text: string) => void

const STATUS_META: Record<
  ReadyCheckStatus,
  { label: string; icon: string; ring: string; text: string }
> = {
  blocked: {
    label: 'Blocked',
    icon: 'Ban',
    ring: 'border-red-500/50 bg-red-500/10 text-red-200',
    text: 'Resolve blockers before committing.'
  },
  'needs-review': {
    label: 'Needs review',
    icon: 'AlertTriangle',
    ring: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
    text: 'Review signals below or copy the review prompt for AI help.'
  },
  'looks-ready': {
    label: 'Looks ready',
    icon: 'ShieldCheck',
    ring: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
    text: 'No blockers detected — still run your usual verify steps.'
  }
}

function signalIcon(level: ReadyCheckSignal['level']): string {
  if (level === 'blocked') return 'Ban'
  if (level === 'warning') return 'AlertTriangle'
  return 'Check'
}

function signalClass(level: ReadyCheckSignal['level']): string {
  if (level === 'blocked') return 'border-red-500/30 bg-red-500/10'
  if (level === 'warning') return 'border-amber-500/30 bg-amber-500/10'
  return 'border-white/10 bg-white/[0.03]'
}

function UntrackedFilesSection({
  files,
  onCopySummary,
  onCopyPaths
}: {
  files: NonNullable<ReadyCheckResult['untrackedFiles']>
  onCopySummary: () => void
  onCopyPaths: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const secretTotal = files.reduce((n, f) => n + f.secretCount, 0)

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={14} className="text-vibe-muted" />
        <Icon name="FileText" size={14} className="text-vibe-muted" />
        <span className="font-medium text-vibe-text">Untracked files ({files.length})</span>
        <span className="ml-auto text-vibe-muted">
          {secretTotal > 0 ? `${secretTotal} secret signal(s)` : 'scanned'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-vibe-border px-3 py-2.5 text-xs">
          <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-[10px] text-vibe-muted">
            {files.map((f) => (
              <li key={f.path} className="truncate">
                {f.path}
                {f.skipped ? ' (skipped — size cap)' : f.secretCount > 0 ? ` · ${f.secretCount} secret(s)` : ' · clean'}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopySummary}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-vibe-text hover:bg-white/15"
            >
              Copy untracked summary for AI
            </button>
            <button
              type="button"
              onClick={onCopyPaths}
              className="rounded-lg px-2.5 py-1 text-[11px] text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              Copy paths list
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DependencyChangeSection({
  summary,
  onCopyReview
}: {
  summary: NonNullable<ReadyCheckResult['dependencyChange']>
  onCopyReview: () => void
}): JSX.Element {
  const total = summary.added.length + summary.removed.length + summary.changed.length
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <p className="text-sm font-medium text-vibe-text">Dependency changes</p>
      <p className="mt-1 text-xs text-vibe-muted">
        {total} manifest change(s)
        {summary.unpinned.length > 0 ? ` · ${summary.unpinned.length} unpinned` : ''}
        {summary.lockfileSignalActive ? ' · lockfile audit pending' : ''}
      </p>
      <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-vibe-muted">
        {summary.added.slice(0, 4).map((d) => (
          <li key={`add-${d.name}`}>+ {d.name} {d.after}</li>
        ))}
        {summary.removed.slice(0, 4).map((d) => (
          <li key={`rm-${d.name}`}>- {d.name}</li>
        ))}
        {summary.changed.slice(0, 4).map((d) => (
          <li key={`chg-${d.name}`}>~ {d.name}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCopyReview}
        className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-vibe-text hover:bg-white/15"
      >
        Copy dependency review prompt
      </button>
    </div>
  )
}

export function ReadyCheckPanel({
  onClose,
  onCopyOutcome,
  onOpenAudit,
  onOpenTerminal,
  onCopyGitDiff,
  solid,
  onToggleSolid,
  onDetach
}: {
  onClose: () => void
  onCopyOutcome: CopyOutcome
  onOpenAudit: () => void
  onOpenTerminal: () => void
  onCopyGitDiff: () => void
  solid?: boolean
  onToggleSolid?: () => void
  onDetach?: () => void
}): JSX.Element {
  const [result, setResult] = useState<ReadyCheckResult | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setResult(await window.vibebar.readyCheck.get())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function copyReviewPrompt(): Promise<void> {
    const r = await window.vibebar.readyCheck.copyReviewPrompt()
    onCopyOutcome(r.copied, r.text)
  }

  async function copyUntrackedSummary(): Promise<void> {
    const r = await window.vibebar.readyCheck.copyUntrackedSummary()
    onCopyOutcome(r.copied, r.text)
  }

  async function copyUntrackedPaths(): Promise<void> {
    const paths = result?.untrackedFiles?.map((f) => f.path) ?? []
    if (paths.length === 0) return
    const text = paths.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      onCopyOutcome(true, text)
    } catch {
      onCopyOutcome(false, text)
    }
  }

  async function copyDependencyReview(): Promise<void> {
    const r = await window.vibebar.readyCheck.copyDependencyReview()
    onCopyOutcome(r.copied, r.text)
  }

  async function copyRegressionContext(): Promise<void> {
    const r = await window.vibebar.readyCheck.copyRegressionContext()
    onCopyOutcome(r.copied, r.text)
  }

  const lastGreenStale = result?.signals.some((s) => s.id === 'last-green-stale') ?? false

  const status = result?.status ?? 'needs-review'
  const meta = STATUS_META[status]

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Ready Check" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Ready Check" />}
      </PanelHeader>

      <div className="vibe-scroll flex-1 space-y-4 overflow-y-auto p-4">
        {result?.noProject ? (
          <p className="py-8 text-center text-sm text-vibe-muted">
            Select a project first to run Ready Check.
          </p>
        ) : (
          <>
            <div
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${meta.ring}`}
            >
              <Icon name={meta.icon} size={22} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{meta.label}</p>
                <p className="text-xs opacity-80">{meta.text}</p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="rounded-lg bg-white/10 p-2 text-vibe-muted hover:bg-white/15 hover:text-vibe-text disabled:opacity-40"
                title="Refresh"
                aria-label="Refresh Ready Check"
              >
                <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">
                Signals
              </p>
              {result?.verifyRecipe && (
                <div className="rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2.5">
                  <p className="text-sm font-medium text-vibe-text">Suggested verify recipe</p>
                  <p className="mt-1 font-mono text-[11px] text-vibe-muted">{result.verifyRecipe.summary}</p>
                  <ul className="mt-2 space-y-1 text-xs text-vibe-muted">
                    {result.verifyRecipe.steps.map((step) => (
                      <li key={step.id}>
                        {step.label}: <span className="font-mono text-vibe-text">{step.command}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result?.dependencyChange && (
                <DependencyChangeSection
                  summary={result.dependencyChange}
                  onCopyReview={() => void copyDependencyReview()}
                />
              )}
              {result?.untrackedFiles && result.untrackedFiles.length > 0 && (
                <UntrackedFilesSection
                  files={result.untrackedFiles}
                  onCopySummary={() => void copyUntrackedSummary()}
                  onCopyPaths={() => void copyUntrackedPaths()}
                />
              )}
              {(result?.contextWarningCount ?? 0) > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {result?.contextWarningCount} context warning
                  {(result?.contextWarningCount ?? 0) === 1 ? '' : 's'} — open Prompt Library or Context
                  Packer for details.
                </p>
              )}
              {result?.signals.map((signal) => (
                <div
                  key={`${signal.id}-${signal.label}`}
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${signalClass(signal.level)}`}
                >
                  <Icon
                    name={signalIcon(signal.level)}
                    size={15}
                    className={`mt-0.5 shrink-0 ${
                      signal.level === 'blocked'
                        ? 'text-red-400'
                        : signal.level === 'warning'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-vibe-text">{signal.label}</p>
                    <p className="text-xs text-vibe-muted">{signal.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!result?.noProject && (
        <div className="flex flex-wrap gap-2 border-t border-vibe-border p-3">
          <button
            type="button"
            onClick={() => void copyReviewPrompt()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-2 text-xs font-medium text-white"
          >
            <Icon name="Copy" size={13} /> Copy review prompt
          </button>
          <button
            type="button"
            onClick={onOpenAudit}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-vibe-text hover:bg-white/15"
          >
            <Icon name="ScanSearch" size={13} /> Security Audit
          </button>
          <button
            type="button"
            onClick={onOpenTerminal}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-vibe-text hover:bg-white/15"
          >
            <Icon name="SquareTerminal" size={13} /> Smart Terminal
          </button>
          <button
            type="button"
            onClick={onCopyGitDiff}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-vibe-text hover:bg-white/15"
          >
            <Icon name="GitBranch" size={13} /> Copy git diff
          </button>
          {lastGreenStale && (
            <button
              type="button"
              onClick={() => void copyRegressionContext()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
            >
              <Icon name="PackageOpen" size={13} /> Copy regression context
            </button>
          )}
        </div>
      )}
    </div>
  )
}
