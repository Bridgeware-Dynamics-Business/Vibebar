import { describe, expect, it } from 'vitest'
import {
  comparePackageJsonDeps,
  formatDependencyReviewPrompt,
  isUnpinnedVersion,
  parsePackageJsonDeps
} from './dependencyChange.js'

describe('dependencyChange', () => {
  it('parses package.json deps', () => {
    const parsed = parsePackageJsonDeps(
      JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '1.0.0' }
      })
    )
    expect(parsed?.dependencies.react).toBe('^18.0.0')
    expect(parsed?.devDependencies.vitest).toBe('1.0.0')
  })

  it('detects unpinned versions', () => {
    expect(isUnpinnedVersion('*')).toBe(true)
    expect(isUnpinnedVersion('latest')).toBe(true)
    expect(isUnpinnedVersion('file:../local')).toBe(true)
    expect(isUnpinnedVersion('^1.2.3')).toBe(false)
  })

  it('compares added removed and changed deps', () => {
    const diff = comparePackageJsonDeps(
      { dependencies: { lodash: '4.17.21' }, devDependencies: {} },
      { dependencies: { lodash: '4.17.22', zod: '*' }, devDependencies: { vitest: '1.0.0' } }
    )
    expect(diff.changed.map((d) => d.name)).toContain('lodash')
    expect(diff.added.map((d) => d.name)).toEqual(expect.arrayContaining(['zod', 'vitest']))
    expect(diff.unpinned.some((d) => d.name === 'zod')).toBe(true)
  })

  it('formats dependency review prompt with lockfile hint', () => {
    const text = formatDependencyReviewPrompt({
      added: [{ name: 'zod', section: 'dependencies', after: '*', unpinned: true }],
      removed: [],
      changed: [],
      unpinned: [{ name: 'zod', section: 'dependencies', after: '*', unpinned: true }],
      lockfileSignalActive: true
    })
    expect(text).toContain('Lockfile also changed')
    expect(text).toContain('zod')
  })
})
