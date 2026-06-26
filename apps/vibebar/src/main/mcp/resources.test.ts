import { describe, expect, it } from 'vitest'
import type { AuditReport, ReadyCheckResult, SessionEntry } from '@shared/types.js'
import type { ProjectProfile } from '@vibebar/project-detector'
import {
  buildAuditSummaryResource,
  buildGitStatusResource,
  buildProjectProfileResource,
  buildReadyCheckSummaryResource,
  buildSessionPinsResource
} from './resources.js'
import { resolvePackCharBudget } from './tools.js'
import { MCP_DEFAULT_PACK_CHARS, MCP_MAX_PACK_CHARS } from './constants.js'

describe('buildSessionPinsResource', () => {
  it('includes pinned entries and handoff excerpt', () => {
    const pinned = [
      {
        id: 'a',
        type: 'prompt' as const,
        title: 'Fix bug',
        timestamp: 1,
        pinned: true,
        promptId: 'p1'
      }
    ] satisfies SessionEntry[]

    const payload = buildSessionPinsResource({
      projectName: 'demo',
      pinned,
      handoffExcerpt: '# Handoff\n'
    })

    expect(payload.project).toBe('demo')
    expect(payload.pinnedCount).toBe(1)
    expect(payload.pins).toHaveLength(1)
    expect(payload.handoffExcerpt).toContain('Handoff')
  })
})

describe('buildProjectProfileResource', () => {
  it('returns noProject when profile is null', () => {
    expect(buildProjectProfileResource(null)).toEqual({ noProject: true })
  })

  it('serializes stack fields', () => {
    const profile = {
      rootPath: '/repo',
      folderName: 'repo',
      language: 'typescript',
      framework: 'next',
      packageManager: 'npm',
      hasRootManifest: true,
      hasAiContextFolder: false,
      scripts: ['test']
    } as ProjectProfile

    const payload = buildProjectProfileResource(profile)
    expect(payload.framework).toBe('next')
    expect(payload.language).toBe('typescript')
  })
})

describe('buildAuditSummaryResource', () => {
  it('handles missing cached report', () => {
    const payload = buildAuditSummaryResource({ report: null })
    expect(payload.scanned).toBe(false)
    expect(payload.criticalCount).toBe(0)
  })

  it('counts severities and truncation', () => {
    const report = {
      ranAt: Date.now(),
      projectName: 'demo',
      scannedFiles: 10,
      totalCandidates: 20,
      truncated: true,
      findings: [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'low' }
      ],
      noProject: false
    } as AuditReport

    const payload = buildAuditSummaryResource({ report })
    expect(payload.criticalCount).toBe(1)
    expect(payload.highCount).toBe(1)
    expect(payload.truncated).toBe(true)
    expect(payload.openFindings).toBe(3)
  })
})

describe('buildGitStatusResource', () => {
  it('includes branch and changed paths', () => {
    const payload = buildGitStatusResource({
      status: {
        isRepo: true,
        branch: 'main',
        changeCount: 2,
        ahead: 0,
        behind: 0
      },
      changedPaths: ['src/a.ts', 'src/b.ts']
    })
    expect(payload.branch).toBe('main')
    expect(payload.changedPaths).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('buildReadyCheckSummaryResource', () => {
  it('maps tri-state and signals', () => {
    const result: ReadyCheckResult = {
      status: 'blocked',
      signals: [
        { id: 'terminal', label: 'Terminal', level: 'blocked', detail: 'Last run failed' }
      ]
    }
    const payload = buildReadyCheckSummaryResource(result)
    expect(payload.status).toBe('blocked')
    expect(payload.signals).toHaveLength(1)
  })
})

describe('resolvePackCharBudget', () => {
  it('defaults when maxTokens omitted', () => {
    expect(resolvePackCharBudget()).toBe(MCP_DEFAULT_PACK_CHARS)
  })

  it('caps at MCP_MAX_PACK_CHARS', () => {
    expect(resolvePackCharBudget(999_999)).toBe(MCP_MAX_PACK_CHARS)
  })

  it('converts tokens to chars', () => {
    expect(resolvePackCharBudget(1000)).toBe(4000)
  })
})
