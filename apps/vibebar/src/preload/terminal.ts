import { contextBridge, ipcRenderer } from 'electron'
import type { ResizeEdge, TerminalBridge } from '@shared/terminalApi.js'
import type {
  ProjectCommand,
  ShellReady,
  ShellType,
  TerminalIssueUpdate,
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
  resizeStart: 'terminal:resizeStart',
  resize: 'terminal:resize',
  clipboardWrite: 'clipboard:write',
  runAudit: 'audit:runInTerminal',
  exportSarif: 'audit:exportSarif',
  exportMarkdown: 'audit:exportMarkdown',
  quickLaunchRun: 'quickLaunch:run',
  sessionAppend: 'session:append',
  notesGetState: 'notes:getState',
  notesAppendMarkdown: 'notes:appendMarkdown',
  notesFindSessionLog: 'notes:findSessionLog',
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
  resizeStart: () => ipcRenderer.invoke(T.resizeStart),
  resize: (edge: ResizeEdge, dx: number, dy: number) =>
    ipcRenderer.invoke(T.resize, { edge, dx, dy }),
  copy: (text: string) => ipcRenderer.invoke(T.clipboardWrite, { text }),
  runAudit: (quiet: boolean) => ipcRenderer.invoke(T.runAudit, { quiet }),
  exportAuditSarif: () => ipcRenderer.invoke(T.exportSarif),
  exportAuditMarkdown: () => ipcRenderer.invoke(T.exportMarkdown),
  openCursor: () => ipcRenderer.invoke(T.quickLaunchRun, { id: 'cursor' }),
  sessionAppend: (entry) => ipcRenderer.invoke(T.sessionAppend, entry),
  notes: {
    getState: () => ipcRenderer.invoke(T.notesGetState),
    appendMarkdown: (id: string, markdown: string) =>
      ipcRenderer.invoke(T.notesAppendMarkdown, { id, markdown }),
    findSessionLog: () => ipcRenderer.invoke(T.notesFindSessionLog)
  },
  onData: (cb: (chunk: string) => void) => subscribe<string>(T.data, cb),
  onStatus: (cb: (status: TerminalStatus) => void) => subscribe<TerminalStatus>(T.status, cb),
  onIssues: (cb: (update: TerminalIssueUpdate) => void) => subscribe<TerminalIssueUpdate>(T.issues, cb),
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
