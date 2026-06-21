import { app, dialog, session } from 'electron'
import { CH } from '@shared/channels.js'
import { AuditService } from './audit/AuditService.js'
import { CodeSyncController } from './codesync/CodeSyncController.js'
import { GitStatusService } from './git/GitStatusService.js'
import { GitHubService } from './github/GitHubService.js'
import { registerIpc } from './ipc/registerIpc.js'
import { DetachedPanelController } from './overlay/DetachedPanelController.js'
import { OverlayManager } from './overlay/OverlayManager.js'
import { ProjectService } from './project/ProjectService.js'
import { PromptStore } from './prompts/PromptStore.js'
import { AppStore } from './settings/store.js'
import { TerminalController } from './terminal/TerminalController.js'

const store = new AppStore()
const projects = new ProjectService(store)
const prompts = new PromptStore(store, projects)
const overlay = new OverlayManager(store)
const codesync = new CodeSyncController(store)
const detachedPanels = new DetachedPanelController(store)
const terminal = new TerminalController(store, projects, (visible) =>
  overlay.broadcast(CH.terminalVisibility, { visible })
)
const audit = new AuditService(projects)
const github = new GitHubService(store)
const gitStatus = new GitStatusService(projects, (status) =>
  overlay.broadcast(CH.gitStatusChanged, status)
)

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
    terminal,
    audit,
    github,
    gitStatus
  })
  overlay.start()
  gitStatus.setProject(projects.getProfile())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
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
    overlay.destroy()
    codesync.dispose()
    detachedPanels.dispose()
    terminal.dispose()
    gitStatus.dispose()
  })
}
