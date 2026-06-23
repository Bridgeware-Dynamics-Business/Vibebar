import type { AuditConfidence, AuditSeverity } from '@shared/types.js'
import { AUDIT_CONFIDENCE_STYLE, AUDIT_SEVERITY_STYLE } from '../auditUi'
import { Icon } from '../icons'

export type AuditGroupBy = 'none' | 'severity' | 'category' | 'file'

const SEVERITY_ORDER: AuditSeverity[] = ['critical', 'high', 'medium', 'low']
const CONFIDENCE_ORDER: AuditConfidence[] = ['high', 'medium', 'low']

export function AuditFindingFilters({
  query,
  onQueryChange,
  sevFilter,
  onSevFilterChange,
  confFilter,
  onConfFilterChange,
  onlyNew,
  onOnlyNewChange,
  groupBy,
  onGroupByChange,
  showNewFilter,
  compact
}: {
  query: string
  onQueryChange: (q: string) => void
  sevFilter: Set<AuditSeverity>
  onSevFilterChange: (next: Set<AuditSeverity>) => void
  confFilter: Set<AuditConfidence>
  onConfFilterChange: (next: Set<AuditConfidence>) => void
  onlyNew: boolean
  onOnlyNewChange: (v: boolean) => void
  groupBy: AuditGroupBy
  onGroupByChange: (g: AuditGroupBy) => void
  showNewFilter?: boolean
  compact?: boolean
}): JSX.Element {
  const textSize = compact ? 'text-[10px]' : 'text-xs'
  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  return (
    <div className={`space-y-2 ${compact ? 'px-3 py-2' : 'rounded-xl border border-vibe-border bg-white/[0.02] p-3'} ${textSize}`}>
      <div className="flex items-center gap-2">
        <Icon name="Search" size={compact ? 12 : 13} className="text-vibe-muted" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search title, file, CWE…"
          className="vibe-no-drag flex-1 rounded-md border border-vibe-border bg-black/30 px-2 py-1 text-vibe-text outline-none focus:border-vibe-accent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase text-vibe-muted/70">Severity</span>
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => onSevFilterChange(toggleIn(sevFilter, sev))}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              sevFilter.has(sev) ? AUDIT_SEVERITY_STYLE[sev].chip : 'bg-white/5 text-vibe-muted hover:bg-white/10'
            }`}
          >
            {AUDIT_SEVERITY_STYLE[sev].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase text-vibe-muted/70">Confidence</span>
        {CONFIDENCE_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onConfFilterChange(toggleIn(confFilter, c))}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              confFilter.has(c) ? AUDIT_CONFIDENCE_STYLE[c].chip : 'bg-white/5 text-vibe-muted hover:bg-white/10'
            }`}
          >
            {c}
          </button>
        ))}
        {showNewFilter && (
          <button
            type="button"
            onClick={() => onOnlyNewChange(!onlyNew)}
            className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              onlyNew ? 'bg-vibe-accent/20 text-vibe-accent-2' : 'bg-white/5 text-vibe-muted hover:bg-white/10'
            }`}
          >
            new only
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] uppercase text-vibe-muted/70">
          <Icon name="Layers" size={11} /> Group
        </span>
        {(['none', 'severity', 'category', 'file'] as AuditGroupBy[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGroupByChange(g)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              groupBy === g ? 'bg-vibe-accent text-white' : 'bg-white/5 text-vibe-muted hover:bg-white/10'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  )
}
