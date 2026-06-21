import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { conflictMessage, isUnderOrEqual } from './pathConflict.js'

describe('isUnderOrEqual', () => {
  it('does not treat different Windows drive letters as nested', () => {
    if (platform() !== 'win32') return
    expect(isUnderOrEqual('C:\\projects\\p1', 'D:\\projects\\p2')).toBe(false)
    expect(isUnderOrEqual('D:\\sync\\out', 'C:\\code\\src')).toBe(false)
  })

  it('detects direct child on same root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cs-pc-'))
    try {
      const parent = join(dir, 'a')
      const child = join(dir, 'a', 'b')
      await mkdir(parent, { recursive: true })
      expect(isUnderOrEqual(parent, child)).toBe(true)
      expect(isUnderOrEqual(child, parent)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('conflictMessage', () => {
  it('flags duplicate source pair', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-pc-'))
    try {
      const src = join(base, 'src')
      const dst = join(base, 'sync')
      await mkdir(src, { recursive: true })
      await mkdir(dst, { recursive: true })
      const msg = conflictMessage(src, dst, [{ id: 'a', sourceRoot: src, destRoot: dst }])
      expect(msg).toContain('already')
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('allows cross-mirror when other sync folder is under new source (AI context layout)', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-xm-'))
    try {
      const webRoot = join(base, 'pycare-web')
      const otherDest = join(webRoot, 'AI context', 'Pycare')
      const newSrc = webRoot
      const newDest = join(base, 'pycare', 'AI', 'Pycare-web')
      await mkdir(otherDest, { recursive: true })
      const msg = conflictMessage(newSrc, newDest, [
        { id: '1', sourceRoot: join(base, 'pycare', 'core'), destRoot: otherDest }
      ])
      expect(msg).toBeNull()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('still blocks when new source is inside another instance sync folder', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-bl-'))
    try {
      const mirrorOut = join(base, 'mirror', 'out')
      const newSrc = join(mirrorOut, 'nested', 'src')
      const newDest = join(base, 'dest')
      await mkdir(newSrc, { recursive: true })
      const msg = conflictMessage(newSrc, newDest, [
        { id: '1', sourceRoot: join(base, 'upstream'), destRoot: mirrorOut }
      ])
      expect(msg).not.toBeNull()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('allows cross-mirror when new sync folder is under other source (inverse)', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-xm-'))
    try {
      const webRoot = join(base, 'web')
      const newDest = join(webRoot, 'AI context', 'Pycare')
      const newSrc = join(base, 'py')
      const otherDest = join(base, 'py', 'AI', 'Pycare-web')
      await mkdir(otherDest, { recursive: true })
      const msg = conflictMessage(newSrc, newDest, [
        { id: '1', sourceRoot: webRoot, destRoot: otherDest }
      ])
      expect(msg).toBeNull()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('allows two instances on different drive letters (Windows)', () => {
    if (platform() !== 'win32') return
    const msg = conflictMessage('C:\\work\\src1', 'C:\\work\\dst1', [
      { id: 'x', sourceRoot: 'D:\\work\\src2', destRoot: 'D:\\work\\dst2' }
    ])
    expect(msg).toBeNull()
  })

  it('allows separate trees', async () => {
    const base = await mkdtemp(join(tmpdir(), 'cs-pc-'))
    try {
      const a = join(base, 'a')
      const b = join(base, 'b')
      await mkdir(join(a, 'src'), { recursive: true })
      await mkdir(join(a, 'out'), { recursive: true })
      await mkdir(join(b, 'src'), { recursive: true })
      await mkdir(join(b, 'out'), { recursive: true })
      const msg = conflictMessage(join(a, 'src'), join(a, 'out'), [
        { id: 'x', sourceRoot: join(b, 'src'), destRoot: join(b, 'out') }
      ])
      expect(msg).toBeNull()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
