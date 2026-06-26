import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyProfile } from '@vibebar/project-detector'
import type { ProjectProfile } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { SessionService, normalizeSessionEntries, SESSION_MAX_ENTRIES } from './SessionService.js'

function mockProjects(rootPath: string | null): ProjectService {
  const profile: ProjectProfile | null = rootPath
    ? emptyProfile(rootPath, 'test-project')
    : null
  return {
    getProfile: () => profile,
    getAiDocs: async () => ({ agentsMd: null, cursorRules: [], contextReadme: null })
  } as ProjectService
}

describe('SessionService', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('returns noProject when no active project', async () => {
    const svc = new SessionService(mockProjects(null))
    const state = await svc.getState()
    expect(state.noProject).toBe(true)
    expect(state.entries).toEqual([])
    expect(state.pinnedCount).toBe(0)
    expect(state.intent).toBeNull()
    expect(state.flight).toBeNull()
  })

  it('appends, pins, and clears entries in project-local session.json', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vibebar-session-'))
    const svc = new SessionService(mockProjects(dir))

    let state = await svc.append({ type: 'prompt', title: 'Fix auth', promptId: 'p1' })
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]?.type).toBe('prompt')

    const id = state.entries[0]!.id
    state = await svc.togglePin(id)
    expect(state.entries.find((e) => e.id === id)?.pinned).toBe(true)

    state = await svc.clear()
    expect(state.entries).toEqual([])

    const raw = await readFile(join(dir, '.vibebar', 'session.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ entries: [], intent: null })
  })

  it('buildHandoffPrompt includes pinned items', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vibebar-session-'))
    const svc = new SessionService(mockProjects(dir))
    let state = await svc.append({ type: 'note', title: 'Pinned note', noteId: 'n1', text: 'Remember X' })
    await svc.togglePin(state.entries[0]!.id)

    const result = await svc.buildHandoffPrompt(false)
    expect(result.noProject).toBe(false)
    expect(result.pinnedCount).toBe(1)
    expect(result.text).toContain('# VibeBar Session Handoff')
    expect(result.text).toContain('Pinned note')
    expect(result.text).toContain('Remember X')
  })

  it('pinRecentIfNonePinned pins the newest entries when none are pinned', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vibebar-session-'))
    const svc = new SessionService(mockProjects(dir))
    await svc.append({ type: 'prompt', title: 'Oldest', promptId: 'p1' })
    await new Promise((r) => setTimeout(r, 5))
    await svc.append({ type: 'prompt', title: 'Newest', promptId: 'p2' })

    const state = await svc.pinRecentIfNonePinned(1)
    expect(state.pinnedCount).toBe(1)
    expect(state.entries.find((e) => e.title === 'Newest')?.pinned).toBe(true)
  })

  it('normalizeSessionEntries caps and dedupes on disk', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vibebar-session-'))
    const svc = new SessionService(mockProjects(dir))
    for (let i = 0; i < SESSION_MAX_ENTRIES + 5; i++) {
      await svc.append({ type: 'note', title: 'dup', noteId: 'n', text: 'same' })
    }
    const state = await svc.getState()
    expect(state.entries.length).toBeLessThanOrEqual(SESSION_MAX_ENTRIES)
    expect(state.entries.filter((e) => e.title === 'dup').length).toBe(1)

    const normalized = normalizeSessionEntries(
      Array.from({ length: SESSION_MAX_ENTRIES + 3 }, (_, i) => ({
        id: `id-${i}`,
        type: 'note' as const,
        title: `t-${i}`,
        noteId: 'n',
        text: 'x',
        timestamp: i,
        pinned: false
      }))
    )
    expect(normalized.length).toBe(SESSION_MAX_ENTRIES)
  })
})
