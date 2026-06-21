import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateConfigSave, validateSyncStart } from './validate.js'

let source: string
let dest: string

beforeEach(async () => {
  source = await mkdtemp(join(tmpdir(), 'vb-src-'))
  dest = await mkdtemp(join(tmpdir(), 'vb-dst-'))
})

afterEach(async () => {
  await rm(source, { recursive: true, force: true })
  await rm(dest, { recursive: true, force: true })
})

function base(): Record<string, unknown> {
  return { instanceId: 'inst-1', sourceRoot: source, destRoot: dest, ignoreText: '' }
}

describe('validateSyncStart', () => {
  it('accepts a valid payload and applies defaults', async () => {
    const v = await validateSyncStart(base())
    expect(v.instanceId).toBe('inst-1')
    expect(v.sourceRoot).toBe(source)
    expect(v.destRoot).toBe(dest)
    expect(v.maxFileBytes).toBeGreaterThan(0)
    expect(v.debounceMs).toBeGreaterThanOrEqual(50)
  })

  it('rejects a non-object payload', async () => {
    await expect(validateSyncStart(null)).rejects.toThrow(/Invalid payload/)
    await expect(validateSyncStart('nope')).rejects.toThrow(/Invalid payload/)
  })

  it('rejects an instanceId that is too short or has invalid characters', async () => {
    await expect(validateSyncStart({ ...base(), instanceId: 'ab' })).rejects.toThrow(/too short/)
    await expect(validateSyncStart({ ...base(), instanceId: 'has space' })).rejects.toThrow(
      /invalid characters/
    )
  })

  it('rejects identical source and sync folders', async () => {
    await expect(validateSyncStart({ ...base(), destRoot: source })).rejects.toThrow(
      /must be different/
    )
  })

  it('rejects a source folder nested inside the sync folder', async () => {
    const nested = join(dest, 'inner')
    await mkdir(nested, { recursive: true })
    await expect(validateSyncStart({ ...base(), sourceRoot: nested })).rejects.toThrow(
      /cannot be inside the sync folder/
    )
  })

  it('rejects an inaccessible source folder', async () => {
    await expect(
      validateSyncStart({ ...base(), sourceRoot: join(source, 'does-not-exist') })
    ).rejects.toThrow(/not accessible/)
  })

  it('honors an explicit null maxFileBytes (no cap)', async () => {
    const v = await validateSyncStart({ ...base(), maxFileBytes: null })
    expect(v.maxFileBytes).toBeNull()
  })
})

describe('validateConfigSave', () => {
  it('rejects a non-object config', () => {
    expect(() => validateConfigSave(null)).toThrow(/Invalid config/)
  })

  it('rejects more than the allowed number of instances', () => {
    const instances = Array.from({ length: 100 }, (_, i) => ({
      id: `i${i}`,
      sourcePath: '/a',
      syncPath: '/b'
    }))
    expect(() => validateConfigSave({ instances })).toThrow(/At most/)
  })

  it('passes through a valid partial config', () => {
    const out = validateConfigSave({
      instances: [{ id: 'i1', sourcePath: '/a', syncPath: '/b' }],
      ignoreText: 'node_modules',
      debounceMs: 300
    })
    expect(out.instances).toHaveLength(1)
    expect(out.ignoreText).toBe('node_modules')
    expect(out.debounceMs).toBe(300)
  })
})
