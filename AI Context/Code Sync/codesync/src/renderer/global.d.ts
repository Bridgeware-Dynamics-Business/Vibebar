export {}

declare global {
  interface Window {
    codesync: {
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
        instances: Array<{ id: string; sourcePath: string; syncPath: string }>
        ignoreText: string
        maxFileBytes: number | null
        debounceMs: number
      }>
      saveConfig: (cfg: Record<string, unknown>) => Promise<void>
      onLog: (cb: (entry: { instanceId: string; line: string }) => void) => () => void
    }
  }
}
