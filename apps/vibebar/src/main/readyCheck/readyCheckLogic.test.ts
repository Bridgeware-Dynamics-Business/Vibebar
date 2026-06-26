import { describe, expect, it } from 'vitest'
import {
  AUDIT_RECENT_MS,
  buildReadyCheckBrief,
  buildSignals,
  computeReadyCheckStatus,
  computeV2Flags,
  countDiffLines,
  filterLockfilePaths,
  hasGitDiffReviewedSince,
  inferLastFileChangeTimestamp,
  isJsTsSourcePath,
  isLockfilePath,
  isTestFixturePath,
  npmAuditRanSince,
  testsPassedSince,
  type ReadyCheckFlags
} from './readyCheckLogic.js'
import { refreshLastGreenDelta } from '../session/flightRecorderLogic.js'

function baseFlags(overrides: Partial<ReadyCheckFlags> = {}): ReadyCheckFlags {
  return {
    criticalAudit: false,
    highAudit: false,
    auditTruncated: false,
    auditRecent: false,
    secretsInDiff: false,
    untrackedSecrets: false,
    terminalFailed: false,
    terminalUnresolvedIssues: false,
    largeDiff: false,
    untrackedOnly: false,
    packageJsonChanged: false,
    stackUnknown: false,
    subfolderNotRoot: false,
    jsTsSourcesChanged: false,
    testsNotRunSinceChange: false,
    diffNotReviewed: false,
    lockfileChangedWithoutNpmAudit: false,
    auditDeltaRegressed: false,
    lastGreenStale: false,
    ...overrides
  }
}

describe('computeReadyCheckStatus', () => {
  it('returns blocked when critical audit finding is open', () => {
    expect(computeReadyCheckStatus(baseFlags({ criticalAudit: true }))).toBe('blocked')
  })

  it('returns blocked when secrets appear in untracked files', () => {
    expect(computeReadyCheckStatus(baseFlags({ untrackedSecrets: true }))).toBe('blocked')
  })

  it('returns blocked when secrets appear in the diff', () => {
    expect(computeReadyCheckStatus(baseFlags({ secretsInDiff: true }))).toBe('blocked')
  })

  it('returns blocked when the last terminal command failed', () => {
    expect(computeReadyCheckStatus(baseFlags({ terminalFailed: true }))).toBe('blocked')
  })

  it('blocked takes precedence over needs-review signals', () => {
    expect(
      computeReadyCheckStatus(
        baseFlags({ terminalFailed: true, highAudit: true, largeDiff: true })
      )
    ).toBe('blocked')
  })

  it('returns needs-review for high audit findings', () => {
    expect(computeReadyCheckStatus(baseFlags({ highAudit: true }))).toBe('needs-review')
  })

  it('returns needs-review for v2 last-green stale signal', () => {
    expect(computeReadyCheckStatus(baseFlags({ lastGreenStale: true }))).toBe('needs-review')
  })

  it('returns needs-review when diff was not reviewed this session', () => {
    expect(computeReadyCheckStatus(baseFlags({ diffNotReviewed: true }))).toBe('needs-review')
  })

  it('returns needs-review when lockfile changed without npm audit', () => {
    expect(
      computeReadyCheckStatus(baseFlags({ lockfileChangedWithoutNpmAudit: true }))
    ).toBe('needs-review')
  })

  it('returns needs-review when audit delta regressed', () => {
    expect(computeReadyCheckStatus(baseFlags({ auditDeltaRegressed: true }))).toBe('needs-review')
  })

  it('returns needs-review when tests not run since change', () => {
    expect(computeReadyCheckStatus(baseFlags({ testsNotRunSinceChange: true }))).toBe(
      'needs-review'
    )
  })

  it('returns looks-ready on a clean green path', () => {
    expect(
      computeReadyCheckStatus(
        baseFlags({ auditRecent: true, jsTsSourcesChanged: false })
      )
    ).toBe('looks-ready')
  })
})

