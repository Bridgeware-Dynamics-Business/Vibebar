import { contextBridge, ipcRenderer } from 'electron'
import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import type { ErrorReport, VibeBarApi } from '@shared/api.js'
import type { ResourceSnapshot } from '@shared/types.js'
import { CH } from '@shared/channels.js'
import type { DetachablePanelId } from '@shared/tools.js'
import type {
  DockSide,
  GitStatus,
  NotesState,
  OverlayLayout,
  ProjectProfile,
  QuickLaunchApp,
  SessionAppendInput,
  SessionState,
  IntentContract,
  McpServerStatus,
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
    setPanel: (open: boolean, panelId?: DetachablePanelId) =>
      ipcRenderer.invoke(CH.overlaySetPanel, { open, panelId }),
    resetToolbar: () => ipcRenderer.invoke(CH.overlayResetToolbar),
    collapsePanel: () => ipcRenderer.invoke(CH.overlayCollapsePanel),
    setCommandPalette: (open: boolean) =>
      ipcRenderer.invoke(CH.overlaySetCommandPalette, { open }),
    setActive: () => ipcRenderer.invoke(CH.overlaySetActive),
    dragBegin: () => ipcRenderer.invoke(CH.overlayDragBegin),
    dragEnd: (cursor: { x: number; y: number }) =>
      ipcRenderer.invoke(CH.overlayDragEnd, cursor),
    layoutReady: () => ipcRenderer.invoke(CH.overlayLayoutReady),
    onLayout: (cb: (layout: OverlayLayout) => void) => subscribe(CH.overlayLayout, cb),
    onCommandPalette: (cb: (state: { open: boolean }) => void) =>
      subscribe(CH.overlayCommandPalette, cb)
  },
  project: {
    select: () => ipcRenderer.invoke(CH.projectSelect),
    get: () => ipcRenderer.invoke(CH.projectGet),
    listRecents: () => ipcRenderer.invoke(CH.projectListRecents),
    openRecent: (path: string) => ipcRenderer.invoke(CH.projectOpenRecent, { path }),
    addContextFolder: () => ipcRenderer.invoke(CH.projectAddContextFolder),
    openContextFolder: () => ipcRenderer.invoke(CH.projectOpenContextFolder),
    getAiDocs: () => ipcRenderer.invoke(CH.projectGetAiDocs),
    appendAgentsMd: (markdown: string) => ipcRenderer.invoke(CH.projectAppendAgentsMd, { markdown }),
    getMemoryDiff: () => ipcRenderer.invoke(CH.projectGetMemoryDiff),
    getStackOverrides: () => ipcRenderer.invoke(CH.projectGetStackOverrides),
    saveStackOverrides: (overrides: import('@shared/types.js').ProjectStackOverrides) =>
      ipcRenderer.invoke(CH.projectSaveStackOverrides, overrides),
    clearStackOverrides: () => ipcRenderer.invoke(CH.projectClearStackOverrides),
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
    pack: (paths: string[], tier?: import('@shared/contextPackTier.js').ContextPackTier) =>
      ipcRenderer.invoke(CH.packerPack, { paths, tier }),
    previewChanged: () => ipcRenderer.invoke(CH.packerPreviewChanged),
    packChanged: (tier?: import('@shared/contextPackTier.js').ContextPackTier) =>
      ipcRenderer.invoke(CH.packerPackChanged, { tier }),
    presetPaths: (preset: 'tests' | 'config' | 'entry') =>
      ipcRenderer.invoke(CH.packerPresetPaths, { preset })
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
    getHints: () => ipcRenderer.invoke(CH.terminalGetHints),
    onVisibility: (cb: (state: { visible: boolean }) => void) =>
      subscribe(CH.terminalVisibility, cb)
  },
  audit: {
    run: () => ipcRenderer.invoke(CH.auditRun),
    scan: () => ipcRenderer.invoke(CH.auditScan),
    exportSarif: () => ipcRenderer.invoke(CH.auditExportSarif),
    exportMarkdown: () => ipcRenderer.invoke(CH.auditExportMarkdown),
    getConfig: () => ipcRenderer.invoke(CH.auditGetConfig),
    acceptRisk: (fingerprint: string) => ipcRenderer.invoke(CH.auditAcceptRisk, { fingerprint }),
    setRuleDisabled: (ruleId: string, disabled: boolean) =>
      ipcRenderer.invoke(CH.auditSetRuleDisabled, { ruleId, disabled })
  },
  github: {
    open: () => ipcRenderer.invoke(CH.githubOpen),
    getDesktopPath: () => ipcRenderer.invoke(CH.githubGetDesktopPath),
    setDesktopPath: (path: string) => ipcRenderer.invoke(CH.githubSetDesktopPath, { path }),
    locateDesktop: () => ipcRenderer.invoke(CH.githubLocateDesktop)
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
    onStatusChanged: (cb: (status: GitStatus) => void) => subscribe(CH.gitStatusChanged, cb),
    copyDiffPrompt: () => ipcRenderer.invoke(CH.gitCopyDiffPrompt),
    changedFiles: () => ipcRenderer.invoke(CH.gitChangedFiles)
  },
  readyCheck: {
    get: () => ipcRenderer.invoke(CH.readyCheckGet),
    copyReviewPrompt: () => ipcRenderer.invoke(CH.readyCheckCopyReviewPrompt),
    copyUntrackedSummary: () => ipcRenderer.invoke(CH.readyCheckCopyUntrackedSummary),
    copyDependencyReview: () => ipcRenderer.invoke(CH.readyCheckCopyDependencyReview),
    copyRegressionContext: () => ipcRenderer.invoke(CH.readyCheckCopyRegressionContext)
  },
  notes: {
    getState: () => ipcRenderer.invoke(CH.notesGetState),
    init: (projectName: string, addToGitignore: boolean) =>
      ipcRenderer.invoke(CH.notesInit, { projectName, addToGitignore }),
    create: (title: string) => ipcRenderer.invoke(CH.notesCreate, { title }),
    read: (id: string) => ipcRenderer.invoke(CH.notesRead, { id }),
    save: (id: string, title: string, markdown: string) =>
      ipcRenderer.invoke(CH.notesSave, { id, title, markdown }),
    remove: (id: string) => ipcRenderer.invoke(CH.notesDelete, { id }),
    setProjectName: (projectName: string) =>
      ipcRenderer.invoke(CH.notesSetProjectName, { projectName }),
    popOut: (id: string) => ipcRenderer.invoke(CH.notesPopOut, { id }),
    appendMarkdown: (id: string, markdown: string) =>
      ipcRenderer.invoke(CH.notesAppendMarkdown, { id, markdown }),
    findSessionLog: () => ipcRenderer.invoke(CH.notesFindSessionLog),
    onChanged: (cb: (state: NotesState) => void) => subscribe(CH.notesChanged, cb)
  },
  session: {
    getState: () => ipcRenderer.invoke(CH.sessionGetState),
    append: (entry: SessionAppendInput) => ipcRenderer.invoke(CH.sessionAppend, entry),
    togglePin: (id: string) => ipcRenderer.invoke(CH.sessionTogglePin, { id }),
    clear: () => ipcRenderer.invoke(CH.sessionClear),
    copyHandoff: (includeGitDiff?: boolean, pinRecentIfEmpty?: number) =>
      ipcRenderer.invoke(CH.sessionCopyHandoff, { includeGitDiff, pinRecentIfEmpty }),
    copyFixPrompts: () => ipcRenderer.invoke(CH.sessionCopyFixPrompts),
    setIntent: (intent: Omit<IntentContract, 'updatedAt'>) =>
      ipcRenderer.invoke(CH.sessionSetIntent, intent),
    clearIntent: () => ipcRenderer.invoke(CH.sessionClearIntent),
    rerunVerify: (entryId: string) => ipcRenderer.invoke(CH.sessionRerunVerify, { entryId }),
    onChanged: (cb: (state: SessionState) => void) => subscribe(CH.sessionChanged, cb)
  },
  errors: {
    report: (report: ErrorReport) => ipcRenderer.invoke(CH.errorsReport, { report }),
    clear: () => ipcRenderer.invoke(CH.errorsClear),
    close: () => ipcRenderer.invoke(CH.errorsClose),
    onPush: (cb: (reports: ErrorReport[]) => void) => subscribe(CH.errorsPush, cb)
  },
  resources: {
    onPush: (cb: (snapshot: ResourceSnapshot) => void) => subscribe(CH.resourcesPush, cb)
  },
  quickLaunch: {
    list: () => ipcRenderer.invoke(CH.quickLaunchList),
    run: (id: string, options?: { pasteAfterOpen?: boolean; fromCopyToast?: boolean }) =>
      ipcRenderer.invoke(CH.quickLaunchRun, { id, ...options }),
    prepareCursor: () => ipcRenderer.invoke(CH.quickLaunchPrepareCursor),
    add: () => ipcRenderer.invoke(CH.quickLaunchAdd),
    remove: (id: string) => ipcRenderer.invoke(CH.quickLaunchRemove, { id }),
    locate: (id: string) => ipcRenderer.invoke(CH.quickLaunchLocate, { id }),
    setVisible: (id: string, visible: boolean) =>
      ipcRenderer.invoke(CH.quickLaunchSetVisible, { id, visible }),
    onChanged: (cb: (apps: QuickLaunchApp[]) => void) => subscribe(CH.quickLaunchChanged, cb)
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke(CH.mcpGetStatus),
    onChanged: (cb: (status: McpServerStatus) => void) => subscribe(CH.mcpChanged, cb)
  },
  agentCompanion: {
    getState: () => ipcRenderer.invoke(CH.agentCompanionGetState),
    toggleDrawer: () => ipcRenderer.invoke(CH.agentCompanionToggleDrawer),
    setDrawerOpen: (open: boolean) =>
      ipcRenderer.invoke(CH.agentCompanionSetDrawerOpen, { open }),
    connect: () => ipcRenderer.invoke(CH.agentCompanionConnect),
    disconnect: () => ipcRenderer.invoke(CH.agentCompanionDisconnect),
    sendPrompt: (text: string) => ipcRenderer.invoke(CH.agentCompanionSendPrompt, { text }),
    cancel: () => ipcRenderer.invoke(CH.agentCompanionCancel),
    setMode: (mode: import('@shared/agentCompanionApi.js').AgentCompanionMode) =>
      ipcRenderer.invoke(CH.agentCompanionSetMode, { mode }),
    setModel: (modelId: string) => ipcRenderer.invoke(CH.agentCompanionSetModel, { modelId }),
    listModels: () => ipcRenderer.invoke(CH.agentCompanionListModels),
    newChat: () => ipcRenderer.invoke(CH.agentCompanionNewChat),
    selectChat: (chatId: string) => ipcRenderer.invoke(CH.agentCompanionSelectChat, { chatId }),
    deleteChat: (chatId: string) => ipcRenderer.invoke(CH.agentCompanionDeleteChat, { chatId }),
    pickChatHistoryDirectory: () => ipcRenderer.invoke(CH.agentCompanionPickHistoryDir),
    respondPermission: (optionId: string) =>
      ipcRenderer.invoke(CH.agentCompanionRespondPermission, { optionId }),
    respondQuestion: (answers: Array<{ questionId: string; selectedOptionIds: string[] }>) =>
      ipcRenderer.invoke(CH.agentCompanionRespondQuestion, { answers }),
    skipQuestion: () => ipcRenderer.invoke(CH.agentCompanionSkipQuestion),
    onState: (cb: (state: import('@shared/agentCompanionApi.js').AgentCompanionState) => void) =>
      subscribe(CH.agentCompanionState, cb)
  },
  app: {
    quit: () => ipcRenderer.invoke(CH.appQuit),
    getOnboardingState: () => ipcRenderer.invoke(CH.appGetOnboardingState),
    completeOnboarding: () => ipcRenderer.invoke(CH.appCompleteOnboarding),
    showOnboardingAgain: () => ipcRenderer.invoke(CH.appShowOnboardingAgain),
    confirmQuit: () => ipcRenderer.invoke(CH.appConfirmQuit),
    cancelQuit: () => ipcRenderer.invoke(CH.appCancelQuit)
  }
}

contextBridge.exposeInMainWorld('vibebar', api)
