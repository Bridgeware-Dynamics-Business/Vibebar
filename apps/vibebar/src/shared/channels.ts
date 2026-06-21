import { CODESYNC_CHANNELS } from '@vibebar/codesync/api'

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

  // Detached panel windows (popped-out menus). One floating, always-on-top window per panel;
  // toggling also hides it when visible, so the detached window's own close button reuses this.
  panelDetach: 'panel:detach',

  // Smart Terminal
  terminalToggle: 'terminal:toggle',
  terminalRun: 'terminal:run',
  terminalCancel: 'terminal:cancel',
  terminalClear: 'terminal:clear',
  terminalGetState: 'terminal:getState',
  terminalHide: 'terminal:hide',
  terminalIsOpen: 'terminal:isOpen',
  // Custom resize: the window is frameless + transparent (no OS resize border on Windows), so
  // the renderer drives resizing from its own edge grips through these channels.
  terminalResizeStart: 'terminal:resizeStart',
  terminalResize: 'terminal:resize',
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

  // Snip to AI Context — drag-select a screen region, preview, then save it to the AI context
  // folder and hand back a ready-to-paste prompt referencing the image.
  snipStart: 'snip:start',
  snipGetCapture: 'snip:getCapture',
  snipSave: 'snip:save',
  snipCancel: 'snip:cancel',

  // GitHub Desktop + live change tracking
  githubOpen: 'github:open',
  gitStatus: 'git:status',
  gitStatusChanged: 'git:statusChanged',

  // In-app error console — a renderer reports a captured (already-redacted) runtime error; the
  // console window receives the live list and asks main to clear/close itself.
  errorsReport: 'errors:report',
  errorsClear: 'errors:clear',
  errorsClose: 'errors:close',
  errorsPush: 'errors:push',

  // Quick Launch — one-click external editor/app launchers (Cursor, Codex, custom)
  quickLaunchList: 'quickLaunch:list',
  quickLaunchRun: 'quickLaunch:run',
  quickLaunchAdd: 'quickLaunch:add',
  quickLaunchRemove: 'quickLaunch:remove',
  quickLaunchLocate: 'quickLaunch:locate',
  quickLaunchChanged: 'quickLaunch:changed',

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
  CH.panelDetach,
  CH.terminalToggle,
  CH.terminalRun,
  CH.terminalCancel,
  CH.terminalClear,
  CH.terminalGetState,
  CH.terminalHide,
  CH.terminalIsOpen,
  CH.terminalResizeStart,
  CH.terminalResize,
  CH.shellStart,
  CH.shellInput,
  CH.shellSetShell,
  CH.shellStop,
  CH.shellProjectCommands,
  CH.auditRun,
  CH.auditScan,
  CH.auditRunInTerminal,
  CH.snipStart,
  CH.snipGetCapture,
  CH.snipSave,
  CH.snipCancel,
  CH.githubOpen,
  CH.gitStatus,
  CH.errorsReport,
  CH.errorsClear,
  CH.errorsClose,
  CH.quickLaunchList,
  CH.quickLaunchRun,
  CH.quickLaunchAdd,
  CH.quickLaunchRemove,
  CH.quickLaunchLocate,
  CH.appQuit,
  // Code Sync runs its own IPC registry (packages/codesync) with its own payload validation
  // (validateSyncStart / validateConfigSave). Its invokable channels are mirrored here so this
  // allowlist remains the single, complete record of every channel the renderer can invoke.
  CODESYNC_CHANNELS.pickFolder,
  CODESYNC_CHANNELS.configLoad,
  CODESYNC_CHANNELS.configSave,
  CODESYNC_CHANNELS.syncStart,
  CODESYNC_CHANNELS.syncStop,
  CODESYNC_CHANNELS.syncStatus,
  // The detached Code Sync window hides itself via this dedicated channel (see preload/codesync).
  'codesync:hide'
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
  CH.gitStatusChanged,
  CH.quickLaunchChanged,
  CH.errorsPush,
  CODESYNC_CHANNELS.log
]
