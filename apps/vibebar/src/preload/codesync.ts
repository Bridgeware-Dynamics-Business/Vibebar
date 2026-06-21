import { contextBridge, ipcRenderer } from 'electron'
import {
  CODESYNC_CHANNELS,
  type CodeSyncApi,
  type CodeSyncConfig,
  type LogEntry,
  type StartSyncPayload
} from '@vibebar/codesync/api'

const api: CodeSyncApi = {
  pickFolder: () => ipcRenderer.invoke(CODESYNC_CHANNELS.pickFolder),
  startSync: (payload: StartSyncPayload) => ipcRenderer.invoke(CODESYNC_CHANNELS.syncStart, payload),
  stopSync: (instanceId: string) => ipcRenderer.invoke(CODESYNC_CHANNELS.syncStop, instanceId),
  syncStatus: () => ipcRenderer.invoke(CODESYNC_CHANNELS.syncStatus),
  loadConfig: () => ipcRenderer.invoke(CODESYNC_CHANNELS.configLoad),
  saveConfig: (cfg: Partial<CodeSyncConfig>) => ipcRenderer.invoke(CODESYNC_CHANNELS.configSave, cfg),
  onLog: (cb: (entry: LogEntry) => void) => {
    const handler = (_event: unknown, entry: LogEntry): void => {
      if (entry && typeof entry.instanceId === 'string' && typeof entry.line === 'string') cb(entry)
    }
    ipcRenderer.on(CODESYNC_CHANNELS.log, handler)
    return () => ipcRenderer.removeListener(CODESYNC_CHANNELS.log, handler)
  }
}

contextBridge.exposeInMainWorld('codesync', api)

// Window-control bridge for the floating overlay (hide back into the toolbar). Channel is
// inlined to keep this preload self-contained (no shared chunk that sandbox can't require).
contextBridge.exposeInMainWorld('codesyncWindow', {
  hide: () => ipcRenderer.invoke('codesync:hide')
})
