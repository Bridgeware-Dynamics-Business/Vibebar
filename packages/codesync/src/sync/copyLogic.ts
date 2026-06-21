import type { Stats } from 'node:fs'

/**
 * If dest is missing or not a file, or size differs, copy.
 * Otherwise compare modification time at **second** precision (like many VCS tools):
 * avoids endless re-copies when the OS rounds mtimes differently after copy/utimes
 * or when two mirrors ping-pong the same tree.
 */
export function shouldCopyFile(srcStat: Stats, destStat: Stats | null): boolean {
  if (!destStat || !destStat.isFile()) return true
  if (srcStat.size !== destStat.size) return true
  const srcSec = Math.floor(srcStat.mtimeMs / 1000)
  const destSec = Math.floor(destStat.mtimeMs / 1000)
  return srcSec !== destSec
}
