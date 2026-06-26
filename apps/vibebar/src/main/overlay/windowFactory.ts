import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'
import type { ResourceWidgetId } from '@shared/types.js'
import type { Rect } from './snapLogic.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

function resolvePreload(name: string): string {
  const candidate = join(moduleDir, `../preload/${name}.js`)
  if (existsSync(candidate)) return candidate
  return join(moduleDir, `../preload/${name}.cjs`)
}

/**
 * Locks a window down to its own document. VibeBar is a set of self-contained SPAs that never
 * navigate or spawn child windows, so we deny both: an attempt to `window.open` or to navigate
 * the frame elsewhere (e.g. via injected content) is refused rather than silently followed.
 * HMR in dev uses a websocket, not a top-level navigation, so this does not interfere with it.
 */
function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
}

function loadEntry(win: BrowserWindow, entry: string, query?: Record<string, string>): void {
  const search = query
    ? `?${new URLSearchParams(query).toString()}`
    : ''
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/${entry}/index.html${search}`)
  } else {
    void win.loadFile(join(moduleDir, `../renderer/${entry}/index.html`), {
      search: search || undefined
    })
  }
}

/** Creates a frameless, transparent, always-on-top toolbar window for one display. */
export function createOverlayWindow(
  bounds: Rect,
  onReady: (win: BrowserWindow) => void = (win) => {
    win.show()
  }
): BrowserWindow {
  // MUST stay transparent on Windows so -webkit-app-region: drag works (movable toolbar).
  // Visibility comes from the solid toolbar surface in the renderer (vibe-glass is-solid).
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

  hardenWindow(win)

  // Attach before navigation — ready-to-show must not fire before we listen.
  let readyFired = false
  const fireReady = (): void => {
    if (readyFired || win.isDestroyed()) return
    readyFired = true
    onReady(win)
  }
  win.once('ready-to-show', fireReady)
  win.webContents.once('did-finish-load', () => {
    // Some Windows/GPU configs skip or early-fire ready-to-show; ensure we still appear.
    if (!win.isVisible()) fireReady()
  })

  loadEntry(win, 'overlay')
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
  hardenWindow(win)
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
  hardenWindow(win)
  loadEntry(win, 'codesync')
  return win
}

/**
 * Creates the Snip overlay: a frameless, transparent, always-on-top window sized to exactly cover
 * one display (full bounds, including the taskbar area, so any pixel can be captured). It paints a
 * frozen screenshot the user drags a selection box over, so it must not be movable or resizable.
 * Reuses the overlay preload — it already exposes the full `window.vibebar` bridge, including the
 * `snip` namespace. Starts hidden; the controller shows it once the frame is ready.
 */
export function createSnipWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'snip')
  return win
}

/**
 * Creates the in-app Error Console: a frameless, transparent, always-on-top overlay that floats
 * above every other window (like the toolbar/snip/code-sync) so captured runtime errors are
 * visible no matter what is focused. It is movable (drag bar in the renderer) and lightly
 * resizable. Reuses the overlay preload, which exposes the `errors` bridge. Starts hidden; the
 * controller shows it when the first error arrives.
 */
export function createErrorConsoleWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 240,
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
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'errorconsole')
  return win
}

/**
 * Creates one floating system-resource widget: a tiny, frameless, transparent, always-on-top chip
 * that hovers above every other window (like the toolbar) so a vibe coder can keep an eye on RAM,
 * CPU, disk, or VibeBar's own memory. It is movable (the whole chip is a drag region in the
 * renderer) but not resizable; the controller restores its saved position on launch. The target
 * metric is selected via the `widget` query param read by the `resourcemonitor` renderer entry.
 * Reuses the overlay preload, which exposes the `resources` bridge. Starts hidden; the controller
 * shows it once loaded.
 */
export function createResourceWidgetWindow(widgetId: ResourceWidgetId, bounds: Rect): BrowserWindow {
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
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'resourcemonitor', { widget: widgetId })
  return win
}

/**
 * Creates the "Close Vibe Bar" confirmation popup: a small, frameless, transparent, always-on-top
 * window the controller centers on screen. It is fixed (not movable/resizable) and reuses the
 * overlay preload, which exposes `vibebar.app.quit` / `vibebar.app.cancelQuit`. Starts hidden; the
 * controller shows it on demand.
 */
export function createConfirmWindow(bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
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
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'confirm')
  return win
}

/**
 * Creates a sticky note pop-out as a floating overlay: frameless, transparent, and always-on-top
 * so a note hovers over the desktop like a Microsoft Sticky Note, independent of the main Notes
 * panel. Resizable + movable; its drag bar, fill toggle, and close button live in the renderer.
 * The target note is selected via the `note` query param read by the `note` renderer entry.
 * Reuses the overlay preload, which exposes the full `window.vibebar` bridge (incl. `notes`).
 */
export function createNoteWindow(noteId: string, bounds: Rect): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 280,
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
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'note', { note: noteId })
  return win
}

/**
 * Creates a detached panel as a floating overlay: frameless, transparent, and always-on-top so
 * it appears to hover beside the toolbar like a menu (mirroring Code Sync). One window hosts a
 * single panel, selected via the `panel` query param read by the generic renderer entry. Its
 * drag bar + hide button live in the renderer. Starts hidden; the controller shows it on first
 * toggle.
 */
export function createDetachedPanelWindow(panelId: string, bounds: Rect): BrowserWindow {
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
      // Reuses the overlay preload: it already exposes the full `window.vibebar` bridge every
      // panel needs, and the window hides itself via `vibebar.panel.detach(panelId)`.
      preload: resolvePreload('overlay'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWindow(win)
  loadEntry(win, 'panel', { panel: panelId })
  return win
}
