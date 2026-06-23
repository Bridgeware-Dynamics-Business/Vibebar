import { describe, expect, it } from 'vitest'
import type { AuditFinding } from '@shared/types.js'
import { applyAuditConfig } from './auditConfig.js'

function finding(id: string, severity: AuditFinding['severity'], fingerprint = id): AuditFinding {
  return {
    id,
    category: 'Config',
    severity,
    confidence: 'medium',
    title: 't',
    detail: 'd',
    fingerprint,
    fixPrompt: 'fix',
    testPrompt: 'test'
  }
}

describe('applyAuditConfig', () => {
  const findings = [
    finding('ssrf-src/a.ts', 'high', 'fp1'),
    finding('xss-sink-src/b.tsx', 'high', 'fp2'),
    finding('unpinned-deps', 'low', 'fp3')
  ]

  it('drops disabled rules by base id', () => {
    const out = applyAuditConfig(findings, { disabledRules: ['ssrf'] })
    expect(out.some((f) => f.id.startsWith('ssrf'))).toBe(false)
    expect(out).toHaveLength(2)
  })

  it('applies severity overrides by rule id', () => {
    const out = applyAuditConfig(findings, { severityOverrides: { 'xss-sink': 'low' } })
    expect(out.find((f) => f.id.startsWith('xss-sink'))?.severity).toBe('low')
  })

  it('mutes findings whose fingerprint is in the baseline', () => {
    const out = applyAuditConfig(findings, { baseline: ['fp1', 'fp3'] })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('xss-sink-src/b.tsx')
  })

  it('filters out findings below minSeverity', () => {
    const out = applyAuditConfig(findings, { minSeverity: 'high' })
    expect(out.every((f) => f.severity === 'high')).toBe(true)
    expect(out).toHaveLength(2)
  })

  it('returns findings unchanged with an empty config', () => {
    expect(applyAuditConfig(findings, {})).toHaveLength(3)
  })
})
