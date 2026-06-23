import type { AuditFinding, AuditReport } from '@shared/types.js'

/** Builds one consolidated prompt covering the given findings, ready to paste. */
export function buildAuditPromptFor(
  findings: AuditFinding[],
  report: AuditReport,
  scopeLabel: string
): string {
  const lines: string[] = [
    `You are a senior application-security engineer. VibeBar ran a read-only static audit of ${report.projectName ?? 'my project'} and found ${findings.length} issue(s)${scopeLabel ? ` ${scopeLabel}` : ''} across ${report.scannedFiles} scanned files.`,
    '',
    'Each finding below includes its severity, confidence, the mapped CWE/OWASP entry, the exact file and line, and a code frame. Work through them strictly in severity order (critical first). For each one: confirm it is real, explain the concrete attack it enables, apply the minimal fix without weakening any other control, and then describe a behavioral test that fails before the fix and passes after.',
    '',
    'Do not print any secret values, environment variables, or full file paths back to me. Keep each change scoped to its single finding.',
    '',
    '==================== FINDINGS ===================='
  ]
  findings.forEach((f, i) => {
    lines.push('')
    lines.push(`#${i + 1} [${f.severity.toUpperCase()}] (confidence: ${f.confidence}) ${f.title}`)
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
