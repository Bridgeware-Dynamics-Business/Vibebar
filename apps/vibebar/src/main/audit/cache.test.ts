import { describe, expect, it } from 'vitest'
import { type AuditContext, type AuditRuleInput, runAuditRulesWithStats } from './auditRules.js'
import { FileFindingsCache } from './cache.js'

const ctx: AuditContext = {
  label: 'my Next.js project (TypeScript)',
  framework: 'Next.js',
  language: 'TypeScript',
  testRunner: 'Playwright'
}

const baseInput: AuditRuleInput = {
  ctx,
  packageJson: { dependencies: { express: '^4.19.0' } },
  hasLockfile: true,
  files: [
    { path: 'src/api/proxy.ts', content: 'function h(req, res){ return fetch(req.query.url) }' },
    { path: 'src/util.ts', content: "import crypto from 'crypto'\nconst h = crypto.createHash('md5')" }
  ]
}

describe('incremental cache', () => {
  it('serves unchanged files from cache on the second run', () => {
    const cache = new FileFindingsCache()

    cache.beginScan()
    const first = runAuditRulesWithStats(baseInput, { cache })
    expect(first.cachedFiles).toBe(0)

    cache.beginScan()
    const second = runAuditRulesWithStats(baseInput, { cache })
    expect(second.cachedFiles).toBe(2)
    expect(second.findings.length).toBe(first.findings.length)
  })

  it('re-scans a file whose content changed', () => {
    const cache = new FileFindingsCache()
    cache.beginScan()
    runAuditRulesWithStats(baseInput, { cache })

    const changed: AuditRuleInput = {
      ...baseInput,
      files: [
        baseInput.files[0],
        { path: 'src/util.ts', content: "const ok = 'nothing to see'" }
      ]
    }
    cache.beginScan()
    const second = runAuditRulesWithStats(changed, { cache })
    // proxy.ts is unchanged (1 hit); util.ts changed (miss).
    expect(second.cachedFiles).toBe(1)
  })
})
