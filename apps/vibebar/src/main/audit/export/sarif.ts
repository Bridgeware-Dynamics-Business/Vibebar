import type { AuditFinding, AuditReport, AuditSeverity } from '@shared/types.js'

/**
 * Emits SARIF 2.1.0 — the OASIS-standard static-analysis interchange format. The output imports
 * cleanly into GitHub code scanning and other SARIF viewers, so a VibeBar audit can become a CI
 * gate. We map severity to SARIF `level`, attach the CWE + our security score, and use the finding's
 * stable fingerprint as a `partialFingerprint` so a viewer can track a finding across runs.
 */

const LEVEL: Record<AuditSeverity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note'
}

/** GitHub code scanning reads this 0-10 number to bucket alerts; map our severities onto it. */
const SECURITY_SEVERITY: Record<AuditSeverity, string> = {
  critical: '9.5',
  high: '8.0',
  medium: '5.0',
  low: '2.0'
}

/** Recovers the registry rule id from a finding id (`<ruleId>-<path>` for file findings). */
export function baseRuleId(finding: AuditFinding): string {
  if (finding.file && finding.id.endsWith(`-${finding.file}`)) {
    return finding.id.slice(0, finding.id.length - finding.file.length - 1)
  }
  return finding.id
}

export function toSarif(report: AuditReport): string {
  const ruleIds = new Map<string, AuditFinding>()
  for (const f of report.findings) {
    const id = baseRuleId(f)
    if (!ruleIds.has(id)) ruleIds.set(id, f)
  }

  const rules = [...ruleIds.entries()].map(([id, f]) => ({
    id,
    name: f.title.replace(/\s+/g, ''),
    shortDescription: { text: f.title },
    fullDescription: { text: f.detail },
    defaultConfiguration: { level: LEVEL[f.severity] },
    properties: {
      category: f.category,
      ...(f.cwe ? { tags: [f.cwe.split(' ')[0]] } : {}),
      'security-severity': SECURITY_SEVERITY[f.severity]
    }
  }))

  const results = report.findings.map((f) => ({
    ruleId: baseRuleId(f),
    level: LEVEL[f.severity],
    message: { text: `${f.title} — ${f.detail}` },
    partialFingerprints: { vibebarFingerprint: f.fingerprint },
    properties: {
      confidence: f.confidence,
      severity: f.severity,
      ...(f.cwe ? { cwe: f.cwe } : {}),
      ...(f.status ? { status: f.status } : {})
    },
    locations: f.file
      ? [
          {
            physicalLocation: {
              artifactLocation: { uri: f.file },
              ...(f.line
                ? { region: { startLine: f.line, ...(f.column ? { startColumn: f.column } : {}) } }
                : {})
            }
          }
        ]
      : []
  }))

  const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'VibeBar Security Audit',
            informationUri: 'https://vibebar.app',
            version: '2.0.0',
            rules
          }
        },
        properties: {
          score: report.score?.value,
          grade: report.score?.grade,
          scannedFiles: report.scannedFiles,
          ranAt: new Date(report.ranAt).toISOString()
        },
        results
      }
    ]
  }

  return JSON.stringify(sarif, null, 2)
}
