function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

function pathBasename(path: string): string {
  const trimmed = trimTrailingSeparators(path)
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return i >= 0 ? trimmed.slice(i + 1) : trimmed
}

function pathJoin(left: string, right: string): string {
  const sep = left.includes('\\') || right.includes('\\') ? '\\' : '/'
  return `${trimTrailingSeparators(left)}${sep}${right}`
}

/** Last segment of the chosen source folder (e.g. `components` from `…/src/components`). */
export function sourceFolderBasename(sourcePath: string): string {
  const name = pathBasename(trimTrailingSeparators(sourcePath))
  return name || 'source'
}

/** Context subfolder name for a source folder (e.g. `components context`). */
export function sourceContextFolderName(sourcePath: string): string {
  return `${sourceFolderBasename(sourcePath)} context`
}

/**
 * Resolves the mirror destination for a source/sync pair.
 * Files mirror into `{syncPath}/{sourceBasename} context/` unless syncPath already
 * points at that folder or a legacy leaf folder named like the source.
 */
export function resolveSyncDestRoot(syncPath: string, sourcePath: string): string {
  const sync = trimTrailingSeparators(syncPath)
  const sourceBase = sourceFolderBasename(sourcePath)
  const contextName = sourceContextFolderName(sourcePath)
  const syncBase = pathBasename(sync)

  if (syncBase.toLowerCase() === contextName.toLowerCase()) {
    return sync
  }
  // Legacy configs that synced directly into `AI Context/components/`.
  if (syncBase.toLowerCase() === sourceBase.toLowerCase()) {
    return sync
  }
  return pathJoin(sync, contextName)
}