describe('computeV2Flags', () => {
  const baseTime = 1_700_000_000_000

  it('flags last green stale when files changed since green run', () => {
    const flags = computeV2Flags({
      changedPaths: ['src/a.ts', 'src/b.ts'],
      sessionEntries: [],
      flight: {
        commands: [],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: {
          command: 'npm test',
          timestamp: baseTime - 60_000,
          filesChangedSince: ['src/b.ts']
        }
      }
    })
    expect(flags.lastGreenStale).toBe(true)
    expect(flags.testsNotRunSinceChange).toBe(true)
  })

  it('flags last green stale after refreshLastGreenDelta with live paths', () => {
    const lastGreen = refreshLastGreenDelta(
      {
        command: 'npm test',
        timestamp: baseTime,
        filesAtGreen: ['src/a.ts'],
        filesChangedSince: []
      },
      ['src/a.ts', 'src/new.ts']
    )
    const flags = computeV2Flags({
      changedPaths: ['src/a.ts', 'src/new.ts'],
      sessionEntries: [],
      flight: {
        commands: [],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen
      }
    })
    expect(flags.lastGreenStale).toBe(true)
  })

  it('flags diff not reviewed when no git-diff session entry since snapshot', () => {
    const flags = computeV2Flags({
      changedPaths: ['src/a.ts'],
      sessionEntries: [{ type: 'prompt', timestamp: baseTime - 10_000 }],
      flight: {
        commands: [],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: null
      }
    })
    expect(flags.diffNotReviewed).toBe(true)
  })

  it('clears diff not reviewed when git-diff copied after snapshot', () => {
    const flags = computeV2Flags({
      changedPaths: ['src/a.ts'],
      sessionEntries: [{ type: 'git-diff', timestamp: baseTime + 1 }],
      flight: {
        commands: [],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: null
      }
    })
    expect(flags.diffNotReviewed).toBe(false)
  })

  it('flags lockfile change without npm audit since snapshot', () => {
    const flags = computeV2Flags({
      changedPaths: ['package-lock.json'],
      sessionEntries: [],
      flight: {
        commands: [{ command: 'git status', exitCode: 0, timestamp: baseTime + 1 }],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: null
      }
    })
    expect(flags.lockfileChangedWithoutNpmAudit).toBe(true)
  })

  it('clears lockfile flag when npm audit ran after snapshot', () => {
    const flags = computeV2Flags({
      changedPaths: ['pnpm-lock.yaml'],
      sessionEntries: [],
      flight: {
        commands: [{ command: 'npm audit', exitCode: 0, timestamp: baseTime + 5 }],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: null
      }
    })
    expect(flags.lockfileChangedWithoutNpmAudit).toBe(false)
  })

  it('flags audit delta when finding count increased since first session audit', () => {
    const flags = computeV2Flags({
      changedPaths: [],
      sessionEntries: [],
      flight: {
        commands: [],
        audits: [{ ranAt: baseTime, score: 90, findingCount: 2 }],
        snapshots: [],
        lastGreen: null
      },
      currentAuditScore: 88,
      currentAuditFindingCount: 5
    })
    expect(flags.auditDeltaRegressed).toBe(true)
  })

  it('flags tests not run when changes exist but no passing verify command', () => {
    const flags = computeV2Flags({
      changedPaths: ['src/a.ts'],
      sessionEntries: [],
      flight: {
        commands: [{ command: 'npm test', exitCode: 1, timestamp: baseTime, isTest: true }],
        audits: [],
        snapshots: [{ timestamp: baseTime }],
        lastGreen: null
      }
    })
    expect(flags.testsNotRunSinceChange).toBe(true)
    expect(flags.lastGreenStale).toBe(false)
  })
})

