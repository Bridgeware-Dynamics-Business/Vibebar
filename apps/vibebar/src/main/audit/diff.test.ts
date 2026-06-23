import { describe, expect, it } from 'vitest'
import type { AuditFinding } from '@shared/types.js'
import { diffFindings } from './diff.js'

function finding(fingerprint: string): AuditFinding {
  return {
    id: `id-${fingerprint}`,
    category: 'Config',
    severity: 'medium',
    confidence: 'medium',
    title: 't',
    detail: 'd',
    fingerprint,
    fixPrompt: 'fix',
    testPrompt: 'test'
  }
}

describe('diffFindings', () => {
  it('marks all findings as new on the first run', () => {
    const current = [finding('a'), finding('b')]
    const delta = diffFindings(current, [])
    expect(delta).toEqual({ new: 2, resolved: 0, existing: 0 })
    expect(current.every((f) => f.status === 'new')).toBe(true)
  })

  it('classifies carried-over vs new vs resolved', () => {
    const current = [finding('a'), finding('c')]
    const delta = diffFindings(current, ['a', 'b'])
    // a = existing, c = new, b = resolved
    expect(delta).toEqual({ new: 1, resolved: 1, existing: 1 })
    expect(current.find((f) => f.fingerprint === 'a')?.status).toBe('existing')
    expect(current.find((f) => f.fingerprint === 'c')?.status).toBe('new')
  })

  it('reports everything resolved when nothing remains', () => {
    const delta = diffFindings([], ['a', 'b', 'c'])
    expect(delta).toEqual({ new: 0, resolved: 3, existing: 0 })
  })
})
