import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { trimPathsToCharBudget } from './contextPacker.js'
import { expandImportNeighbors, findRelatedTests, nearestTestFile, packMvcContext } from './mvcPacker.js'

const execFileAsync = promisify(execFile)

async function initGitRepo(dir: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir })
}

describe('trimPathsToCharBudget', () => {
  it('keeps changed paths before config when over budget', () => {
    const paths = ['src/a.ts', 'tests/a.test.ts', 'package.json']
    const charByPath = new Map([
      ['src/a.ts', 20_000],
      ['tests/a.test.ts', 10_000],
      ['package.json', 5_000]
    ])
    const categories = {
      'src/a.ts': 'changed' as const,
      'tests/a.test.ts': 'tests' as const,
      'package.json': 'config' as const
    }
    const { kept, trimmed } = trimPathsToCharBudget(paths, charByPath, categories, 22_000)
    expect(kept).toEqual(['src/a.ts'])
    expect(trimmed).toContain('package.json')
    expect(trimmed).toContain('tests/a.test.ts')
  })
})

describe('expandImportNeighbors', () => {
  it('follows relative imports one hop', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mvc-'))
    try {
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, 'src', 'main.ts'), `import { x } from './util'\nexport {}`)
      await writeFile(join(dir, 'src', 'util.ts'), 'export const x = 1')
      const neighbors = await expandImportNeighbors(dir, ['src/main.ts'])
      expect(neighbors).toContain('src/util.ts')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('nearestTestFile', () => {
  it('prefers a test in the same directory as the failure file', () => {
    const tests = ['src/other/foo.test.ts', 'src/bar.test.ts']
    expect(nearestTestFile(tests, ['src/bar.ts'])).toBe('src/bar.test.ts')
  })
})

describe('findRelatedTests', () => {
  it('respects ignore patterns like context packer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mvc-ignore-'))
    try {
      await mkdir(join(dir, 'src'), { recursive: true })
      await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true })
      await writeFile(join(dir, 'src', 'app.ts'), 'export {}')
      await writeFile(join(dir, 'src', 'app.test.ts'), 'test("x", () => {})')
      await writeFile(join(dir, 'node_modules', 'pkg', 'app.test.ts'), 'test("ignored", () => {})')
      const tests = await findRelatedTests(dir, ['src/app.ts'], ['node_modules/**'])
      expect(tests).toContain('src/app.test.ts')
      expect(tests.some((t) => t.includes('node_modules'))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('packMvcContext', () => {
  it('passes charBudget through to pack output metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mvc-budget-'))
    try {
      await initGitRepo(dir)
      await mkdir(join(dir, 'src'), { recursive: true })
      await writeFile(join(dir, 'src', 'big.ts'), 'x'.repeat(20_000))
      await writeFile(join(dir, 'package.json'), '{}')
      await execFileAsync('git', ['add', '.'], { cwd: dir })
      const packed = await packMvcContext({
        rootPath: dir,
        headerLabel: 'demo',
        charBudget: 5000
      })
      expect(packed.charBudget).toBe(5000)
      expect(packed.usedChars).toBeLessThanOrEqual(5000 + 500)
      expect(packed.trimmedPaths.length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