describe('session helpers', () => {
  it('detects lockfile paths', () => {
    expect(isLockfilePath('package-lock.json')).toBe(true)
    expect(isLockfilePath('apps/web/package-lock.json')).toBe(true)
    expect(filterLockfilePaths(['src/a.ts', 'pnpm-lock.yaml'])).toEqual(['pnpm-lock.yaml'])
  })

  it('infers last file change from latest snapshot', () => {
    const ts = inferLastFileChangeTimestamp(
      {
        commands: [],
        audits: [],
        snapshots: [{ timestamp: 100 }, { timestamp: 200 }],
        lastGreen: null
      },
      ['a.ts']
    )
    expect(ts).toBe(200)
  })

  it('detects npm audit and passing tests since timestamp', () => {
    const flight = {
      commands: [
        { command: 'npm audit', exitCode: 0, timestamp: 150 },
        { command: 'npm test', exitCode: 0, timestamp: 160, isTest: true }
      ],
      audits: [{ ranAt: 140, findingCount: 0 }],
      snapshots: [],
      lastGreen: null
    }
    expect(npmAuditRanSince(flight, 100)).toBe(true)
    expect(testsPassedSince(flight, 155)).toBe(true)
    expect(hasGitDiffReviewedSince([{ type: 'git-diff', timestamp: 120 }], 100)).toBe(true)
  })
})

describe('countDiffLines', () => {
  it('counts combined staged and unstaged lines', () => {
    expect(countDiffLines('a\nb', 'c')).toBe(3)
  })
})

describe('isJsTsSourcePath', () => {
  it('matches common web source extensions', () => {
    expect(isJsTsSourcePath('src/App.tsx')).toBe(true)
    expect(isJsTsSourcePath('README.md')).toBe(false)
  })
})

describe('AUDIT_RECENT_MS', () => {
  it('defaults to 30 minutes', () => {
    expect(AUDIT_RECENT_MS).toBe(30 * 60 * 1000)
  })
})

describe('isTestFixturePath', () => {
  it('matches common test and spec file names', () => {
    expect(isTestFixturePath('src/foo.test.ts')).toBe(true)
    expect(isTestFixturePath('src/foo.spec.tsx')).toBe(true)
    expect(isTestFixturePath('src/foo.ts')).toBe(false)
    expect(isTestFixturePath('.env')).toBe(false)
  })
})

describe('buildSignals', () => {
  it('includes file paths in untracked-secrets detail for up to three files', () => {
    const signals = buildSignals(
      baseFlags({
        untrackedSecrets: true,
        untrackedSecretPaths: ['src/a.ts', 'src/b.ts']
      })
    )
    const secret = signals.find((s) => s.id === 'untracked-secrets')
    expect(secret?.level).toBe('blocked')
    expect(secret?.detail).toContain('`src/a.ts`')
    expect(secret?.detail).toContain('`src/b.ts`')
  })

  it('downgrades test fixture secret paths to warning', () => {
    const signals = buildSignals(
      baseFlags({
        untrackedTestSecretPaths: ['src/foo.test.ts']
      })
    )
    const secret = signals.find((s) => s.id === 'untracked-secrets')
    expect(secret?.level).toBe('warning')
    expect(secret?.detail).toContain('`src/foo.test.ts`')
  })
})

describe('buildReadyCheckBrief', () => {
  it('ranks blocked signals before warnings and caps at three', () => {
    const brief = buildReadyCheckBrief('blocked', [
      { id: 'git-diff', label: 'Large diff', level: 'warning', detail: 'big' },
      { id: 'secrets', label: 'Secrets', level: 'blocked', detail: 'leak' },
      { id: 'terminal', label: 'Terminal', level: 'blocked', detail: 'fail' },
      { id: 'audit', label: 'Audit', level: 'warning', detail: 'high' }
    ])
    expect(brief.topItems).toHaveLength(3)
    expect(brief.topItems[0]?.id).toBe('secrets')
    expect(brief.topItems.every((i) => i.nextAction.length > 0)).toBe(true)
  })

  it('omits ok signals from brief', () => {
    const brief = buildReadyCheckBrief('looks-ready', [
      { id: 'project', label: 'Project', level: 'ok', detail: 'fine' }
    ])
    expect(brief.topItems).toHaveLength(0)
  })
})
