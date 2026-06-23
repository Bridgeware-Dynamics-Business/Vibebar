import { useCallback, useState } from 'react'
import type { AuditFinding, AuditReport } from '@shared/types.js'
import { Icon } from '../icons'
import { AuditFindingCard } from './AuditFindingCard'
import { buildAuditPromptFor } from './buildAuditPrompt'

type CopyOutcome = (copied: boolean, text: string) => void

export function AuditFindingGroup({
  label,
  sublabel,
  findings,
  report,
  onCopy,
  scopeLabel,
  onAcceptRisk
}: {
  label: string
  sublabel?: string
  findings: AuditFinding[]
  report: AuditReport
  onCopy: CopyOutcome
  scopeLabel: string
  onAcceptRisk?: (fingerprint: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const copyGroup = useCallback(async () => {
    const text = buildAuditPromptFor(findings, report, scopeLabel)
    const r = await window.vibebar.clipboard.write(text)
    onCopy(r.copied, text)
  }, [findings, report, onCopy, scopeLabel])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-vibe-muted"
        >
          <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={13} />
          <span className="truncate text-vibe-text">{label}</span>
          {sublabel && <span className="font-mono text-[10px] text-vibe-muted/70">{sublabel}</span>}
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px]">{findings.length}</span>
        </button>
        {findings.length > 1 && (
          <button
            type="button"
            onClick={() => void copyGroup()}
            title="Copy one prompt that fixes every finding in this group"
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="Copy" size={11} /> Fix all
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          {findings.map((f) => (
            <AuditFindingCard key={f.id} finding={f} onCopy={onCopy} onAcceptRisk={onAcceptRisk} />
          ))}
        </div>
      )}
    </div>
  )
}
