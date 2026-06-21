import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBundleText, listTree, packContext } from './contextPacker.js'

describe('buildBundleText', () => {
  it('produces a prompt-shaped block with language fences', () => {
    const text = buildBundleText('my-app (Electron)', [
      { rel: 'src/index.ts', content: 'export const x = 1' }
    ])
    expect(text).toContain('## Project context: my-app (Electron)')
    expect(text).toContain('### src/index.ts')
    expect(text).toContain('```typescript')
    expect(text).toContain('export const x = 1')
  })
})

describe('packContext', () => {
  it('bundles selected files and reports counts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-pack-'))
    try {
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, 'src', 'a.ts'), 'const a = 1')
      await writeFile(join(dir, 'src', 'b.ts'), 'const b = 2')
      const out = await packContext({
        rootPath: dir,
        relPaths: ['src/a.ts', 'src/b.ts'],
        headerLabel: 'demo'
      })
      expect(out.fileCount).toBe(2)
      expect(out.skipped).toBe(0)
      expect(out.redactedText).toContain('const a = 1')
      expect(out.redactedText).toContain('const b = 2')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('strips secrets from the bundle output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-pack-'))
    try {
      await writeFile(join(dir, 'config.ts'), 'export const KEY = "AKIA1234567890ABCDEF"')
      const out = await packContext({
        rootPath: dir,
        relPaths: ['config.ts'],
        headerLabel: 'demo'
      })
      expect(out.findings.length).toBeGreaterThan(0)
      expect(out.redactedText).not.toContain('AKIA1234567890ABCDEF')
      expect(out.redactedText).toContain('[REDACTED:AWS access key]')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips path traversal and ignored files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-pack-'))
    try {
      await mkdir(join(dir, 'node_modules'), { recursive: true })
      await writeFile(join(dir, 'node_modules', 'dep.js'), 'module.exports = 1')
      const out = await packContext({
        rootPath: dir,
        relPaths: ['../outside.ts', 'node_modules/dep.js'],
        headerLabel: 'demo'
      })
      expect(out.fileCount).toBe(0)
      expect(out.skipped).toBe(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects absolute paths even when the target file exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-pack-'))
    const outside = await mkdtemp(join(tmpdir(), 'vb-outside-'))
    try {
      const secret = join(outside, 'secret.ts')
      await writeFile(secret, 'const token = "AKIA1234567890ABCDEF"')
      const out = await packContext({
        rootPath: dir,
        relPaths: [secret],
        headerLabel: 'demo'
      })
      expect(out.fileCount).toBe(0)
      expect(out.skipped).toBe(1)
      expect(out.redactedText).not.toContain('AKIA1234567890ABCDEF')
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('listTree', () => {
  it('lists immediate children, folders first, ignoring node_modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-tree-'))
    try {
      await mkdir(join(dir, 'src'), { recursive: true })
      await mkdir(join(dir, 'node_modules'), { recursive: true })
      await writeFile(join(dir, 'README.md'), '# hi')
      const nodes = await listTree(dir, '')
      const names = nodes.map((n) => n.name)
      expect(names).toContain('src')
      expect(names).toContain('README.md')
      expect(names).not.toContain('node_modules')
      expect(nodes[0].isDir).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns nothing for an absolute directory outside the root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-tree-'))
    const outside = await mkdtemp(join(tmpdir(), 'vb-outside-'))
    try {
      await writeFile(join(outside, 'leak.ts'), 'export const x = 1')
      expect(await listTree(dir, outside)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
