import type { IpcMain } from 'electron'
import { SyncManager } from './sync/manager.js'
import { validateConfigSave, validateSyncStart, type CodeSyncConfig } from './validate.js'
import { CODESYNC_CHANNELS, type LogEntry, type StartSyncResult, type SyncStatus } from './api.js'

export interface CodeSyncConfigStore {
  load: () => CodeSyncConfig
  save: (partial: Partial<CodeSyncConfig>) => void
}

export interface RegisterCodeSyncOptions {
  ipcMain: IpcMain
  store: CodeSyncConfigStore
  /** Opens a native folder picker; returns the chosen path or null when cancelled. */
  pickFolder: () => Promise<string | null>
  /** Forwards a sync log line to whichever window shows the Code Sync UI. */
  sendLog: (entry: LogEntry) => void
}

export interface CodeSyncHandle {
  manager: SyncManager
  /** Removes all registered handlers and stops every running sync. */
  dispose: () => void
}

/**
 * Wires the Code Sync engine into an existing Electron `ipcMain`. The host app owns the
 * window, the persistence store, and the folder dialog, so the engine stays UI-agnostic
 * and the SyncManager singleton is shared across the app lifetime.
 */
export function registerCodeSyncIpc(opts: RegisterCodeSyncOptions): CodeSyncHandle {
  const { ipcMain, store, pickFolder, sendLog } = opts
  const manager = new SyncManager((instanceId, line) => sendLog({ instanceId, line }))

  ipcMain.handle(CODESYNC_CHANNELS.pickFolder, () => pickFolder())

  ipcMain.handle(CODESYNC_CHANNELS.configLoad, (): CodeSyncConfig => store.load())

  ipcMain.handle(CODESYNC_CHANNELS.configSave, (_e, payload: unknown) => {
    store.save(validateConfigSave(payload))
  })

  ipcMain.handle(
    CODESYNC_CHANNELS.syncStart,
    async (_e, payload: unknown): Promise<StartSyncResult> => {
      try {
        const v = await validateSyncStart(payload)
        const { instanceId, ...rest } = v
        await manager.start(instanceId, rest)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcMain.handle(CODESYNC_CHANNELS.syncStop, (_e, instanceId: unknown): StartSyncResult => {
    if (typeof instanceId !== 'string' || instanceId.length < 1) {
      return { ok: false, error: 'Invalid instance id' }
    }
    manager.stop(instanceId)
    return { ok: true }
  })

  ipcMain.handle(CODESYNC_CHANNELS.syncStatus, (): SyncStatus => ({
    instances: manager.listStatus()
  }))

  const dispose = (): void => {
    manager.stopAll()
    ipcMain.removeHandler(CODESYNC_CHANNELS.pickFolder)
    ipcMain.removeHandler(CODESYNC_CHANNELS.configLoad)
    ipcMain.removeHandler(CODESYNC_CHANNELS.configSave)
    ipcMain.removeHandler(CODESYNC_CHANNELS.syncStart)
    ipcMain.removeHandler(CODESYNC_CHANNELS.syncStop)
    ipcMain.removeHandler(CODESYNC_CHANNELS.syncStatus)
  }

  return { manager, dispose }
}
