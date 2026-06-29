import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveSyncDestRoot,
  sourceContextFolderName,
  sourceFolderBasename
} from './destRoot.js'

describe('sourceFolderBasename', () => {
  it('uses the last path segment', () => {
    expect(sourceFolderBasename('/repo/src/components')).toBe('components')
    expect(sourceFolderBasename('P:\\repo\\src\\components\\')).toBe('components')
  })
})

describe('sourceContextFolderName', () => {
  it('appends " context" to the source folder name', () => {
    expect(sourceContextFolderName('/repo/src/components')).toBe('components context')
  })
})

describe('resolveSyncDestRoot', () => {
  it('creates a named context subfolder under the sync parent', () => {
    expect(resolveSyncDestRoot('/repo/AI Context', '/repo/src/components')).toBe(
      '/repo/AI Context/components context'
    )
  })

  it('keeps an already-resolved context folder', () => {
    const leaf = join('/repo/AI Context', 'components context')
    expect(resolveSyncDestRoot(leaf, '/repo/src/components')).toBe(leaf)
  })

  it('keeps legacy leaf folders that match the source basename', () => {
    const legacy = join('/repo/AI Context', 'components')
    expect(resolveSyncDestRoot(legacy, '/repo/src/components')).toBe(legacy)
  })
})
