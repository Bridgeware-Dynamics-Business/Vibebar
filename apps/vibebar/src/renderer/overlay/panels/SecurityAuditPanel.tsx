import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditFinding, AuditReport, AuditSeverity, ScanResult } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'

type CopyOutcome = (copied: boolean, text: string) => void

const SEVERITY_STYLE: Record<AuditSeverity, { text: string; chip: string; dot: string; label: string }> = {
  critical: { text: 'text-red-300', chip: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Critical' },
  high: { text: 'text-orange-300', chip: 'bg-orange-500/15 text-orange-300', dot: 'bg-orange-400', label: 'High' },
  medium: { text: 'text-amber-200', chip: 'bg-amber-500/10 text-amber-200', dot: 'bg-amber-300', label: 'Medium' },
  low: { text: 'text-sky-200', chip: 'bg-sky-500/10 text-sky-200', dot: 'bg-sky-300', label: 'Low' }
}

const SEVERITY_ORDER: AuditSeverity[] = ['critical', 'high', 'medium', 'low']

/** Builds one consolidated, deeply-contextual prompt covering every finding, ready to paste. */
function buildConsolidatedPrompt(report: AuditReport): string {
  const lines: string[] = [
    `You are a senior application-security engineer. VibeBar ran a read-only static audit of ${report.projectName ?? 'my project'} and found ${report.findings.length} issue(s) across ${report.scannedFiles} scanned files.`,
    '',
    'Each finding below includes its severity, the mapped CWE/OWASP entry, the exact file and line, and a code frame. Work through them strictly in severity order (critical first). For each one: confirm it is real, explain the concrete attack it enables, apply the minimal fix without weakening any other control, and then describe a behavioral test that fails before the fix and passes after.',
    '',
    'Do not print any secret values, environment variables, or full file paths back to me. Keep each change scoped to its single finding.',
    '',
    '==================== FINDINGS ===================='
  ]
  report.findings.forEach((f, i) => {
    lines.push('')
    lines.push(`#${i + 1} [${f.severity.toUpperCase()}] ${f.title}`)
    lines.push(`Category: ${f.category}`)
    if (f.cwe) lines.push(`Weakness: ${f.cwe}`)
    if (f.references && f.references.length > 0) lines.push(`Standards: ${f.references.join('; ')}`)
    if (f.file) lines.push(`File: ${f.file}${f.line ? `:${f.line}${f.column ? `:${f.column}` : ''}` : ''}`)
    lines.push(`What: ${f.detail}`)
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

function FindingCard({ finding, onCopy }: { finding: AuditFinding; onCopy: CopyOutcome }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<'fix' | 'test' | null>(null)
  const s = SEVERITY_STYLE[finding.severity]

  const doCopy = useCallback(
    async (which: 'fix' | 'test') => {
      const text = which === 'fix' ? finding.fixPrompt : finding.testPrompt
      const r = await window.vibebar.clipboard.write(text)
      onCopy(r.copied, text)
      if (r.copied) {
        setCopied(which)
        window.setTimeout(() => setCopied(null), 1600)
      }
    },
    [finding.fixPrompt, finding.testPrompt, onCopy]
  )

  return (
    <div className="rounded-xl border border-vibe-border bg-white/[0.03] transition-colors hover:border-white/15">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 p-3 text-left"
        aria-expanded={expanded}
      >
        <Icon
          name={expanded ? 'ChevronDown' : 'ChevronRight'}
          size={16}
          className="mt-0.5 shrink-0 text-vibe-muted"
        />
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
            </span>
            <span className="text-sm font-medium text-vibe-text">{finding.title}</span>
          </span>
          <span className="mt-1 block text-xs leading-snug text-vibe-muted">{finding.detail}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-vibe-muted">
            <span className="rounded-full bg-white/5 px-2 py-0.5">{finding.category}</span>
            {finding.file && (
              <span className="font-mono text-vibe-muted/90">
                {finding.file}
                {finding.line ? `:${finding.line}` : ''}
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
            <div className="border-t border-vibe-border px-3 py-3">
              {finding.cwe && (
                <p className="mb-1 text-[11px] text-vibe-muted">
                  <span className="text-vibe-text">{finding.cwe}</span>
                </p>
              )}
              {finding.references && finding.references.length > 0 && (
                <p className="mb-2 text-[11px] text-vibe-muted">{finding.references.join(' \u00b7 ')}</p>
              )}
              {finding.codeContext ? (
                <pre className="vibe-scroll mb-2 max-h-44 overflow-auto whitespace-pre rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-vibe-text">
                  {finding.codeContext}
                </pre>
              ) : (
                finding.evidence && (
                  <pre className="vibe-scroll mb-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-vibe-text">
                    {finding.evidence}
                  </pre>
                )
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void doCopy('fix')}
                  className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-vibe-accent/85"
                >
                  <Icon name={copied === 'fix' ? 'Check' : 'Wrench'} size={14} />
                  {copied === 'fix' ? 'Copied' : 'Copy fix prompt'}
                </button>
                <button
                  type="button"
                  onClick={() => void doCopy('test')}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text transition-colors hover:bg-white/15"
                >
                  <Icon name={copied === 'test' ? 'Check' : 'FlaskConical'} size={14} />
                  {copied === 'test' ? 'Copied' : 'Copy behavioral test'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

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
  /** When provided, shows a Detach button that pops the panel out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<number | null>(null)
  const [autoScan, setAutoScan] = useState(false)
  const [intervalValue, setIntervalValue] = useState(30)
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes'>('seconds')
  const runningRef = useRef(false)

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

  const intervalMs = Math.max(
    3000,
    intervalValue * (intervalUnit === 'minutes' ? 60_000 : 1000)
  )

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

  const findings = report?.findings ?? []
  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: findings.filter((f) => f.severity === sev).length
  })).filter((c) => c.n > 0)

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
        {/* Auto-scan controls */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-vibe-border bg-white/[0.02] px-3 py-2 text-xs">
          <Toggle checked={autoScan} onChange={setAutoScan} label="Auto-scan" />
          <span className="text-vibe-text">Auto-scan</span>
          <span className="text-vibe-muted">every</span>
          <input
            type="number"
            min={intervalUnit === 'minutes' ? 1 : 5}
            value={intervalValue}
            onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
            className="vibe-no-drag w-14 rounded-md border border-vibe-border bg-black/30 px-2 py-1 text-center text-vibe-text outline-none focus:border-vibe-accent"
          />
          <select
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value as 'seconds' | 'minutes')}
            className="vibe-no-drag rounded-md border border-vibe-border bg-black/30 px-2 py-1 text-vibe-text outline-none focus:border-vibe-accent"
          >
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
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

        {/* Summary */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-vibe-muted">
          {report?.noProject ? (
            <span className="text-amber-300">Select a project from the toolbar, then run the audit.</span>
          ) : report ? (
            <>
              <span className="text-vibe-text">
                {findings.length === 0
                  ? `No risk signals in ${report.scannedFiles} files`
                  : `${findings.length} issue(s) in ${report.scannedFiles} files`}
              </span>
              {counts.map((c) => (
                <span
                  key={c.sev}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${SEVERITY_STYLE[c.sev].chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_STYLE[c.sev].dot}`} />
                  {c.n} {SEVERITY_STYLE[c.sev].label.toLowerCase()}
                </span>
              ))}
              {report.mirroredToTerminal && (
                <span className="flex items-center gap-1 text-[11px] text-vibe-accent-2">
                  <Icon name="SquareTerminal" size={12} /> mirrored to terminal
                </span>
              )}
              {lastRun && (
                <span className="ml-auto text-[11px] text-vibe-muted/80">
                  last {new Date(lastRun).toLocaleTimeString()}
                </span>
              )}
            </>
          ) : (
            <span>Running first scan…</span>
          )}
        </div>

        {/* Findings list */}
        <div className="vibe-scroll flex-1 space-y-2 overflow-y-auto pr-0.5">
          {report && !report.noProject && findings.length === 0 && !loading && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="ShieldCheck" size={15} /> No behavioral-risk signals found.
              </p>
              <p className="mt-1 text-emerald-200/70">
                Absence of a signal is not proof of safety — still test auth and object-level
                authorization with the behavioral prompts in the Prompt Library.
              </p>
            </div>
          )}
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} onCopy={onCopyOutcome} />
          ))}
        </div>

        <PasteScanner onCopy={onCopyOutcome} />
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-vibe-border p-3">
        <button
          type="button"
          onClick={() => void window.vibebar.audit.scan()}
          title="Open the Smart Terminal and present findings. While it's open, every scan (including auto-scan) mirrors there live."
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-vibe-muted hover:text-vibe-text"
        >
          <Icon name="SquareTerminal" size={14} /> Open in Smart Terminal
        </button>
        <div className="flex-1" />
        {findings.length > 0 && report && (
          <button
            type="button"
            onClick={() => void copy(buildConsolidatedPrompt(report))}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text hover:bg-white/15"
          >
            <Icon name="Copy" size={14} /> Copy all as one prompt
          </button>
        )}
      </div>
    </div>
  )
}
