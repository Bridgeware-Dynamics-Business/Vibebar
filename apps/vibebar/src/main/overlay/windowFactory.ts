import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'
import type { Rect } from './snapLogic.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

function resolvePreload(name: string): string {
  const candidate = join(moduleDir, `../preload/${name}.js`)
  if (existsSync(candidate)) return candidate
  return join(moduleDir, `../preload/${name}.cjs`)
}

function loadEntry(win: BrowserWindow, entry: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/${entry}/index.html`)
  } else {
    void win.loadFile(join(moduleDir, `../renderer/${entry}/index.html`))
  }
}

/** Creates a frameless, transparent, always-on-top toolbar window for one display. */
export function createOverlayWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    type: 'toolbar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Float above normal app windows like a system toolbar.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  loadEntry(win, 'overlay')
  win.once('ready-to-show', () => win.show())
  return win
}

/**
 * Creates the Smart Terminal window: frameless, always-on-top so it overlays other apps,
 * resizable and movable by the user. Its own chrome (drag bar + hide button) lives in the
 * renderer. Starts hidden; the controller shows it on first toggle.
 */
export function createTerminalWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 420,
    minHeight: 280,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreload('terminal'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadEntry(win, 'terminal')
  return win
}

/**
 * Creates the Code Sync companion as a floating overlay: frameless, transparent, and
 * always-on-top so its glass containers appear to hover over the desktop on the side
 * opposite the toolbar (rather than as a conventional window). Its drag bar + hide button
 * live in the renderer. Starts hidden; the controller shows it on first toggle.
 */
export function createCodeSyncWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    type: 'toolbar',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreload('codesync'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadEntry(win, 'codesync')
  return win
}

/**
 * Creates the detached Prompt Library as a floating overlay: frameless, transparent, and
 * always-on-top so it appears to hover beside the toolbar like a menu (mirroring Code Sync).
 * Its drag bar + hide button live in the renderer. Starts hidden; the controller shows it on
 * first toggle.
 */
export function createPromptLibraryWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    type: 'toolbar',
    backgroundColor: '#00000000',
    webPreferences: {
      // Reuses the overlay preload: it already exposes the full `window.vibebar` bridge the
      // panel needs, and the window hides itself via `vibebar.promptLibrary.toggle()`.
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadEntry(win, 'promptlibrary')
  return win
}
