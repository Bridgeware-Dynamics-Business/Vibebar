import { describe, expect, it } from 'vitest'
import { findUnpinnedNpmInstalls, scanAiOutputRisks } from './aiOutputRiskScanner.js'

describe('scanAiOutputRisks', () => {
  it('flags dangerous CLI flags and elevated privilege hints', () => {
    const text = 'Run: git push --force\nThen sudo rm -rf /tmp/foo'
    const risks = scanAiOutputRisks(text)
    expect(risks.some((r) => r.kind === 'Force flag' && r.severity === 'error')).toBe(true)
    expect(risks.some((r) => r.kind === 'Elevated privileges')).toBe(true)
  })

  it('flags legacy peer deps', () => {
    const risks = scanAiOutputRisks('npm install --legacy-peer-deps')
    expect(risks.some((r) => r.kind === 'Legacy peer deps')).toBe(true)
  })

  it('flags skipped tests and quality suppressions', () => {
    const text = `
      it.skip('should work', () => {})
      // @ts-ignore
      const x: any = 1
      eslint-disable-next-line no-console
    `
    const risks = scanAiOutputRisks(text)
    expect(risks.some((r) => r.kind === 'Skipped test')).toBe(true)
    expect(risks.some((r) => r.kind === 'TS suppress')).toBe(true)
    expect(risks.some((r) => r.kind === 'TypeScript any')).toBe(true)
    expect(risks.some((r) => r.kind === 'ESLint disable')).toBe(true)
  })

  it('flags test file removal commands', () => {
    const risks = scanAiOutputRisks('rm src/foo.test.ts')
    expect(risks.some((r) => r.kind === 'Test file removal')).toBe(true)
  })
})

describe('findUnpinnedNpmInstalls', () => {
  it('flags npm install without version pin', () => {
    const risks = findUnpinnedNpmInstalls('npm install lodash')
    expect(risks).toHaveLength(1)
    expect(risks[0]?.match).toBe('lodash')
  })

  it('allows pinned installs', () => {
    const risks = findUnpinnedNpmInstalls('npm install lodash@4.17.21')
    expect(risks).toHaveLength(0)
  })

  it('flags dev dependency installs without pin', () => {
    const risks = findUnpinnedNpmInstalls('npm install -D vitest')
    expect(risks.some((r) => r.match === 'vitest')).toBe(true)
  })
})
