import { mkdir, stat } from 'node:fs/promises'
import { DEFAULT_DEBOUNCE_MS, DEFAULT_MAX_FILE_BYTES, MAX_SYNC_INSTANCES } from './shared/constants.js'
import { isUnderOrEqual } from './sync/pathConflict.js'

function assertString(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new Error(`${field} must be a string`)
  if (v.length > max) throw new Error(`${field} is too long`)
  return v
}

function assertInstanceId(v: unknown): string {
  const s = assertString(v, 64, 'instanceId')
  if (s.length < 4) throw new Error('instanceId is too short')
  if (!/^[\w.-]+$/.test(s)) throw new Error('instanceId has invalid characters')
  return s
}

export interface ValidatedSyncStart {
  instanceId: string
  sourceRoot: string
  destRoot: string
  ignoreText: string
  maxFileBytes: number | null
  debounceMs: number
}

export async function validateSyncStart(payload: unknown): Promise<ValidatedSyncStart> {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('Invalid payload')
  }
  const p = payload as Record<string, unknown>
  const instanceId = assertInstanceId(p.instanceId)
  const sourceRoot = assertString(p.sourceRoot, 8192, 'sourceRoot')
  const destRoot = assertString(p.destRoot, 8192, 'destRoot')
  const ignoreText = typeof p.ignoreText === 'string' ? p.ignoreText : ''
  if (sourceRoot.toLowerCase() === destRoot.toLowerCase()) {
    throw new Error('Source and sync folder must be different paths')
  }
  // The source living inside the sync folder is destructive: the mirror's delete pass would
  // treat the original source files as stray output and remove them. (The inverse — a sync
  // folder nested in the source — is allowed and handled by excluding it from the scan.)
  if (isUnderOrEqual(destRoot, sourceRoot)) {
    throw new Error('Source folder cannot be inside the sync folder (this would delete your source files).')
  }
  await stat(sourceRoot).catch(() => {
    throw new Error('Source folder is not accessible')
  })
  await mkdir(destRoot, { recursive: true }).catch(() => {
    throw new Error('Sync folder is not accessible')
  })
  await stat(destRoot).catch(() => {
    throw new Error('Sync folder is not accessible')
  })
  let maxFileBytes: number | null
  if (p.maxFileBytes === null) {
    maxFileBytes = null
  } else if (p.maxFileBytes === undefined) {
    maxFileBytes = DEFAULT_MAX_FILE_BYTES
  } else if (
    typeof p.maxFileBytes === 'number' &&
    Number.isFinite(p.maxFileBytes) &&
    p.maxFileBytes > 0
  ) {
    maxFileBytes = p.maxFileBytes
  } else {
    maxFileBytes = DEFAULT_MAX_FILE_BYTES
  }
  const debounceMs =
    typeof p.debounceMs === 'number' && Number.isFinite(p.debounceMs) && p.debounceMs >= 50
      ? p.debounceMs
      : DEFAULT_DEBOUNCE_MS
  return { instanceId, sourceRoot, destRoot, ignoreText, maxFileBytes, debounceMs }
}

export interface SyncInstanceConfig {
  id: string
  sourcePath: string
  syncPath: string
}

export interface CodeSyncConfig {
  instances: SyncInstanceConfig[]
  ignoreText: string
  maxFileBytes: number | null
  debounceMs: number
}

export function validateConfigSave(payload: unknown): Partial<CodeSyncConfig> {
  if (payload === null || typeof payload !== 'object') {
    throw new Error('Invalid config')
  }
  const p = payload as Record<string, unknown>
  const out: Partial<CodeSyncConfig> = {}
  if ('instances' in p) {
    if (!Array.isArray(p.instances)) throw new Error('instances must be an array')
    if (p.instances.length > MAX_SYNC_INSTANCES) {
      throw new Error(`At most ${MAX_SYNC_INSTANCES} sync instances can be saved`)
    }
    const instances: SyncInstanceConfig[] = []
    for (const row of p.instances) {
      if (row === null || typeof row !== 'object') throw new Error('Invalid instance row')
      const r = row as Record<string, unknown>
      instances.push({
        id: assertString(r.id, 64, 'id'),
        sourcePath: assertString(r.sourcePath, 8192, 'sourcePath'),
        syncPath: assertString(r.syncPath, 8192, 'syncPath')
      })
    }
    out.instances = instances
  }
  if ('ignoreText' in p && typeof p.ignoreText === 'string') out.ignoreText = p.ignoreText
  if ('debounceMs' in p && typeof p.debounceMs === 'number' && Number.isFinite(p.debounceMs)) {
    out.debounceMs = p.debounceMs
  }
  if ('maxFileBytes' in p) {
    if (p.maxFileBytes === null) out.maxFileBytes = null
    else if (typeof p.maxFileBytes === 'number' && Number.isFinite(p.maxFileBytes)) {
      out.maxFileBytes = p.maxFileBytes
    }
  }
  return out
}
