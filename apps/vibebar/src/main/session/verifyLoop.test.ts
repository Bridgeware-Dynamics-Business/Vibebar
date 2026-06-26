import { describe, expect, it, vi } from 'vitest'
import { emptyProfile } from '@vibebar/project-detector'
import type { ProjectService } from '../project/ProjectService.js'
import type { SessionService } from './SessionService.js'
import { VerifyLoopService } from './VerifyLoopService.js'

function mockSession(entries: Awaited<ReturnType<SessionService['readExtended']>>['entries'] = []) {
  return {
    readExtended: async () => ({ entries, intent: null }),
    updateEntryVerify: vi.fn(async (_id, patch) => ({
      id: 'e1',
      type: 'terminal-issue' as const,
      title: 'Fix',
      issueId: 'i1',
      timestamp: Date.now(),
      pinned: true,
      ...patch
    }))
  } as unknown as SessionService
}

function mockProjects() {
  return {
    getProfile: () => emptyProfile('/tmp/proj', 'demo')
  } as ProjectService
}

describe('VerifyLoopService', () => {
  it('marks verified when parser sees clean exit 0 output', async () => {
    const session = mockSession([
      {
        id: 'e1',
        type: 'terminal-issue',
        title: 'Fix',
        issueId: 'i1',
        timestamp: 1,
        pinned: true,
        verifyCommand: 'npm test',
        verifyStatus: 'awaiting'
      }
    ])
    const svc = new VerifyLoopService(session, mockProjects())
    svc.markPending('e1', 'npm test')
    await svc.onCommandComplete('npm test', 0, 'Tests  5 passed', emptyProfile('/tmp', 'd'))

    expect(session.updateEntryVerify).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ verifyStatus: 'verified', lastVerifyOutputHash: expect.any(String) })
    )
  })

  it('marks still-broken when failure patterns appear with exit 0', async () => {
    const session = mockSession([
      {
        id: 'e1',
        type: 'terminal-issue',
        title: 'Fix',
        issueId: 'i1',
        timestamp: 1,
        pinned: true,
        verifyCommand: 'npm test',
        verifyStatus: 'awaiting'
      }
    ])
    const svc = new VerifyLoopService(session, mockProjects())
    await svc.onCommandComplete(
      'npm test',
      0,
      ' FAIL  src/a.test.ts > case\nAssertionError: nope',
      emptyProfile('/tmp', 'd')
    )

    expect(session.updateEntryVerify).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ verifyStatus: 'still-broken' })
    )
  })
})
