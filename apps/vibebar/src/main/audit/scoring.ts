import type { AuditFinding, AuditScore } from '@shared/types.js'

/**
 * Weighted posture score. We start at 100 and subtract per finding, weighting by severity and by
 * confidence (a low-confidence heuristic costs less than a taint-confirmed critical). The score is
 * clamped to [0, 100] and mapped to a letter grade. This is intentionally simple and monotonic:
 * adding a finding can never raise the score, and fixing one can never lower it.
 */
const SEVERITY_WEIGHT: Record<AuditFinding['severity'], number> = {
  critical: 28,
  high: 16,
  medium: 7,
  low: 2
}

const CONFIDENCE_FACTOR: Record<AuditFinding['confidence'], number> = {
  high: 1,
  medium: 0.7,
  low: 0.4
}

function gradeFor(value: number): AuditScore['grade'] {
  if (value >= 90) return 'A'
  if (value >= 75) return 'B'
  if (value >= 60) return 'C'
  if (value >= 40) return 'D'
  return 'F'
}

export function computeScore(findings: AuditFinding[]): AuditScore {
  let penalty = 0
  for (const f of findings) {
    penalty += SEVERITY_WEIGHT[f.severity] * CONFIDENCE_FACTOR[f.confidence]
  }
  const value = Math.max(0, Math.min(100, Math.round(100 - penalty)))
  return { value, grade: gradeFor(value) }
}
