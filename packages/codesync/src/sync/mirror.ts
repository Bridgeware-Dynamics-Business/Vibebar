import fg from 'fast-glob'
import { copyFile, mkdir, rm, stat, utimes } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import pLimit from 'p-limit'
import type picomatch from 'picomatch'
import { isIgnoredRel } from './ignore.js'
import { shouldCopyFile } from './copyLogic.js'

const limit = pLimit(12)

export interface MirrorOptions {
  sourceRoot: string
  destRoot: string
  matchIgnore: picomatch.Matcher
  fgIgnore: string[]
  maxFileBytes: number | null
  onSkip?: (reason: string, rel: string) => void
}

/** Collect parent directory paths for a file path (posix segments). */
function parentDirsForFile(relFile: string): string[] {
  const parts = relFile.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const dirs: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    dirs.push(parts.slice(0, i + 1).join('/'))
  }
  return dirs
}

/** Full one-way mirror: copy/update files, delete extras in dest, remove orphan dirs. */
export async function mirrorFull(opts: MirrorOptions): Promise<{
  copied: number
  skipped: number
  deleted: number
}> {
  const { sourceRoot, destRoot, matchIgnore, fgIgnore, maxFileBytes } = opts

  const srcFiles = await fg('**/*', {
    cwd: sourceRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: fgIgnore
  })

  const sourceFileSet = new Set<string>()
  const sourceDirSet = new Set<string>()

  for (const rel of srcFiles) {
    const n = rel.replace(/\\/g, '/')
    if (isIgnoredRel(n, matchIgnore)) continue
    sourceFileSet.add(n)
    for (const d of parentDirsForFile(n)) {
      sourceDirSet.add(d)
    }
  }

  let copied = 0
  let skipped = 0
  const tasks: Promise<void>[] = []

  for (const rel of sourceFileSet) {
    const srcAbs = join(sourceRoot, rel)
    const destAbs = join(destRoot, rel)
    tasks.push(
      limit(async () => {
        let st
        try {
          st = await stat(srcAbs)
        } catch {
          return
        }
        if (!st.isFile()) return
        if (maxFileBytes !== null && st.size > maxFileBytes) {
          opts.onSkip?.('max size', rel)
          return
        }
        let destSt: Awaited<ReturnType<typeof stat>> | null = null
        try {
          destSt = await stat(destAbs)
        } catch {
          destSt = null
        }
        if (!shouldCopyFile(st, destSt)) {
          skipped++
          return
        }
        await mkdir(dirname(destAbs), { recursive: true })
        await copyFile(srcAbs, destAbs)
        await utimes(destAbs, st.atime, st.mtime)
        copied++
      })
    )
  }

  await Promise.all(tasks)

  const destFiles = await fg('**/*', {
    cwd: destRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: fgIgnore
  })

  let deleted = 0
  for (const rel of destFiles) {
    const n = rel.replace(/\\/g, '/')
    if (isIgnoredRel(n, matchIgnore)) continue
    if (sourceFileSet.has(n)) continue
    const destAbs = join(destRoot, n)
    await rm(destAbs, { force: true })
    deleted++
  }

  const destDirs = await fg('**/', {
    cwd: destRoot,
    dot: true,
    onlyDirectories: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: fgIgnore
  })
  const sortedDirs = destDirs
    .map((d) => d.replace(/\\/g, '/').replace(/\/$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.split('/').length - a.split('/').length)

  for (const d of sortedDirs) {
    if (isIgnoredRel(d, matchIgnore)) continue
    if (sourceDirSet.has(d)) continue
    const destAbs = join(destRoot, d)
    try {
      await rm(destAbs, { recursive: true, force: true })
    } catch {
      /* may be non-empty if nested ignored */
    }
  }

  return { copied, skipped, deleted }
}
