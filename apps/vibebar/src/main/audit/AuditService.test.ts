import { describe, expect, it } from 'vitest'
import { AuditService } from './AuditService.js'
import type { ProjectService } from '../project/ProjectService.js'

const noProject = { getProfile: () => null } as unknown as ProjectService

describe('AuditService.run', () => {
  it('coalesces concurrent runs into a single in-flight scan', async () => {
    const svc = new AuditService(noProject)
    const a = svc.run()
    const b = svc.run()
    // Both callers share the same in-flight promise while a scan is running.
    expect(a).toBe(b)
    await Promise.all([a, b])
    // Once it settles, a fresh call starts a new scan.
    const c = svc.run()
    expect(c).not.toBe(a)
    await c
  })

  it('returns a noProject report when no project is selected', async () => {
    const report = await new AuditService(noProject).run()
    expect(report.noProject).toBe(true)
    expect(report.findings).toHaveLength(0)
  })
})
