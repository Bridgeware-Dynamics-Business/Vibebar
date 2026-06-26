import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { AnimatePresence, motion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AuditConfidence,
  AuditSeverity,
  DetectedIssue,
  IssueSeverity,
  TerminalAuditSummary,
  TerminalStatus
} from '@shared/types.js'
import type { ResizeEdge } from '@shared/terminalApi.js'
import { AUDIT_CONFIDENCE_STYLE, AUDIT_SEVERITY_STYLE, AuditScoreRing } from '../shared/auditUi'
import { AuditExportMenu } from '../shared/auditPanel/ExportMenu'
import { AuditFindingFilters, type AuditGroupBy } from '../shared/auditPanel/FindingFilters'
import { buildHandoffNotice, CopyHandoffToast, type CopyHandoffNotice } from '../shared/copyHandoff'
import { Icon } from '../shared/icons'
import { buildNoteBullet, SaveToNotePicker } from '../shared/saveToNote'
import { FillToggle, Toggle, useFillToggle } from '../shared/ui'
import { ShellPanel } from './ShellPanel'

type SevStyle = { chip: string; dot: string; label: string }

const AUDIT_STYLE: Record<AuditSeverity, SevStyle> = {
  critical: AUDIT_SEVERITY_STYLE.critical,
  high: AUDIT_SEVERITY_STYLE.high,
  medium: AUDIT_SEVERITY_STYLE.medium,
  low: AUDIT_SEVERITY_STYLE.low
}

