import type { AuditConfidence, AuditScore, AuditSeverity } from '@shared/types.js'

export const AUDIT_SEVERITY_STYLE: Record<
  AuditSeverity,
  { text: string; chip: string; dot: string; label: string }
> = {
  critical: { text: 'text-red-300', chip: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Critical' },
  high: { text: 'text-orange-300', chip: 'bg-orange-500/15 text-orange-300', dot: 'bg-orange-400', label: 'High' },
  medium: { text: 'text-amber-200', chip: 'bg-amber-500/10 text-amber-200', dot: 'bg-amber-300', label: 'Medium' },
  low: { text: 'text-sky-200', chip: 'bg-sky-500/10 text-sky-200', dot: 'bg-sky-300', label: 'Low' }
}

export const AUDIT_CONFIDENCE_STYLE: Record<AuditConfidence, { chip: string; label: string; title: string }> = {
  high: { chip: 'bg-emerald-500/15 text-emerald-300', label: 'high', title: 'Taint/data-flow confirmed' },
  medium: { chip: 'bg-white/10 text-vibe-muted', label: 'medium', title: 'Strong structural match' },
  low: { chip: 'bg-white/5 text-vibe-muted/80', label: 'low', title: 'Heuristic — worth a look' }
}

export const AUDIT_GRADE_COLOR: Record<AuditScore['grade'], string> = {
  A: 'text-emerald-400',
  B: 'text-lime-400',
  C: 'text-amber-300',
  D: 'text-orange-400',
  F: 'text-red-400'
}

const AUDIT_GRADE_STROKE: Record<AuditScore['grade'], string> = {
  A: '#34d399',
  B: '#a3e635',
  C: '#fcd34d',
  D: '#fb923c',
  F: '#f87171'
}

/** Compact SVG ring showing the posture score, colored by grade. */
export function AuditScoreRing({ score }: { score: AuditScore }): JSX.Element {
  const r = 22
  const circ = 2 * Math.PI * r
  const dash = (score.value / 100) * circ
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center" title={`Posture score ${score.value}/100`}>
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={AUDIT_GRADE_STROKE[score.grade]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      </svg>
      <span className={`absolute text-lg font-bold ${AUDIT_GRADE_COLOR[score.grade]}`}>{score.grade}</span>
    </div>
  )
}
