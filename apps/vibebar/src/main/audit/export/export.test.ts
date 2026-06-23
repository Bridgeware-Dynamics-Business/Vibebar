import { describe, expect, it } from 'vitest'
import type { AuditReport } from '@shared/types.js'
import { type AuditContext, type AuditRuleInput, runAuditRules } from '../auditRules.js'
import { computeScore } from '../scoring.js'
import { baseRuleId, toSarif } from './sarif.js'
import { toMarkdown } from './markdown.js'

const ctx: AuditContext = {
  label: 'my Next.js project (TypeScript)',
  framework: 'Next.js',
  language: 'TypeScript',
  testRunner: 'Playwright'
}

function buildReport(): AuditReport {
  const input: AuditRuleInput = {
    ctx,
    packageJson: { dependencies: { express: '^4.19.0' } },
    hasLockfile: true,
    files: [
      { path: 'src/api/proxy.ts', content: 'function h(req, res){ return fetch(req.query.url) }' },
      { path: 'src/util.ts', content: "import crypto from 'crypto'\nconst h = crypto.createHash('md5')" }
    ]
  }
  const findings = runAuditRules(input)
  return {
    ranAt: Date.now(),
    projectName: 'demo',
    scannedFiles: 2,
    totalCandidates: 2,
    truncated: false,
    findings,
    noProject: false,
    score: computeScore(findings)
  }
}

describe('SARIF export', () => {
  it('produces valid SARIF 2.1.0 with rules and results', () => {
    const report = buildReport()
    const sarif = JSON.parse(toSarif(report))
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs).toHaveLength(1)
    const run = sarif.runs[0]
    expect(run.tool.driver.name).toBe('VibeBar Security Audit')
    expect(Array.isArray(run.tool.driver.rules)).toBe(true)
    expect(run.results.length).toBe(report.findings.length)
    for (const result of run.results) {
      expect(['error', 'warning', 'note']).toContain(result.level)
      expect(result.ruleId).toBeTruthy()
      expect(result.partialFingerprints.vibebarFingerprint).toBeTruthy()
    }
  })

  it('recovers the base rule id from a file-anchored finding id', () => {
    expect(
      baseRuleId({
        id: 'ssrf-src/api/proxy.ts',
        file: 'src/api/proxy.ts',
        category: 'Access Control',
        severity: 'high',
        confidence: 'high',
        title: 't',
        detail: 'd',
        fingerprint: 'x',
        fixPrompt: '',
        testPrompt: ''
      })
    ).toBe('ssrf')
  })
})

describe('Markdown export', () => {
  it('renders a grade header and a section per finding', () => {
    const report = buildReport()
    const md = toMarkdown(report)
    expect(md).toContain('# Security Audit — demo')
    expect(md).toContain('Posture grade:')
    expect(md).toContain('Copy-paste fix prompt')
    for (const f of report.findings) {
      expect(md).toContain(f.title)
    }
  })

  it('handles an empty report gracefully', () => {
    const md = toMarkdown({
      ranAt: Date.now(),
      projectName: 'empty',
      scannedFiles: 0,
      totalCandidates: 0,
      truncated: false,
      findings: [],
      noProject: false,
      score: { value: 100, grade: 'A' }
    })
    expect(md).toContain('No behavioral-risk signals')
  })
})
