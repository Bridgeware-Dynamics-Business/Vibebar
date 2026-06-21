import type { CodeSyncConfig, SyncInstanceConfig } from './validate.js'

export type { CodeSyncConfig, SyncInstanceConfig }

/** IPC channel names for the Code Sync tool window. */
export const CODESYNC_CHANNELS = {
  pickFolder: 'codesync:pickFolder',
  configLoad: 'codesync:config:load',
  configSave: 'codesync:config:save',
  syncStart: 'codesync:sync:start',
  syncStop: 'codesync:sync:stop',
  syncStatus: 'codesync:sync:status',
  log: 'codesync:sync:log'
} as const

export interface StartSyncPayload {
  instanceId: string
  sourceRoot: string
  destRoot: string
  ignoreText: string
  maxFileBytes: number | null
  debounceMs: number
}

export type StartSyncResult = { ok: true } | { ok: false; error: string }

export interface SyncStatus {
  instances: Array<{ id: string; running: boolean }>
}

export interface LogEntry {
  instanceId: string
  line: string
}

/** The typed bridge surface exposed to the Code Sync renderer via contextBridge. */
export interface CodeSyncApi {
  pickFolder: () => Promise<string | null>
  startSync: (payload: StartSyncPayload) => Promise<StartSyncResult>
  stopSync: (instanceId: string) => Promise<StartSyncResult>
  syncStatus: () => Promise<SyncStatus>
  loadConfig: () => Promise<CodeSyncConfig>
  saveConfig: (cfg: Partial<CodeSyncConfig>) => Promise<void>
  onLog: (cb: (entry: LogEntry) => void) => () => void
}
