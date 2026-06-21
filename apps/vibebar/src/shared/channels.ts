/**
 * Single source of truth for every IPC channel. The main process registers handlers only
 * for channels in this map and rejects anything else (see security/validateIpc.ts), so the
 * renderer surface stays small and auditable.
 */
export const CH = {
  overlayGetState: 'overlay:getState',
  overlaySetDock: 'overlay:setDock',
  overlaySetPanel: 'overlay:setPanel',
  overlayLayout: 'overlay:layout',

  projectSelect: 'project:select',
  projectGet: 'project:get',
  projectChanged: 'project:changed',
  projectAddContextFolder: 'project:addContextFolder',
  projectOpenContextFolder: 'project:openContextFolder',

  promptsList: 'prompts:list',
  promptsPreview: 'prompts:preview',
  promptsCopy: 'prompts:copy',
  promptsToggleFavorite: 'prompts:toggleFavorite',
  promptsCreate: 'prompts:create',
  promptsDelete: 'prompts:delete',
  promptsNewDraft: 'prompts:newDraft',
  promptsHistory: 'prompts:history',
  promptsSetGuardrails: 'prompts:setGuardrails',

  scannerScan: 'scanner:scan',
  scannerCopyRedacted: 'scanner:copyRedacted',

  packerTree: 'packer:tree',
  packerPack: 'packer:pack',

  clipboardWrite: 'clipboard:write',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsDisplays: 'settings:displays',

  codesyncToggle: 'codesync:toggle',
  codesyncHide: 'codesync:hide',

  // Prompt Library floating overlay (detached menu). Toggling also hides it when visible.
  promptLibraryToggle: 'promptLibrary:toggle',

  // Smart Terminal
  terminalToggle: 'terminal:toggle',
  terminalRun: 'terminal:run',
  terminalCancel: 'terminal:cancel',
  terminalClear: 'terminal:clear',
  terminalGetState: 'terminal:getState',
  terminalHide: 'terminal:hide',
  terminalIsOpen: 'terminal:isOpen',
  terminalData: 'terminal:data',
  terminalStatus: 'terminal:status',
  terminalIssues: 'terminal:issues',
  terminalVisibility: 'terminal:visibility',

  // Built-in interactive shell (cmd/PowerShell) inside the Smart Terminal
  shellStart: 'shell:start',
  shellInput: 'shell:input',
  shellSetShell: 'shell:setShell',
  shellStop: 'shell:stop',
  shellProjectCommands: 'shell:projectCommands',
  shellData: 'shell:data',
  shellReady: 'shell:ready',
  shellClosed: 'shell:closed',

  // Security Audit
  auditRun: 'audit:run',
  auditScan: 'audit:scan',
  auditRunInTerminal: 'audit:runInTerminal',

  // GitHub Desktop + live change tracking
  githubOpen: 'github:open',
  gitStatus: 'git:status',
  gitStatusChanged: 'git:statusChanged',

  appQuit: 'app:quit'
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]

/** Channels the renderer is allowed to invoke via ipcRenderer.invoke. */
export const INVOKABLE_CHANNELS: readonly string[] = [
  CH.overlayGetState,
  CH.overlaySetDock,
  CH.overlaySetPanel,
  CH.projectSelect,
  CH.projectGet,
  CH.projectAddContextFolder,
  CH.projectOpenContextFolder,
  CH.promptsList,
  CH.promptsPreview,
  CH.promptsCopy,
  CH.promptsToggleFavorite,
  CH.promptsCreate,
  CH.promptsDelete,
  CH.promptsNewDraft,
  CH.promptsHistory,
  CH.promptsSetGuardrails,
  CH.scannerScan,
  CH.scannerCopyRedacted,
  CH.packerTree,
  CH.packerPack,
  CH.clipboardWrite,
  CH.settingsGet,
  CH.settingsSave,
  CH.settingsDisplays,
  CH.codesyncToggle,
  CH.codesyncHide,
  CH.promptLibraryToggle,
  CH.terminalToggle,
  CH.terminalRun,
  CH.terminalCancel,
  CH.terminalClear,
  CH.terminalGetState,
  CH.terminalHide,
  CH.terminalIsOpen,
  CH.shellStart,
  CH.shellInput,
  CH.shellSetShell,
  CH.shellStop,
  CH.shellProjectCommands,
  CH.auditRun,
  CH.auditScan,
  CH.auditRunInTerminal,
  CH.githubOpen,
  CH.gitStatus,
  CH.appQuit
]

/** Channels the main process pushes to the renderer via webContents.send. */
export const PUSH_CHANNELS: readonly string[] = [
  CH.overlayLayout,
  CH.projectChanged,
  CH.terminalData,
  CH.terminalStatus,
  CH.terminalIssues,
  CH.terminalVisibility,
  CH.shellData,
  CH.shellReady,
  CH.shellClosed,
  CH.gitStatusChanged
]
