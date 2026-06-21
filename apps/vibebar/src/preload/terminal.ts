import { contextBridge, ipcRenderer } from 'electron'
import type { TerminalBridge } from '@shared/terminalApi.js'
import type {
  DetectedIssue,
  ProjectCommand,
  ShellReady,
  ShellType,
  TerminalStatus
} from '@shared/types.js'

/**
 * Channel names are inlined here on purpose. Sandboxed preloads cannot `require` sibling
 * chunks at runtime, and Rollup emits a shared chunk whenever two preload entries import the
 * same module. Keeping this preload free of shared imports guarantees a self-contained file.
 * These strings MUST mirror the matching entries in src/shared/channels.ts.
 */
const T = {
  getState: 'terminal:getState',
  run: 'terminal:run',
  cancel: 'terminal:cancel',
  clear: 'terminal:clear',
  hide: 'terminal:hide',
  clipboardWrite: 'clipboard:write',
  runAudit: 'audit:runInTerminal',
  data: 'terminal:data',
  status: 'terminal:status',
  issues: 'terminal:issues',
  shellStart: 'shell:start',
  shellInput: 'shell:input',
  shellSetShell: 'shell:setShell',
  shellStop: 'shell:stop',
  shellProjectCommands: 'shell:projectCommands',
  shellData: 'shell:data',
  shellReady: 'shell:ready',
  shellClosed: 'shell:closed'
} as const

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: TerminalBridge = {
  getState: () => ipcRenderer.invoke(T.getState),
  run: (command: string) => ipcRenderer.invoke(T.run, { command }),
  cancel: () => ipcRenderer.invoke(T.cancel),
  clear: () => ipcRenderer.invoke(T.clear),
  hide: () => ipcRenderer.invoke(T.hide),
  copy: (text: string) => ipcRenderer.invoke(T.clipboardWrite, { text }),
  runAudit: (quiet: boolean) => ipcRenderer.invoke(T.runAudit, { quiet }),
  onData: (cb: (chunk: string) => void) => subscribe<string>(T.data, cb),
  onStatus: (cb: (status: TerminalStatus) => void) => subscribe<TerminalStatus>(T.status, cb),
  onIssues: (cb: (issues: DetectedIssue[]) => void) => subscribe<DetectedIssue[]>(T.issues, cb),
  shell: {
    start: (shell: ShellType) => ipcRenderer.invoke(T.shellStart, { shell }),
    input: (line: string) => ipcRenderer.invoke(T.shellInput, { line }),
    setShell: (shell: ShellType) => ipcRenderer.invoke(T.shellSetShell, { shell }),
    stop: () => ipcRenderer.invoke(T.shellStop),
    projectCommands: () => ipcRenderer.invoke(T.shellProjectCommands) as Promise<ProjectCommand[]>,
    onData: (cb: (chunk: string) => void) => subscribe<string>(T.shellData, cb),
    onReady: (cb: (ready: ShellReady) => void) => subscribe<ShellReady>(T.shellReady, cb),
    onClosed: (cb: () => void) => subscribe<undefined>(T.shellClosed, () => cb())
  }
}

contextBridge.exposeInMainWorld('terminal', api)
