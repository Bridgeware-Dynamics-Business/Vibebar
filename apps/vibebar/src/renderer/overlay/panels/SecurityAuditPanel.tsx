import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AuditConfidence,
  AuditFinding,
  AuditReport,
  AuditSeverity,
  ScanResult
} from '@shared/types.js'
import { AuditConfigSection } from '../../shared/auditPanel/AuditConfigSection'
import { AuditFindingCard } from '../../shared/auditPanel/AuditFindingCard'
import { AuditFindingGroup } from '../../shared/auditPanel/AuditFindingGroup'
import { buildAuditPromptFor } from '../../shared/auditPanel/buildAuditPrompt'
import { AuditExportMenu } from '../../shared/auditPanel/ExportMenu'
import { AuditFindingFilters, type AuditGroupBy } from '../../shared/auditPanel/FindingFilters'
import { AUDIT_SEVERITY_STYLE, AuditScoreRing } from '../../shared/auditUi'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'

type CopyOutcome = (copied: boolean, text: string) => void

const SEVERITY_ORDER: AuditSeverity[] = ['critical', 'high', 'medium', 'low']

function PasteScanner({ onCopy }: { onCopy: CopyOutcome }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)

  async function scan(): Promise<void> {
    setResult(await window.vibebar.scanner.scan(text))
  }
  async function copyRedacted(): Promise<void> {
    const r = await window.vibebar.scanner.copyRedacted(text)
    onCopy(r.copied, r.redactedText)
  }

  const clean = result && result.findings.length === 0

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={16} className="text-vibe-muted" />
        <Icon name="ShieldAlert" size={15} className="text-vibe-muted" />
        <span className="text-sm font-medium text-vibe-text">Scan pasted text for secrets</span>
        <span className="ml-auto text-[11px] text-vibe-muted">before sending to an AI</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-vibe-border p-3">
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setResult(null)
                }}
                placeholder="Paste code or text to scan locally…"
                className="vibe-scroll vibe-no-drag h-24 w-full resize-none rounded-lg border border-vibe-border bg-black/30 p-3 font-mono text-xs text-vibe-text outline-none focus:border-vibe-accent"
              />
              {result && (
                <div className="vibe-scroll max-h-28 overflow-y-auto rounded-lg border border-vibe-border bg-black/20 p-2">
                  {clean ? (
                    <p className="flex items-center gap-2 px-1 py-1 text-xs text-emerald-400">
                      <Icon name="ShieldCheck" size={14} /> No secrets detected.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {result.findings.map((f, i) => (
                        <li
                          key={`${f.kind}-${i}`}
                          className="flex items-center gap-2 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300"
                        >
                          <Icon name="AlertTriangle" size={13} />
                          <span className="font-medium">{f.kind}</span>
                          <span className="ml-auto font-mono text-[11px] text-red-200/80">{f.match}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void scan()}
                  disabled={!text}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-vibe-text disabled:opacity-40"
                >
                  Scan
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void copyRedacted()}
                  disabled={!text}
                  className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  <Icon name="Copy" size={13} /> Copy redacted
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SecurityAuditPanel({
  onClose,
  onCopyOutcome,
  solid,
  onToggleSolid,
  onDetach
}: {
  onClose: () => void
  onCopyOutcome: CopyOutcome
  solid?: boolean
  onToggleSolid?: () => void
  onDetach?: () => void
}): JSX.Element {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<number | null>(null)
  const [autoScan, setAutoScan] = useState(false)
  const [intervalValue, setIntervalValue] = useState(30)
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes'>('seconds')
  const runningRef = useRef(false)

  const [query, setQuery] = useState('')
  const [sevFilter, setSevFilter] = useState<Set<AuditSeverity>>(new Set())
  const [confFilter, setConfFilter] = useState<Set<AuditConfidence>>(new Set())
  const [onlyNew, setOnlyNew] = useState(false)
  const [groupBy, setGroupBy] = useState<AuditGroupBy>('none')
  const [showFilters, setShowFilters] = useState(false)

  const runAudit = useCallback(async (): Promise<void> => {
    if (runningRef.current) return
    runningRef.current = true
    setLoading(true)
    try {
      const next = await window.vibebar.audit.run()
      setReport(next)
      setLastRun(Date.now())
    } finally {
      runningRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runAudit()
  }, [runAudit])

  const intervalMs = Math.max(3000, intervalValue * (intervalUnit === 'minutes' ? 60_000 : 1000))

  useEffect(() => {
    if (!autoScan) return
    const id = window.setInterval(() => void runAudit(), intervalMs)
    return () => window.clearInterval(id)
  }, [autoScan, intervalMs, runAudit])

  const copy = useCallback(
    async (text: string) => {
      const r = await window.vibebar.clipboard.write(text)
      onCopyOutcome(r.copied, text)
    },
    [onCopyOutcome]
  )

  const acceptRisk = useCallback(
    async (fingerprint: string) => {
      await window.vibebar.audit.acceptRisk(fingerprint)
      void runAudit()
    },
    [runAudit]
  )

  const allFindings = report?.findings ?? []
  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: allFindings.filter((f) => f.severity === sev).length
  })).filter((c) => c.n > 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allFindings.filter((f) => {
      if (sevFilter.size > 0 && !sevFilter.has(f.severity)) return false
      if (confFilter.size > 0 && !confFilter.has(f.confidence)) return false
      if (onlyNew && f.status !== 'new') return false
      if (q) {
        const hay = `${f.title} ${f.detail} ${f.file ?? ''} ${f.category} ${f.cwe ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allFindings, query, sevFilter, confFilter, onlyNew])

  const groups = useMemo(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, AuditFinding[]>()
    for (const f of filtered) {
      const key =
        groupBy === 'severity'
          ? AUDIT_SEVERITY_STYLE[f.severity].label
          : groupBy === 'category'
            ? f.category
            : f.file ?? 'Project-level'
      const arr = map.get(key) ?? []
      arr.push(f)
      map.set(key, arr)
    }
    return [...map.entries()]
  }, [filtered, groupBy])

  const hasActiveFilters = sevFilter.size > 0 || confFilter.size > 0 || onlyNew || query.trim().length > 0

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Security Audit" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        <button
          type="button"
          onClick={() => void runAudit()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Scanning' : 'Run audit'}
        </button>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Security Audit" />}
      </PanelHeader>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-center gap-3 rounded-xl border border-vibe-border bg-white/[0.02] px-3 py-2.5">
          {report && !report.noProject && report.score && <AuditScoreRing score={report.score} />}
          <div className="min-w-0 flex-1">
            {report?.noProject ? (
              <p className="text-xs text-amber-300">Select a project from the toolbar, then run the audit.</p>
            ) : report ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-vibe-text">
                    {allFindings.length === 0
                      ? `No risk signals in ${report.scannedFiles} files`
                      : `${allFindings.length} issue(s) in ${report.scannedFiles} files`}
                  </span>
                  {report.delta && (report.delta.new > 0 || report.delta.resolved > 0) && (
                    <span className="flex items-center gap-1.5">
                      {report.delta.new > 0 && (
                        <span className="rounded-full bg-vibe-accent/20 px-2 py-0.5 text-[10px] font-semibold text-vibe-accent-2">
                          +{report.delta.new} new
                        </span>
                      )}
                      {report.delta.resolved > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          -{report.delta.resolved} resolved
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-vibe-muted">
                  {counts.map((c) => (
                    <span
                      key={c.sev}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${AUDIT_SEVERITY_STYLE[c.sev].chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${AUDIT_SEVERITY_STYLE[c.sev].dot}`} />
                      {c.n} {AUDIT_SEVERITY_STYLE[c.sev].label.toLowerCase()}
                    </span>
                  ))}
                  {report.mirroredToTerminal && (
                    <span className="flex items-center gap-1 text-vibe-accent-2">
                      <Icon name="SquareTerminal" size={12} /> mirrored
                    </span>
                  )}
                  {typeof report.durationMs === 'number' && (
                    <span className="text-vibe-muted/70">{report.durationMs}ms</span>
                  )}
                  {lastRun && (
                    <span className="ml-auto text-vibe-muted/80">last {new Date(lastRun).toLocaleTimeString()}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-vibe-muted">Running first scan…</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Toggle checked={autoScan} onChange={setAutoScan} label="Auto-scan" />
          <span className="text-vibe-text">Auto-scan</span>
          <span className="text-vibe-muted">every</span>
          <input
            type="number"
            min={intervalUnit === 'minutes' ? 1 : 5}
            value={intervalValue}
            onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
            className="vibe-no-drag w-12 rounded-md border border-vibe-border bg-black/30 px-2 py-1 text-center text-vibe-text outline-none focus:border-vibe-accent"
          />
          <select
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value as 'seconds' | 'minutes')}
            className="vibe-no-drag rounded-md border border-vibe-border bg-black/30 px-2 py-1 text-vibe-text outline-none focus:border-vibe-accent"
          >
            <option value="seconds">sec</option>
            <option value="minutes">min</option>
          </select>
          {autoScan && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              live
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {allFindings.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                  showFilters || hasActiveFilters ? 'bg-white/10 text-vibe-text' : 'text-vibe-muted hover:text-vibe-text'
                }`}
              >
                <Icon name="Filter" size={13} /> Filter
                {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-vibe-accent" />}
              </button>
            )}
          </div>
        </div>

        {showFilters && allFindings.length > 0 && (
          <AuditFindingFilters
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
            showNewFilter={Boolean(report?.delta && report.delta.new > 0)}
          />
        )}

        {report?.truncated && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
            <Icon name="AlertTriangle" size={13} className="mt-0.5 shrink-0" />
            <span>
              Scanned the first {report.scannedFiles} of {report.totalCandidates} source files. Results are partial —
              narrow the project folder for full coverage.
            </span>
          </div>
        )}

        <div className="vibe-scroll flex-1 space-y-2 overflow-y-auto pr-0.5">
          {report && !report.noProject && allFindings.length === 0 && !loading && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="ShieldCheck" size={15} /> No behavioral-risk signals found.
              </p>
              <p className="mt-1 text-emerald-200/70">
                Absence of a signal is not proof of safety — still test auth and object-level authorization with the
                behavioral prompts in the Prompt Library.
              </p>
            </div>
          )}
          {allFindings.length > 0 && filtered.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-vibe-muted">No findings match the current filters.</p>
          )}
          {report &&
            (groups
              ? groups.map(([key, items]) => (
                  <AuditFindingGroup
                    key={key}
                    label={groupBy === 'file' ? (key.split('/').pop() ?? key) : key}
                    sublabel={groupBy === 'file' && key !== 'Project-level' ? key : undefined}
                    findings={items}
                    report={report}
                    onCopy={onCopyOutcome}
                    scopeLabel={`in ${key}`}
                    onAcceptRisk={(fp) => void acceptRisk(fp)}
                  />
                ))
              : filtered.map((f) => (
                  <AuditFindingCard
                    key={f.id}
                    finding={f}
                    onCopy={onCopyOutcome}
                    onAcceptRisk={(fp) => void acceptRisk(fp)}
                  />
                )))}
        </div>

        <PasteScanner onCopy={onCopyOutcome} />
        <AuditConfigSection />
      </div>

      <div className="flex items-center gap-2 border-t border-vibe-border p-3">
        <button
          type="button"
          onClick={() => void window.vibebar.audit.scan()}
          title="Open the Smart Terminal and present findings."
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-vibe-muted hover:text-vibe-text"
        >
          <Icon name="SquareTerminal" size={14} /> Smart Terminal
        </button>
        {report && !report.noProject && allFindings.length > 0 && (
          <AuditExportMenu
            onExport={async (format) => {
              if (format === 'sarif') await window.vibebar.audit.exportSarif()
              else await window.vibebar.audit.exportMarkdown()
            }}
          />
        )}
        <div className="flex-1" />
        {filtered.length > 0 && report && (
          <button
            type="button"
            onClick={() => void copy(buildAuditPromptFor(filtered, report, hasActiveFilters ? '(filtered)' : ''))}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text hover:bg-white/15"
          >
            <Icon name="Copy" size={14} /> Copy {hasActiveFilters ? 'filtered' : 'all'} as one prompt
          </button>
        )}
      </div>
    </div>
  )
}
