import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trimPathsToCharBudget } from './contextPacker.js'
import { expandImportNeighbors, nearestTestFile } from './mvcPacker.js'

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
