import { contextBridge, ipcRenderer } from 'electron'

export interface SyncInstanceConfig {
  id: string
  sourcePath: string
  syncPath: string
}

export interface CodesyncApi {
  pickFolder: () => Promise<string | null>
  startSync: (payload: {
    instanceId: string
    sourceRoot: string
    destRoot: string
    ignoreText: string
    maxFileBytes: number | null
    debounceMs: number
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  stopSync: (instanceId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  syncStatus: () => Promise<{ instances: Array<{ id: string; running: boolean }> }>
  loadConfig: () => Promise<{
    instances: SyncInstanceConfig[]
    ignoreText: string
    maxFileBytes: number | null
    debounceMs: number
  }>
  saveConfig: (cfg: Record<string, unknown>) => Promise<void>
  onLog: (cb: (entry: { instanceId: string; line: string }) => void) => () => void
}

const api: CodesyncApi = {
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder') as Promise<string | null>,
  startSync: (payload) =>
    ipcRenderer.invoke('sync:start', payload) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  stopSync: (instanceId) =>
    ipcRenderer.invoke('sync:stop', instanceId) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  syncStatus: () =>
    ipcRenderer.invoke('sync:status') as Promise<{
      instances: Array<{ id: string; running: boolean }>
    }>,
  loadConfig: () => ipcRenderer.invoke('config:load') as CodesyncApi['loadConfig'],
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg) as Promise<void>,
  onLog: (cb) => {
    const handler = (_e: unknown, ...args: unknown[]) => {
      if (
        args.length >= 2 &&
        typeof args[0] === 'string' &&
        typeof args[1] === 'string'
      ) {
        cb({ instanceId: args[0], line: args[1] })
        return
      }
      const first = args[0]
      if (
        first &&
        typeof first === 'object' &&
        'instanceId' in first &&
        'line' in first
      ) {
        cb(first as { instanceId: string; line: string })
      }
    }
    ipcRenderer.on('sync:log', handler)
    return () => {
      ipcRenderer.removeListener('sync:log', handler)
    }
  }
}

contextBridge.exposeInMainWorld('codesync', api)