const ISSUE_STYLE: Record<IssueSeverity, SevStyle> = {
  error: { chip: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Error' },
  warning: { chip: 'bg-amber-500/10 text-amber-200', dot: 'bg-amber-300', label: 'Warning' },
  info: { chip: 'bg-sky-500/10 text-sky-200', dot: 'bg-sky-300', label: 'Info' }
}

const AUDIT_ORDER: AuditSeverity[] = ['critical', 'high', 'medium', 'low']

function styleFor(issue: DetectedIssue): SevStyle {
  return issue.auditSeverity ? AUDIT_STYLE[issue.auditSeverity] : ISSUE_STYLE[issue.severity]
}

/**
 * Custom resize grips. The Smart Terminal lives in a frameless + transparent window, which on
 * Windows has no OS resize border, so we draw invisible edge/corner handles that drive the
 * window's bounds in the main process. On press we snapshot the bounds, then stream the cumulative
 * cursor delta (screen pixels) while the pointer is captured, so the drag keeps tracking even if
 * the cursor briefly outruns the moving edge.
 */
function ResizeHandles(): JSX.Element {
  const start = (edge: ResizeEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    const startX = e.screenX
    const startY = e.screenY
    el.setPointerCapture(e.pointerId)
    void window.terminal.resizeStart()
    const move = (ev: PointerEvent): void => {
      void window.terminal.resize(edge, ev.screenX - startX, ev.screenY - startY)
    }
    const up = (ev: PointerEvent): void => {
      try {
        el.releasePointerCapture(ev.pointerId)
      } catch {
        /* pointer already released */
      }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const edge = 'vibe-no-drag absolute z-50'
  const corner = 'vibe-no-drag absolute z-[60] h-3 w-3'
  return (
    <>
      <div className={`${edge} inset-x-0 top-0 h-1.5 cursor-ns-resize`} onPointerDown={start('n')} />
      <div className={`${edge} inset-x-0 bottom-0 h-1.5 cursor-ns-resize`} onPointerDown={start('s')} />
      <div className={`${edge} inset-y-0 left-0 w-1.5 cursor-ew-resize`} onPointerDown={start('w')} />
      <div className={`${edge} inset-y-0 right-0 w-1.5 cursor-ew-resize`} onPointerDown={start('e')} />
      <div className={`${corner} left-0 top-0 cursor-nwse-resize`} onPointerDown={start('nw')} />
      <div className={`${corner} right-0 top-0 cursor-nesw-resize`} onPointerDown={start('ne')} />
      <div className={`${corner} left-0 bottom-0 cursor-nesw-resize`} onPointerDown={start('sw')} />
      <div className={`${corner} right-0 bottom-0 cursor-nwse-resize`} onPointerDown={start('se')} />
    </>
  )
}

const THEME = {
  background: '#0b0d12',
  foreground: '#e8eaed',
  cursor: '#6366f1',
  selectionBackground: 'rgba(99,102,241,0.35)',
  black: '#0b0d12',
  brightBlack: '#5b6270'
}

/** Builds one consolidated, deeply-contextual prompt covering every finding, ready to paste. */
function buildConsolidatedPrompt(issues: DetectedIssue[], audit: TerminalAuditSummary | null): string {
  const project = audit?.projectName ?? 'my project'
  const files = audit?.scannedFiles
  const lines: string[] = [
    `You are a senior application-security engineer. VibeBar ran a read-only static audit of ${project}${files ? ` across ${files} scanned files` : ''} and found ${issues.length} issue(s).`,
    '',
    'Each finding below includes its severity, confidence, the mapped CWE/OWASP entry where known, the file and line, and a code frame. Work through them strictly in severity order (critical first). For each one: confirm it is real, explain the concrete attack or failure it enables, apply the minimal fix without weakening any other control, then describe a behavioral test that fails before the fix and passes after.',
    '',
    'Do not print secret values, environment variables, or full file paths back to me. Keep each change scoped to its single finding.',
    '',
    '==================== FINDINGS ===================='
  ]
  issues.forEach((f, i) => {
    lines.push('')
    const sev = (f.auditSeverity ?? f.severity).toUpperCase()
    const conf = f.confidence ? ` (confidence: ${f.confidence})` : ''
    lines.push(`#${i + 1} [${sev}]${conf} ${f.title}`)
    if (f.category) lines.push(`Category: ${f.category}`)
    if (f.cwe) lines.push(`Weakness: ${f.cwe}`)
    if (f.references && f.references.length > 0) lines.push(`Standards: ${f.references.join('; ')}`)
    if (f.file) lines.push(`File: ${f.file}${f.line ? `:${f.line}` : ''}`)
    lines.push(`What: ${f.summary}`)
    if (f.codeContext) {
      lines.push('Code:')
      lines.push(f.codeContext)
    } else if (f.evidence) {
      lines.push(`Evidence: ${f.evidence}`)
    }
  })
  lines.push('')
  lines.push('==================== END ====================')
  return lines.join('\n')
}

function ExportMenu(): JSX.Element {
  return (
    <AuditExportMenu
      compact
      onExport={async (format) => {
        if (format === 'sarif') await window.terminal.exportAuditSarif()
        else await window.terminal.exportAuditMarkdown()
      }}
    />
  )
}

function FindingCard({
  issue,
  onCopy,
  onFixWithContext,
  copiedId,
  copiedFixContext,
  onDismiss
}: {
  issue: DetectedIssue
  onCopy: (issue: DetectedIssue, kind: 'fix' | 'test') => void
  onFixWithContext?: (issue: DetectedIssue) => void
  copiedId: string | null
  copiedFixContext?: string | null
  onDismiss?: (issue: DetectedIssue) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const s = styleFor(issue)
  const conf = issue.confidence ? AUDIT_CONFIDENCE_STYLE[issue.confidence] : null
  const hasDetail = Boolean(issue.codeContext || issue.evidence || issue.cwe || issue.references?.length)
  const isTerminalIssue = issue.source !== 'audit'
  const fixContextKey = `${issue.id}:fix-context`

  const noteMarkdown = buildNoteBullet({
    title: issue.title,
    fileLine: issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : undefined,
    excerpt: issue.prompt.slice(0, 400)
  })

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.03] transition-colors hover:border-white/15">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 p-2.5 text-left"
        aria-expanded={expanded}
      >
        <Icon
          name={hasDetail ? (expanded ? 'ChevronDown' : 'ChevronRight') : 'Dot'}
          size={16}
          className="mt-0.5 shrink-0 text-vibe-muted"
        />
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
            </span>
            {conf && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.chip}`} title={conf.title}>
                {conf.label}
              </span>
            )}
            {issue.status === 'new' && (
              <span className="rounded-full bg-vibe-accent/20 px-2 py-0.5 text-[10px] font-semibold text-vibe-accent-2">
                new
              </span>
            )}
            <span className="text-xs font-medium text-vibe-text">{issue.title}</span>
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-vibe-muted">{issue.summary}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-vibe-muted">
            {issue.category && <span className="rounded-full bg-white/5 px-2 py-0.5">{issue.category}</span>}
            {issue.file && (
              <span className="font-mono text-vibe-muted/90">
                {issue.file}
                {issue.line ? `:${issue.line}` : ''}
              </span>
            )}
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-vibe-border px-2.5 py-2.5">
              {(issue.cwe || (issue.references && issue.references.length > 0)) && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {issue.cwe && (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-vibe-text">
                      {issue.cwe}
                    </span>
                  )}
                  {issue.references?.map((ref) => (
                    <span key={ref} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-vibe-muted">
                      {ref}
                    </span>
                  ))}
                </div>
              )}
              {issue.codeContext ? (
                <pre className="vibe-scroll mb-2 max-h-44 overflow-auto whitespace-pre rounded-lg bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-vibe-text">
                  {issue.codeContext}
                </pre>
              ) : (
                issue.evidence && (
                  <pre className="vibe-scroll mb-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2.5 font-mono text-[11px] leading-relaxed text-vibe-text">
                    {issue.evidence}
                  </pre>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
        <button
          type="button"
          onClick={() => onCopy(issue, 'fix')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-vibe-accent px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-vibe-accent/85"
        >
          <Icon name={copiedId === `${issue.id}:fix` ? 'Check' : 'Wrench'} size={12} />
          {copiedId === `${issue.id}:fix` ? 'Copied' : 'Copy fix prompt'}
        </button>
        {isTerminalIssue && onFixWithContext && (
          <button
            type="button"
            onClick={() => onFixWithContext(issue)}
            title="Copy failure + git-changed files + stack context in one bundle"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-500/90 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500/75"
          >
            <Icon name={copiedFixContext === fixContextKey ? 'Check' : 'PackageOpen'} size={12} />
            {copiedFixContext === fixContextKey ? 'Copied' : 'Fix with context'}
          </button>
        )}
        {issue.testPrompt && (
          <button
            type="button"
            onClick={() => onCopy(issue, 'test')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-medium text-vibe-text transition-colors hover:bg-white/15"
          >
            <Icon name={copiedId === `${issue.id}:test` ? 'Check' : 'FlaskConical'} size={12} />
            {copiedId === `${issue.id}:test` ? 'Copied' : 'Copy test'}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(issue)}
            title="Mark resolved"
            className="flex items-center justify-center rounded-md border border-vibe-border px-2 py-1.5 text-[11px] text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="ListChecks" size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          title="Save to note"
          className="flex items-center justify-center rounded-md bg-white/5 px-2 py-1.5 text-[11px] text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="StickyNote" size={12} />
        </button>
      </div>
      <SaveToNotePicker open={saveOpen} onClose={() => setSaveOpen(false)} markdown={noteMarkdown} />
    </div>
  )
}

function AuditDock({
  issues,
  audit,
  scanning,
  autoScan,
  setAutoScan,
  intervalValue,
  setIntervalValue,
  intervalUnit,
  setIntervalUnit,
  onRun,
  onClose,
  onCopy,
  onFixWithContext,
  onCopyAll,
  copiedId,
  copiedFixContext,
  copiedAll,
  onDismiss
}: {
  issues: DetectedIssue[]
  audit: TerminalAuditSummary | null
  scanning: boolean
  autoScan: boolean
  setAutoScan: (v: boolean) => void
  intervalValue: number
  setIntervalValue: (v: number) => void
  intervalUnit: 'seconds' | 'minutes'
  setIntervalUnit: (v: 'seconds' | 'minutes') => void
  onRun: () => void
  onClose: () => void
  onCopy: (issue: DetectedIssue, kind: 'fix' | 'test') => void
  onFixWithContext?: (issue: DetectedIssue) => void
  onCopyAll: (issues: DetectedIssue[]) => void
  copiedId: string | null
  copiedFixContext: string | null
  copiedAll: boolean
  onDismiss?: (issue: DetectedIssue) => void
}): JSX.Element {
  const fromAudit = audit !== null || issues.some((i) => i.source === 'audit')
  const [query, setQuery] = useState('')
  const [sevFilter, setSevFilter] = useState<Set<AuditSeverity>>(new Set())
  const [confFilter, setConfFilter] = useState<Set<AuditConfidence>>(new Set())
  const [onlyNew, setOnlyNew] = useState(false)
  const [groupBy, setGroupBy] = useState<AuditGroupBy>('none')
  const [showFilters, setShowFilters] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return issues.filter((i) => {
      if (sevFilter.size > 0 && (!i.auditSeverity || !sevFilter.has(i.auditSeverity))) return false
      if (confFilter.size > 0 && (!i.confidence || !confFilter.has(i.confidence))) return false
      if (onlyNew && i.status !== 'new') return false
      if (q) {
        const hay = `${i.title} ${i.summary} ${i.file ?? ''} ${i.category ?? ''} ${i.cwe ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [issues, query, sevFilter, confFilter, onlyNew])

  const counts = AUDIT_ORDER.map((sev) => ({
    sev,
    n: issues.filter((i) => i.auditSeverity === sev).length
  })).filter((c) => c.n > 0)

  const hasActiveFilters = sevFilter.size > 0 || confFilter.size > 0 || onlyNew || query.trim().length > 0

  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, DetectedIssue[]>()
    for (const i of filtered) {
      const key =
        groupBy === 'severity'
          ? i.auditSeverity
            ? AUDIT_STYLE[i.auditSeverity].label
            : ISSUE_STYLE[i.severity].label
          : groupBy === 'category'
            ? i.category ?? 'Uncategorized'
            : i.file ?? 'Project-level'
      const arr = map.get(key) ?? []
      arr.push(i)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [filtered, groupBy])

  return (
    <div className="vibe-no-drag flex w-[24rem] shrink-0 flex-col border-l border-vibe-border bg-black/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-vibe-border px-3 py-2">
        <Icon name="ShieldAlert" size={15} className="text-vibe-accent" />
        <span className="text-xs font-semibold text-vibe-text">Security Audit</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRun}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          <Icon name={scanning ? 'Loader2' : 'RefreshCw'} size={12} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning' : 'Run audit'}
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Hide panel"
          className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
        >
          <Icon name="PanelRightClose" size={15} />
        </button>
      </div>

      {/* Auto-scan controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-vibe-border px-3 py-2 text-[11px]">
        <Toggle checked={autoScan} onChange={setAutoScan} label="Auto-scan" />
        <span className="text-vibe-text">Auto-scan</span>
        <span className="text-vibe-muted">every</span>
        <input
          type="number"
          min={intervalUnit === 'minutes' ? 1 : 5}
          value={intervalValue}
          onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
          className="w-12 rounded-md border border-vibe-border bg-black/30 px-1.5 py-1 text-center text-vibe-text outline-none focus:border-vibe-accent"
        />
        <select
          value={intervalUnit}
          onChange={(e) => setIntervalUnit(e.target.value as 'seconds' | 'minutes')}
          className="rounded-md border border-vibe-border bg-black/30 px-1.5 py-1 text-vibe-text outline-none focus:border-vibe-accent"
        >
          <option value="seconds">sec</option>
          <option value="minutes">min</option>
        </select>
        {autoScan && (
          <span className="ml-auto flex items-center gap-1.5 text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            live
          </span>
        )}
      </div>

      {/* Posture summary */}
      {fromAudit && (
        <div className="flex items-center gap-2.5 border-b border-vibe-border px-3 py-2.5">
          {audit && !audit.noProject && audit.score && <AuditScoreRing score={audit.score} />}
          <div className="min-w-0 flex-1">
            {audit?.noProject ? (
              <p className="text-[11px] text-amber-300">Select a project from the toolbar, then run the audit.</p>
            ) : audit ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-medium text-vibe-text">
                    {issues.length === 0
                      ? `No risk signals in ${audit.scannedFiles} files`
                      : `${issues.length} issue(s) in ${audit.scannedFiles} files`}
                  </span>
                  {audit.delta && (audit.delta.new > 0 || audit.delta.resolved > 0) && (
                    <span className="flex items-center gap-1">
                      {audit.delta.new > 0 && (
                        <span className="rounded-full bg-vibe-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-vibe-accent-2">
                          +{audit.delta.new} new
                        </span>
                      )}
                      {audit.delta.resolved > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          -{audit.delta.resolved} resolved
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-vibe-muted">
                  {counts.map((c) => (
                    <span key={c.sev} className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${AUDIT_STYLE[c.sev].chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${AUDIT_STYLE[c.sev].dot}`} />
                      {c.n} {AUDIT_STYLE[c.sev].label.toLowerCase()}
                    </span>
                  ))}
                  {typeof audit.durationMs === 'number' && (
                    <span className="text-vibe-muted/70">{audit.durationMs}ms</span>
                  )}
                  <span className="ml-auto text-vibe-muted/80">{new Date(audit.ranAt).toLocaleTimeString()}</span>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-vibe-muted">Run an audit to see posture score and grading.</p>
            )}
          </div>
          {audit && !audit.noProject && issues.length > 0 && <ExportMenu />}
        </div>
      )}

      {audit?.truncated && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-300">
          <Icon name="AlertTriangle" size={12} className="mt-0.5 shrink-0" />
          <span>
            Scanned the first {audit.scannedFiles} of {audit.totalCandidates} source files — results are partial.
          </span>
        </div>
      )}

      {/* Filter toggle */}
      {fromAudit && issues.length > 0 && (
        <div className="border-b border-vibe-border px-3 py-1.5">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${
              showFilters || hasActiveFilters ? 'bg-white/10 text-vibe-text' : 'text-vibe-muted hover:text-vibe-text'
            }`}
          >
            <Icon name="Filter" size={12} /> Filter
            {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-vibe-accent" />}
          </button>
        </div>
      )}

      {showFilters && issues.length > 0 && (
        <AuditFindingFilters
          compact
          query={query}
          onQueryChange={setQuery}
          sevFilter={sevFilter}
          onSevFilterChange={setSevFilter}
          confFilter={confFilter}
          onConfFilterChange={setConfFilter}
          onlyNew={onlyNew}
          onOnlyNewChange={setOnlyNew}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          showNewFilter={Boolean(audit?.delta && audit.delta.new > 0)}
        />
      )}

      {/* Summary (command-output issues only) */}
      {!fromAudit && (
      <div className="flex flex-wrap items-center gap-1.5 border-b border-vibe-border px-3 py-2 text-[11px] text-vibe-muted">
        <Icon name="ScanSearch" size={13} />
        <span className="text-vibe-text">
          {issues.length === 0
            ? 'No issues'
            : `${issues.length} issue${issues.length === 1 ? '' : 's'}`}
        </span>
        {counts.map((c) => (
          <span key={c.sev} className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${AUDIT_STYLE[c.sev].chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${AUDIT_STYLE[c.sev].dot}`} />
            {c.n} {AUDIT_STYLE[c.sev].label.toLowerCase()}
          </span>
        ))}
      </div>
      )}

      {/* Findings */}
      <div className="vibe-scroll flex-1 space-y-2 overflow-y-auto p-3">
        {issues.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-emerald-300">
            <p className="flex items-center gap-2 font-medium">
              <Icon name="ShieldCheck" size={14} /> No risk signals.
            </p>
            <p className="mt-1 text-emerald-200/70">
              Run the audit after changes. Absence of a signal is not proof of safety — still test
              auth and object-level authorization.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-4 text-center text-[11px] text-vibe-muted">No findings match the current filters.</p>
        ) : groups ? (
          groups.map(([key, items]) => (
            <div key={key} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">
                {key} <span className="text-vibe-muted/70">({items.length})</span>
              </p>
              {items.map((issue) => (
                <FindingCard
                  key={issue.id}
                  issue={issue}
                  onCopy={onCopy}
                  onFixWithContext={onFixWithContext}
                  copiedId={copiedId}
                  copiedFixContext={copiedFixContext}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          ))
        ) : (
          filtered.map((issue) => (
            <FindingCard
              key={issue.id}
              issue={issue}
              onCopy={onCopy}
              onFixWithContext={onFixWithContext}
              copiedId={copiedId}
              copiedFixContext={copiedFixContext}
              onDismiss={onDismiss}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="border-t border-vibe-border p-2.5">
          <button
            type="button"
            onClick={() => onCopyAll(filtered)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-medium text-vibe-text hover:bg-white/15"
          >
            <Icon name={copiedAll ? 'Check' : 'Copy'} size={13} />
            {copiedAll ? 'Copied all findings' : `Copy ${hasActiveFilters ? 'filtered' : 'all'} as one prompt`}
          </button>
        </div>
      )}
    </div>
  )
}

export function TerminalApp(): JSX.Element {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef<number>(-1)

  const [command, setCommand] = useState('')
  const [status, setStatus] = useState<TerminalStatus>({
    running: false,
    cwd: '',
    exitCode: null,
    lastCommand: null
  })
  const [issues, setIssues] = useState<DetectedIssue[]>([])
  const [audit, setAudit] = useState<TerminalAuditSummary | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedFixContext, setCopiedFixContext] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [handoffNotice, setHandoffNotice] = useState<CopyHandoffNotice | null>(null)
  const [dismissedFingerprints, setDismissedFingerprints] = useState<Set<string>>(() => new Set())
  const [solid, toggleSolid] = useFillToggle('terminal.solid')

  const [dockOpen, setDockOpen] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [autoScan, setAutoScan] = useState(false)
  const [intervalValue, setIntervalValue] = useState(30)
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes'>('seconds')
  const scanningRef = useRef(false)

  useEffect(() => {
    if (!termRef.current) return
    const term = new Terminal({
      fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()
    term.writeln('\u001b[38;5;111mVibeBar Smart Terminal\u001b[0m — run a command or audit and I\u2019ll surface fixes.')
    xtermRef.current = term
    fitRef.current = fit

    const offData = window.terminal.onData((chunk) => term.write(chunk))
    const offStatus = window.terminal.onStatus(setStatus)
    const offIssues = window.terminal.onIssues((update) => {
      setIssues(update.issues)
      setAudit(update.audit)
      if (update.audit !== null || update.issues.length > 0) setDockOpen(true)
    })
    void window.terminal.getState().then((s) => {
      setStatus(s.status)
      setProjectName(s.projectName)
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore transient sizing errors while hidden */
      }
    })
    ro.observe(termRef.current)

    return () => {
      offData()
      offStatus()
      offIssues()
      ro.disconnect()
      term.dispose()
      xtermRef.current = null
    }
  }, [])

  // Refit when the dock opens/closes so xterm uses the freed/taken columns.
  useEffect(() => {
    try {
      fitRef.current?.fit()
    } catch {
      /* ignore transient sizing errors */
    }
  }, [dockOpen])

  const runAudit = useCallback(async (quiet: boolean): Promise<void> => {
    if (scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setDockOpen(true)
    try {
      await window.terminal.runAudit(quiet)
    } finally {
      scanningRef.current = false
      setScanning(false)
    }
  }, [])

  const intervalMs = Math.max(3000, intervalValue * (intervalUnit === 'minutes' ? 60_000 : 1000))

  function issueFingerprint(issue: DetectedIssue): string {
    return issue.fingerprint ?? `${issue.id}:${issue.evidence.slice(0, 120)}`
  }

  const visibleIssues = useMemo(
    () => issues.filter((i) => !dismissedFingerprints.has(issueFingerprint(i))),
    [issues, dismissedFingerprints]
  )

  const dismissIssue = useCallback((issue: DetectedIssue) => {
    const fp = issueFingerprint(issue)
    setDismissedFingerprints((prev) => new Set(prev).add(fp))
    void window.terminal.dismissIssue(fp)
  }, [])

  useEffect(() => {
    if (!autoScan) return
    const id = window.setInterval(() => void runAudit(true), intervalMs)
    return () => window.clearInterval(id)
  }, [autoScan, intervalMs, runAudit])

  const submit = useCallback(() => {
    const cmd = command.trim()
    if (!cmd) return
    historyRef.current = [cmd, ...historyRef.current.filter((c) => c !== cmd)].slice(0, 100)
    historyIdxRef.current = -1
    setIssues([])
    setAudit(null)
    void window.terminal.run(cmd)
    setCommand('')
  }, [command])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = Math.min(historyIdxRef.current + 1, historyRef.current.length - 1)
        if (next >= 0) {
          historyIdxRef.current = next
          setCommand(historyRef.current[next] ?? '')
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = historyIdxRef.current - 1
        historyIdxRef.current = next
        setCommand(next >= 0 ? (historyRef.current[next] ?? '') : '')
      }
    },
    [submit]
  )

  function clear(): void {
    xtermRef.current?.clear()
    setIssues([])
    setAudit(null)
    void window.terminal.clear()
  }

  async function fixWithContext(issue: DetectedIssue): Promise<void> {
    const key = `${issue.id}:fix-context`
    const { copied } = await window.terminal.fixWithContext(issue.id)
    if (copied) {
      setHandoffNotice(buildHandoffNotice(true))
    }
    setCopiedFixContext(key)
    window.setTimeout(() => setCopiedFixContext((id) => (id === key ? null : id)), 1600)
  }

  async function copyIssue(issue: DetectedIssue, kind: 'fix' | 'test'): Promise<void> {
    const text = kind === 'test' && issue.testPrompt ? issue.testPrompt : issue.prompt
    const key = `${issue.id}:${kind}`
    const { copied } = await window.terminal.copy(text)
    if (copied) {
      setHandoffNotice(buildHandoffNotice(true))
      if (kind === 'fix') {
        void window.terminal.sessionAppend({
          type: issue.source === 'audit' ? 'audit-finding' : 'terminal-issue',
          title: issue.title,
          fullText: text,
          ...(issue.source === 'audit'
            ? {
                fingerprint: issue.id,
                severity: issue.auditSeverity ?? issue.severity,
                file: issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : undefined,
                fixExcerpt: issue.prompt.slice(0, 400)
              }
            : {
                issueId: issue.id,
                command: status.lastCommand ?? undefined
              })
        })
      } else {
        void window.terminal.sessionAppend({
          type: issue.source === 'audit' ? 'audit-finding' : 'terminal-issue',
          title: `${issue.title} (behavioral test)`,
          fullText: text,
          ...(issue.source === 'audit'
            ? {
                fingerprint: `${issue.id}:test`,
                severity: issue.auditSeverity ?? issue.severity,
                file: issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : undefined,
                fixExcerpt: text.slice(0, 400)
              }
            : {
                issueId: `${issue.id}:test`,
                command: status.lastCommand ?? undefined
              })
        })
      }
    }
    setCopiedId(key)
    window.setTimeout(() => setCopiedId((id) => (id === key ? null : id)), 1600)
  }

  async function copyAll(toCopy: DetectedIssue[]): Promise<void> {
    if (toCopy.length === 0) return
    const text = buildConsolidatedPrompt(toCopy, audit)
    const { copied } = await window.terminal.copy(text)
    if (copied) {
      setHandoffNotice(buildHandoffNotice(true))
      void window.terminal.sessionAppend({
        type: 'note',
        title: `Terminal: copy all (${toCopy.length} issue${toCopy.length === 1 ? '' : 's'})`,
        noteId: 'terminal-bulk',
        text: `${toCopy.length} issue(s) copied as one prompt`,
        fullText: text
      })
    }
    setCopiedAll(true)
    window.setTimeout(() => setCopiedAll(false), 1600)
  }

  function rerunLast(): void {
    const cmd = status.lastCommand?.trim()
    if (!cmd || status.running) return
    void window.terminal.run(cmd)
  }

  return (
    <div
      className={`relative flex h-full w-full flex-col text-vibe-text ${
        solid ? 'bg-vibe-bg' : 'bg-vibe-bg/60 backdrop-blur-xl backdrop-saturate-150'
      }`}
    >
      <ResizeHandles />
      <header className="vibe-drag flex items-center gap-2 border-b border-vibe-border bg-black/40 px-3 py-2">
        <Icon name="SquareTerminal" size={15} className="text-vibe-accent-2" />
        <span className="text-sm font-semibold">Smart Terminal</span>
        {status.running && (
          <Icon name="Loader2" size={13} className="animate-spin text-vibe-accent-2" />
        )}
        <span className="ml-2 truncate font-mono text-[11px] text-vibe-muted">{status.cwd}</span>
        <div className="flex-1" />
        <div className="vibe-no-drag flex items-center gap-1">
          <button
            type="button"
            onClick={() => void runAudit(false)}
            disabled={scanning}
            title="Run a full security audit of this project"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-vibe-muted hover:bg-white/10 hover:text-vibe-text disabled:opacity-50"
          >
            <Icon name={scanning ? 'Loader2' : 'ShieldAlert'} size={14} className={scanning ? 'animate-spin' : ''} />
            Audit
          </button>
          <button
            type="button"
            onClick={() => setShellOpen((v) => !v)}
            title={shellOpen ? 'Hide terminal' : 'Open terminal (cmd / PowerShell)'}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-white/10 ${shellOpen ? 'text-vibe-accent' : 'text-vibe-muted hover:text-vibe-text'}`}
          >
            <Icon name="Terminal" size={14} /> Terminal
          </button>
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            title={dockOpen ? 'Hide audit panel' : 'Show audit panel'}
            className={`rounded-md p-1 hover:bg-white/10 ${dockOpen ? 'text-vibe-accent' : 'text-vibe-muted hover:text-vibe-text'}`}
          >
            <Icon name={dockOpen ? 'PanelRightClose' : 'PanelRight'} size={15} />
          </button>
          {status.running && (
            <button
              type="button"
              onClick={() => void window.terminal.cancel()}
              title="Cancel running command"
              className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-red-400"
            >
              <Icon name="Ban" size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={clear}
            title="Clear"
            className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="Trash2" size={15} />
          </button>
          <FillToggle solid={solid} onToggle={toggleSolid} />
          <button
            type="button"
            onClick={() => void window.terminal.hide()}
            title="Hide (reopen from the toolbar)"
            className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={termRef} className="min-w-0 flex-1 p-2" />
        {dockOpen && (
          <AuditDock
            issues={visibleIssues}
            audit={audit}
            scanning={scanning}
            autoScan={autoScan}
            setAutoScan={setAutoScan}
            intervalValue={intervalValue}
            setIntervalValue={setIntervalValue}
            intervalUnit={intervalUnit}
            setIntervalUnit={setIntervalUnit}
            onRun={() => void runAudit(false)}
            onClose={() => setDockOpen(false)}
            onCopy={(i, kind) => void copyIssue(i, kind)}
            onFixWithContext={(i) => void fixWithContext(i)}
            onCopyAll={(list) => void copyAll(list)}
            copiedId={copiedId}
            copiedFixContext={copiedFixContext}
            copiedAll={copiedAll}
            onDismiss={dismissIssue}
          />
        )}
      </div>

      <div className="vibe-no-drag flex items-center gap-2 border-t border-vibe-border bg-black/40 px-3 py-2">
        <Icon name="ChevronRight" size={16} className="text-vibe-accent" />
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoFocus
          placeholder={status.running ? 'Running… (Cancel to interrupt)' : 'Type a command and press Enter'}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-vibe-text outline-none placeholder:text-vibe-muted/60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={status.running || !command.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <Icon name="Play" size={13} /> Run
        </button>
        {status.lastCommand && !status.running && (
          <button
            type="button"
            onClick={rerunLast}
            title={`Re-run: ${status.lastCommand}`}
            className="flex items-center gap-1 rounded-lg border border-vibe-border px-2.5 py-1.5 text-xs text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="RotateCcw" size={13} /> Re-run
          </button>
        )}
      </div>

      <CopyHandoffToast
        notice={handoffNotice}
        onDismiss={() => setHandoffNotice(null)}
        onOpenCursor={() => void window.terminal.openCursor()}
      />

      {shellOpen && (
        <ShellPanel cwd={status.cwd} projectName={projectName} onClose={() => setShellOpen(false)} />
      )}
    </div>
  )
}
