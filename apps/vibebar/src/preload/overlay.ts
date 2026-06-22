import { contextBridge, ipcRenderer } from 'electron'
import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import type { ErrorReport, VibeBarApi } from '@shared/api.js'
import { CH } from '@shared/channels.js'
import type {
  DockSide,
  GitStatus,
  OverlayLayout,
  ProjectProfile,
  QuickLaunchApp,
  VibeSettings
} from '@shared/types.js'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VibeBarApi = {
  overlay: {
    getState: () => ipcRenderer.invoke(CH.overlayGetState),
    setDock: (dock: DockSide) => ipcRenderer.invoke(CH.overlaySetDock, { dock }),
    setPanel: (open: boolean) => ipcRenderer.invoke(CH.overlaySetPanel, { open }),
    onLayout: (cb: (layout: OverlayLayout) => void) => subscribe(CH.overlayLayout, cb)
  },
  project: {
    select: () => ipcRenderer.invoke(CH.projectSelect),
    get: () => ipcRenderer.invoke(CH.projectGet),
    addContextFolder: () => ipcRenderer.invoke(CH.projectAddContextFolder),
    openContextFolder: () => ipcRenderer.invoke(CH.projectOpenContextFolder),
    onChanged: (cb: (profile: ProjectProfile | null) => void) => subscribe(CH.projectChanged, cb)
  },
  prompts: {
    list: () => ipcRenderer.invoke(CH.promptsList),
    preview: (promptId: string, guardrails?: boolean) =>
      ipcRenderer.invoke(CH.promptsPreview, { promptId, guardrails }),
    copy: (promptId: string) => ipcRenderer.invoke(CH.promptsCopy, { promptId }),
    toggleFavorite: (promptId: string) =>
      ipcRenderer.invoke(CH.promptsToggleFavorite, { promptId }),
    create: (template: PromptTemplate) => ipcRenderer.invoke(CH.promptsCreate, { template }),
    remove: (promptId: string) => ipcRenderer.invoke(CH.promptsDelete, { promptId }),
    newDraft: (category: PromptCategory) => ipcRenderer.invoke(CH.promptsNewDraft, { category }),
    history: () => ipcRenderer.invoke(CH.promptsHistory),
    setGuardrails: (enabled: boolean) => ipcRenderer.invoke(CH.promptsSetGuardrails, { enabled })
  },
  scanner: {
    scan: (text: string) => ipcRenderer.invoke(CH.scannerScan, { text }),
    copyRedacted: (text: string) => ipcRenderer.invoke(CH.scannerCopyRedacted, { text })
  },
  packer: {
    tree: (dir: string) => ipcRenderer.invoke(CH.packerTree, { dir }),
    pack: (paths: string[]) => ipcRenderer.invoke(CH.packerPack, { paths })
  },
  clipboard: {
    write: (text: string) => ipcRenderer.invoke(CH.clipboardWrite, { text })
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    save: (partial: Partial<VibeSettings>) => ipcRenderer.invoke(CH.settingsSave, partial),
    displays: () => ipcRenderer.invoke(CH.settingsDisplays)
  },
  codesync: {
    toggle: () => ipcRenderer.invoke(CH.codesyncToggle)
  },
  panel: {
    detach: (panelId) => ipcRenderer.invoke(CH.panelDetach, { panelId })
  },
  terminal: {
    toggle: () => ipcRenderer.invoke(CH.terminalToggle),
    isOpen: () => ipcRenderer.invoke(CH.terminalIsOpen),
    onVisibility: (cb: (state: { visible: boolean }) => void) =>
      subscribe(CH.terminalVisibility, cb)
  },
  audit: {
    run: () => ipcRenderer.invoke(CH.auditRun),
    scan: () => ipcRenderer.invoke(CH.auditScan)
  },
  github: {
    open: () => ipcRenderer.invoke(CH.githubOpen)
  },
  snip: {
    start: () => ipcRenderer.invoke(CH.snipStart),
    getCapture: () => ipcRenderer.invoke(CH.snipGetCapture),
    save: (dataUrl: string, fileName?: string) =>
      ipcRenderer.invoke(CH.snipSave, { dataUrl, fileName }),
    cancel: () => ipcRenderer.invoke(CH.snipCancel)
  },
  git: {
    getStatus: () => ipcRenderer.invoke(CH.gitStatus),
    onStatusChanged: (cb: (status: GitStatus) => void) => subscribe(CH.gitStatusChanged, cb)
  },
  errors: {
    report: (report: ErrorReport) => ipcRenderer.invoke(CH.errorsReport, { report }),
    clear: () => ipcRenderer.invoke(CH.errorsClear),
    close: () => ipcRenderer.invoke(CH.errorsClose),
    onPush: (cb: (reports: ErrorReport[]) => void) => subscribe(CH.errorsPush, cb)
  },
  quickLaunch: {
    list: () => ipcRenderer.invoke(CH.quickLaunchList),
    run: (id: string) => ipcRenderer.invoke(CH.quickLaunchRun, { id }),
    add: () => ipcRenderer.invoke(CH.quickLaunchAdd),
    remove: (id: string) => ipcRenderer.invoke(CH.quickLaunchRemove, { id }),
    locate: (id: string) => ipcRenderer.invoke(CH.quickLaunchLocate, { id }),
    setVisible: (id: string, visible: boolean) =>
      ipcRenderer.invoke(CH.quickLaunchSetVisible, { id, visible }),
    onChanged: (cb: (apps: QuickLaunchApp[]) => void) => subscribe(CH.quickLaunchChanged, cb)
  },
  app: {
    quit: () => ipcRenderer.invoke(CH.appQuit),
    confirmQuit: () => ipcRenderer.invoke(CH.appConfirmQuit),
    cancelQuit: () => ipcRenderer.invoke(CH.appCancelQuit)
  }
}

contextBridge.exposeInMainWorld('vibebar', api)
