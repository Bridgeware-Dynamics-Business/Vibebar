import type { AuditFinding, AuditReport, AuditSeverity } from '@shared/types.js'

/** A human-readable Markdown report — good for pasting into a PR description or an issue. */

const SEVERITY_ORDER: AuditSeverity[] = ['critical', 'high', 'medium', 'low']
const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
}

function severityBreakdown(findings: AuditFinding[]): string {
  const counts = SEVERITY_ORDER.map((s) => ({ s, n: findings.filter((f) => f.severity === s).length })).filter(
    (c) => c.n > 0
  )
  if (counts.length === 0) return 'No findings.'
  return counts.map((c) => `${SEVERITY_LABEL[c.s]}: ${c.n}`).join(' · ')
}

export function toMarkdown(report: AuditReport): string {
  const lines: string[] = []
  const grade = report.score ? `${report.score.grade} (${report.score.value}/100)` : 'n/a'
  lines.push(`# Security Audit — ${report.projectName ?? 'project'}`)
  lines.push('')
  lines.push(`- **Posture grade:** ${grade}`)
  lines.push(`- **Findings:** ${report.findings.length} (${severityBreakdown(report.findings)})`)
  lines.push(`- **Scanned files:** ${report.scannedFiles}${report.truncated ? ' (truncated)' : ''}`)
  if (report.delta) {
    lines.push(`- **Since last scan:** ${report.delta.new} new · ${report.delta.resolved} resolved`)
  }
  lines.push(`- **Generated:** ${new Date(report.ranAt).toISOString()}`)
  lines.push('')

  if (report.findings.length === 0) {
    lines.push('No behavioral-risk signals were found. Absence of a signal is not proof of safety.')
    return lines.join('\n')
  }

  lines.push('## Findings')
  report.findings.forEach((f, i) => {
    lines.push('')
    lines.push(`### ${i + 1}. [${SEVERITY_LABEL[f.severity]}] ${f.title}`)
    lines.push('')
    lines.push(`- **Category:** ${f.category}`)
    lines.push(`- **Confidence:** ${f.confidence}`)
    if (f.cwe) lines.push(`- **Weakness:** ${f.cwe}`)
    if (f.references && f.references.length > 0) lines.push(`- **Standards:** ${f.references.join('; ')}`)
    if (f.file) lines.push(`- **Location:** \`${f.file}${f.line ? `:${f.line}` : ''}\``)
    if (f.status) lines.push(`- **Status:** ${f.status}`)
    lines.push('')
    lines.push(f.detail)
    if (f.codeContext) {
      lines.push('')
      lines.push('```')
      lines.push(f.codeContext)
      lines.push('```')
    }
    lines.push('')
    lines.push('<details><summary>Copy-paste fix prompt</summary>')
    lines.push('')
    lines.push('```text')
    lines.push(f.fixPrompt)
    lines.push('```')
    lines.push('')
    lines.push('</details>')
  })

  return lines.join('\n')
}
