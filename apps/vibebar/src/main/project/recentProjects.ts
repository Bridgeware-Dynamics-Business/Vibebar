import type { RecentProject } from '@shared/types.js'

export const RECENT_PROJECTS_LIMIT = 10

/** Pushes a project to the front of the recents list (deduped, capped). */
export function pushRecentProject(
  list: RecentProject[],
  entry: { path: string; label: string; lastOpenedAt?: number }
): RecentProject[] {
  const lastOpenedAt = entry.lastOpenedAt ?? Date.now()
  const next = [{ path: entry.path, label: entry.label, lastOpenedAt }, ...list.filter((r) => r.path !== entry.path)]
  return next.slice(0, RECENT_PROJECTS_LIMIT)
}

/** Drops recents whose paths no longer exist on disk. */
export function pruneRecentProjects(
  list: RecentProject[],
  exists: (path: string) => boolean
): RecentProject[] {
  return list.filter((r) => exists(r.path))
}
