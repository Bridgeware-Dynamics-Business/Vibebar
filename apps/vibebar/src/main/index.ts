import { app, dialog, session } from 'electron'
import { CH } from '@shared/channels.js'
import { AuditService } from './audit/AuditService.js'
import { CodeSyncController } from './codesync/CodeSyncController.js'
import { ErrorConsoleController } from './errorconsole/ErrorConsoleController.js'
import { GitStatusService } from './git/GitStatusService.js'
import { GitDiffService } from './git/GitDiffService.js'
import { GitHubService } from './github/GitHubService.js'
import { HotkeyController } from './hotkeys/HotkeyController.js'
import { registerIpc } from './ipc/registerIpc.js'
import { ConfirmQuitController } from './overlay/ConfirmQuitController.js'
import { DetachedPanelController } from './overlay/DetachedPanelController.js'
import { OverlayManager } from './overlay/OverlayManager.js'
import { NoteWindowController } from './notes/NoteWindowController.js'
import { NotesService } from './notes/NotesService.js'
import { ProjectService } from './project/ProjectService.js'
import { PromptStore } from './prompts/PromptStore.js'
import { QuickLaunchService } from './quicklaunch/QuickLaunchService.js'
import { AppStore } from './settings/store.js'
import { SnipController } from './snip/SnipController.js'
import { TerminalController } from './terminal/TerminalController.js'
import { TrayController } from './tray/TrayController.js'
import { SessionService } from './session/SessionService.js'
import { FlightRecorderService } from './session/FlightRecorderService.js'
import { VerifyLoopService } from './session/VerifyLoopService.js'
import { ReadyCheckService } from './readyCheck/ReadyCheckService.js'
import { McpServerController } from './mcp/McpServerController.js'

const store = new AppStore()
const projects = new ProjectService(store)
const prompts = new PromptStore(store, projects)
const overlay = new OverlayManager(store)
const codesync = new CodeSyncController(store)
const detachedPanels = new DetachedPanelController(store)
const confirmQuit = new ConfirmQuitController()
const tray = new TrayController(overlay, detachedPanels)
const sessionService = new SessionService(projects)
const gitDiff = new GitDiffService(projects)
let flightRecorder: FlightRecorderService
let verifyLoop: VerifyLoopService
const terminal = new TerminalController(
  store,
  projects,
  (visible) => overlay.broadcast(CH.terminalVisibility, { visible }),
  (result) => {
    void (async () => {
      const profile = projects.getProfile()
      await flightRecorder?.recordCommand(result.command, result.exitCode, result, profile)
      await verifyLoop?.onCommandComplete(
        result.command,
        result.exitCode,
        result.output,
        profile
      )
      const state = await sessionService.getState()
      overlay.broadcast(CH.sessionChanged, state)
      detachedPanels.send(CH.sessionChanged, state)
    })()
  }
)
flightRecorder = new FlightRecorderService(sessionService, gitDiff)
verifyLoop = new VerifyLoopService(sessionService, projects)
const audit = new AuditService(projects)
const github = new GitHubService(store)
const gitStatus = new GitStatusService(projects, (status) =>
  overlay.broadcast(CH.gitStatusChanged, status)
)
const quickLaunch = new QuickLaunchService(store)
const hotkeys = new HotkeyController(store, overlay, terminal)
const snip = new SnipController(projects)
const errorConsole = new ErrorConsoleController(store)
const notes = new NotesService(projects)
const readyCheck = new ReadyCheckService(projects, audit, terminal, gitDiff, sessionService, store)
const mcp = new McpServerController({
  projects,
  session: sessionService,
  audit,
  readyCheck,
  gitDiff,
  gitStatus,
  store,
  terminal
})
const noteWindows = new NoteWindowController(store)

// A rejected promise with no handler would otherwise vanish silently; log it so a failure in any
// background task (a mirror pass, a git refresh) is at least diagnosable rather than invisible.
process.on('unhandledRejection', (reason) => {
  console.error('VibeBar unhandled rejection:', reason)
})

async function bootstrap(): Promise<void> {
  // Strict CSP for the packaged app. Skipped in dev so Vite HMR (eval, ws) keeps working.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'self'; connect-src 'self'"
          ]
        }
      })
    })
  }

  await projects.init()
  codesync.register()
  registerIpc({
    store,
    overlay,
    projects,
    prompts,
    codesync,
    detachedPanels,
    confirmQuit,
    terminal,
    audit,
    github,
    gitStatus,
    gitDiff,
    quickLaunch,
    snip,
    errorConsole,
    notes,
    noteWindows,
    session: sessionService,
    readyCheck,
    flightRecorder,
    verifyLoop,
    hotkeys,
    mcp
  })
  try {
    await mcp.syncFromSettings()
  } catch (err) {
    console.error('[VibeBar] MCP server failed to start:', err)
  }
  overlay.start()
  overlay.collapseAllPanels()
  overlay.restoreAndFocus()
  const winCount = overlay.windowCount()
  console.log(`[VibeBar] Toolbar windows: ${winCount}`)
  if (winCount === 0) {
    console.error('[VibeBar] No overlay windows created — check display settings.')
  }
  tray.start()
  hotkeys.start()
  gitStatus.setProject(projects.getProfile())
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Dev relaunch: the prior instance may have hidden the toolbar or be on a stale vite port.
  app.on('second-instance', () => {
    overlay.collapseAllPanels()
    overlay.restoreAndFocus()
    if (!app.isPackaged) overlay.reloadAll()
  })

  app.whenReady()
    .then(bootstrap)
    .catch((err: unknown) => {
      // Startup is the one place a thrown error leaves the user with a blank, frozen overlay and
      // no way to recover. Surface it explicitly and quit rather than hang in a half-wired state.
      const message = err instanceof Error ? err.message : String(err)
      console.error('VibeBar failed to start:', err)
      dialog.showErrorBox('VibeBar failed to start', message)
      app.quit()
    })

  // The always-on-top overlay is the app's home base. Closing the Code Sync window must not
  // quit VibeBar, so we never auto-quit on window-all-closed; the user quits from Settings.
  app.on('window-all-closed', () => {
    /* intentionally keep the process alive */
  })

  app.on('before-quit', () => {
    void mcp.stop()
    overlay.destroy()
    codesync.dispose()
    detachedPanels.dispose()
    confirmQuit.dispose()
    tray.dispose()
    terminal.dispose()
    gitStatus.dispose()
    hotkeys.dispose()
    snip.dispose()
    errorConsole.dispose()
    noteWindows.dispose()
  })
}
