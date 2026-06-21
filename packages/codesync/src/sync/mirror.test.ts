import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { mirrorFull } from './mirror.js'
import { compileIgnoreMatchers, getIgnoreGlobList, parseUserIgnoreLines } from './ignore.js'
import { relUnder } from './pathConflict.js'

/** Builds mirror ignore options the same way SyncService does, including the nested-dest guard. */
function buildIgnores(sourceRoot: string, destRoot: string, userIgnore = '') {
  const extra = parseUserIgnoreLines(userIgnore)
  const nestedDestRel = relUnder(sourceRoot, destRoot)
  if (nestedDestRel) extra.push(nestedDestRel, `${nestedDestRel}/**`)
  return {
    matchIgnore: compileIgnoreMatchers(extra),
    fgIgnore: getIgnoreGlobList(extra)
  }
}

describe('mirrorFull with a sync folder nested inside the source', () => {
  it('mirrors source files without cloning the sync folder into itself', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-mirror-'))
    try {
      const sourceRoot = join(base, 'project')
      const destRoot = join(sourceRoot, 'sync') // destination lives inside the source tree
      await mkdir(join(sourceRoot, 'src'), { recursive: true })
      await mkdir(destRoot, { recursive: true })
      await writeFile(join(sourceRoot, 'src', 'index.ts'), 'export const x = 1\n')
      await writeFile(join(sourceRoot, 'README.md'), '# hi\n')

      const { matchIgnore, fgIgnore } = buildIgnores(sourceRoot, destRoot)

      // Two passes: the first mirrors, the second must be idempotent (no growing nesting).
      await mirrorFull({ sourceRoot, destRoot, matchIgnore, fgIgnore, maxFileBytes: null })
      const second = await mirrorFull({
        sourceRoot,
        destRoot,
        matchIgnore,
        fgIgnore,
        maxFileBytes: null
      })

      expect(existsSync(join(destRoot, 'src', 'index.ts'))).toBe(true)
      expect(existsSync(join(destRoot, 'README.md'))).toBe(true)
      expect(await readFile(join(destRoot, 'src', 'index.ts'), 'utf8')).toBe('export const x = 1\n')

      // The sync folder must never contain a recursive clone of itself.
      expect(existsSync(join(destRoot, 'sync'))).toBe(false)

      // Second pass copies nothing new and deletes nothing (stable steady state).
      expect(second.copied).toBe(0)
      expect(second.deleted).toBe(0)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
