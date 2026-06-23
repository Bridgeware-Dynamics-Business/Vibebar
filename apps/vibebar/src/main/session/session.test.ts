import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyProfile } from '@vibebar/project-detector'
import type { ProjectProfile } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { SessionService } from './SessionService.js'

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
    expect(JSON.parse(raw)).toEqual({ entries: [] })
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
})
