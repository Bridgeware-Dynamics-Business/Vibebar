import { describe, expect, it } from 'vitest'
import type { AuditConfidence, AuditFinding, AuditSeverity } from '@shared/types.js'
import { computeScore } from './scoring.js'

function finding(severity: AuditSeverity, confidence: AuditConfidence = 'high'): AuditFinding {
  return {
    id: `f-${Math.random()}`,
    category: 'Config',
    severity,
    confidence,
    title: 't',
    detail: 'd',
    fingerprint: Math.random().toString(36).slice(2),
    fixPrompt: 'fix',
    testPrompt: 'test'
  }
}

describe('computeScore', () => {
  it('gives a perfect score and grade A for no findings', () => {
    const s = computeScore([])
    expect(s.value).toBe(100)
    expect(s.grade).toBe('A')
  })

  it('is monotonic: adding a finding never raises the score', () => {
    const base = computeScore([finding('low')])
    const more = computeScore([finding('low'), finding('critical')])
    expect(more.value).toBeLessThanOrEqual(base.value)
  })

  it('weights critical-high much more than low-confidence low', () => {
    const harsh = computeScore([finding('critical', 'high')])
    const gentle = computeScore([finding('low', 'low')])
    expect(harsh.value).toBeLessThan(gentle.value)
  })

  it('clamps to zero and grades F for many criticals', () => {
    const s = computeScore(Array.from({ length: 10 }, () => finding('critical', 'high')))
    expect(s.value).toBe(0)
    expect(s.grade).toBe('F')
  })

  it('downweights low-confidence findings', () => {
    const high = computeScore([finding('high', 'high')])
    const low = computeScore([finding('high', 'low')])
    expect(low.value).toBeGreaterThan(high.value)
  })
})
