import { describe, expect, it } from 'vitest'
import { pushRecentProject, pruneRecentProjects, RECENT_PROJECTS_LIMIT } from './recentProjects.js'

describe('pushRecentProject', () => {
  it('prepends and dedupes by path', () => {
    const list = [
      { path: '/a', label: 'A', lastOpenedAt: 1 },
      { path: '/b', label: 'B', lastOpenedAt: 2 }
    ]
    const next = pushRecentProject(list, { path: '/b', label: 'B2', lastOpenedAt: 99 })
    expect(next[0]).toEqual({ path: '/b', label: 'B2', lastOpenedAt: 99 })
    expect(next).toHaveLength(2)
  })

  it('caps at RECENT_PROJECTS_LIMIT', () => {
    let list = [{ path: '/0', label: '0', lastOpenedAt: 0 }]
    for (let i = 1; i <= RECENT_PROJECTS_LIMIT + 2; i++) {
      list = pushRecentProject(list, { path: `/${i}`, label: String(i), lastOpenedAt: i })
    }
    expect(list).toHaveLength(RECENT_PROJECTS_LIMIT)
    expect(list[0]?.path).toBe(`/${RECENT_PROJECTS_LIMIT + 2}`)
  })
})

describe('pruneRecentProjects', () => {
  it('removes missing paths', () => {
    const list = [
      { path: '/ok', label: 'ok', lastOpenedAt: 1 },
      { path: '/gone', label: 'gone', lastOpenedAt: 2 }
    ]
    const pruned = pruneRecentProjects(list, (p) => p === '/ok')
    expect(pruned).toEqual([{ path: '/ok', label: 'ok', lastOpenedAt: 1 }])
  })
})
