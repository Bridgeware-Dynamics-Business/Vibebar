import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import type { AuditFinding } from '@shared/types.js'
import { AUDIT_CONFIDENCE_STYLE, AUDIT_SEVERITY_STYLE } from '../auditUi'
import { Icon } from '../icons'
import { buildNoteBullet, SaveToNotePicker } from '../saveToNote'

type CopyOutcome = (copied: boolean, text: string) => void

export function AuditFindingCard({
  finding,
  onCopy,
  onAcceptRisk
}: {
  finding: AuditFinding
  onCopy: CopyOutcome
  onAcceptRisk?: (fingerprint: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<'fix' | 'test' | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const s = AUDIT_SEVERITY_STYLE[finding.severity]
  const conf = AUDIT_CONFIDENCE_STYLE[finding.confidence]

  const doCopy = useCallback(
    async (which: 'fix' | 'test') => {
      const text = which === 'fix' ? finding.fixPrompt : finding.testPrompt
      const r = await window.vibebar.clipboard.write(text)
      onCopy(r.copied, text)
      if (r.copied) {
        if (which === 'fix') {
          void window.vibebar.session.append({
            type: 'audit-finding',
            title: finding.title,
            fingerprint: finding.fingerprint,
            severity: finding.severity,
            file: finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : undefined,
            fixExcerpt: finding.fixPrompt.slice(0, 400),
            fullText: finding.fixPrompt
          })
        } else {
          void window.vibebar.session.append({
            type: 'audit-finding',
            title: `${finding.title} (behavioral test)`,
            fingerprint: `${finding.fingerprint}:test`,
            severity: finding.severity,
            file: finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : undefined,
            fixExcerpt: finding.testPrompt.slice(0, 400),
            fullText: finding.testPrompt
          })
        }
        setCopied(which)
        window.setTimeout(() => setCopied(null), 1600)
      }
    },
    [finding, onCopy]
  )

  const noteMarkdown = buildNoteBullet({
    title: finding.title,
    fileLine: finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : undefined,
    excerpt: finding.fixPrompt.slice(0, 400)
  })

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
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.chip}`} title={conf.title}>
              {conf.label}
            </span>
            {finding.status === 'new' && (
              <span className="rounded-full bg-vibe-accent/20 px-2 py-0.5 text-[10px] font-semibold text-vibe-accent-2">
                new
              </span>
            )}
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
              {(finding.cwe || (finding.references && finding.references.length > 0)) && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {finding.cwe && (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-vibe-text">
                      {finding.cwe}
                    </span>
                  )}
                  {finding.references?.map((ref) => (
                    <span key={ref} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-vibe-muted">
                      {ref}
                    </span>
                  ))}
                </div>
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
                {onAcceptRisk && (
                  <button
                    type="button"
                    onClick={() => onAcceptRisk(finding.fingerprint)}
                    title="Add to accepted-risk baseline (.vibebar-audit.json)"
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-vibe-muted transition-colors hover:bg-white/10 hover:text-vibe-text"
                  >
                    <Icon name="ShieldOff" size={14} />
                    Accept risk
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-vibe-muted transition-colors hover:bg-white/10 hover:text-vibe-text"
                >
                  <Icon name="StickyNote" size={14} />
                  Save to note
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <SaveToNotePicker open={saveOpen} onClose={() => setSaveOpen(false)} markdown={noteMarkdown} />
    </div>
  )
}
