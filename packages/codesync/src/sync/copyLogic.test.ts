import { describe, expect, it } from 'vitest'
import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { shouldCopyFile } from './copyLogic.js'

function statLike(size: number, mtimeMs: number): Stats {
  return { size, mtimeMs, isFile: () => true } as Stats
}

describe('shouldCopyFile', () => {
  it('returns true when dest is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-'))
    try {
      const src = join(dir, 'a.txt')
      await writeFile(src, 'x')
      const st = await stat(src)
      expect(shouldCopyFile(st, null)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns false when size matches and mtime is same second (sub-ms may differ)', () => {
    const t = 1_704_000_000_123
    expect(shouldCopyFile(statLike(100, t + 100), statLike(100, t + 800))).toBe(false)
  })

  it('returns true when size matches but mtime second differs', () => {
    const t = 1_704_000_000_123
    expect(shouldCopyFile(statLike(100, t), statLike(100, t + 1000))).toBe(true)
  })

  it('returns false when dest stats match source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-'))
    try {
      const src = join(dir, 'a.txt')
      await writeFile(src, 'same')
      const st = await stat(src)
      expect(shouldCopyFile(st, st)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
