import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Returns true if `child` is exactly `parent` or is contained under `parent`
 * (same drive/volume; uses resolved absolute paths).
 *
 * On Windows, `relative()` returns an absolute path when `parent` and `child`
 * are on different drives; without handling that, unrelated paths look
 * "nested" and block legitimate multi-instance setups.
 */
export function isUnderOrEqual(parent: string, child: string): boolean {
  const p = resolve(parent)
  const c = resolve(child)
  if (p === c) return true
  const rel = relative(p, c)
  if (!rel) return true
  if (isAbsolute(rel)) return false
  return !rel.startsWith('..')
}

/**
 * If `child` is *strictly* nested under `parent`, returns the relative path from
 * `parent` to `child` using posix `/` separators (suitable for glob ignore lists).
 * Returns `null` when they are equal, unrelated, or on different drives/volumes.
 *
 * Used so a sync (destination) folder that lives *inside* the source tree can be
 * excluded from the mirror scan and watcher — otherwise the source scan would
 * pick up the destination's own files and copy them back into a nested clone
 * (sync/sync/sync…), duplicating the tree on every pass.
 */
export function relUnder(parent: string, child: string): string | null {
  const p = resolve(parent)
  const c = resolve(child)
  if (p === c) return null
  const rel = relative(p, c)
  if (!rel || isAbsolute(rel) || rel.startsWith('..')) return null
  return rel.split(sep).join('/')
}

export interface RunningPair {
  id: string
  sourceRoot: string
  destRoot: string
}

/**
 * Returns an error message if the new pair conflicts with any running instance.
 */
export function conflictMessage(
  sourceRoot: string,
  destRoot: string,
  running: RunningPair[]
): string | null {
  const s = resolve(sourceRoot)
  const d = resolve(destRoot)

  for (const o of running) {
    const s2 = resolve(o.sourceRoot)
    const d2 = resolve(o.destRoot)

    if (s === s2 && d === d2) {
      return 'The same source and sync folder pair is already running in another instance.'
    }
    if (s === s2) {
      return 'Another instance is already syncing from this source folder.'
    }

    if (isUnderOrEqual(s, s2) || isUnderOrEqual(s2, s)) {
      return 'Source folders overlap with another running instance (nested paths). Use one instance or separate folder trees.'
    }

    // Cross-mirror layouts (each repo's "AI context" copy living under the other repo) are
    // allowed. We only block when the *new* source root lies *inside* another instance's
    // sync destination (you would be mirroring from inside someone else's output tree).
    if (isUnderOrEqual(d2, s)) {
      return 'Source or sync folder overlaps another instance\u2019s folders. Separate project trees to avoid destructive syncs or duplicate watchers.'
    }
  }

  return null
}
