import { BrowserWindow, screen } from 'electron'
import type { ErrorReport } from '@shared/api.js'
import { CH } from '@shared/channels.js'
import { resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import { createErrorConsoleWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const WIDTH = 440
const HEIGHT = 460
const MARGIN = 24
const MAX_ENTRIES = 50

function displayToLike(d: Electron.Display): DisplayLike {
  return { id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea }
}

/**
 * Owns the in-app error console windows. The user picks which monitors the console appears on in
 * Settings (`errorConsoleDisplayIds`; empty = primary only), so this manages one bottom-left,
 * always-on-top window per selected display. Renderers forward captured (already-redacted) errors
 * here; the controller keeps a small capped buffer, auto-shows every selected monitor's window on
 * each new error, and pushes the live list to all of them.
 *
 * Close is global: closing the console on any monitor hides it on every monitor (buffer retained),
 * so the user dismisses one and they all go away together. The next error reveals them all again.
 *
 * Windows are shown with `showInactive()` so a background error never steals keyboard focus.
 */
export class ErrorConsoleController {
  private readonly store: AppStore
  private readonly wins = new Map<string, BrowserWindow>()
  private reports: ErrorReport[] = []
  /** Whether the console is currently open (the user hasn't closed it since the last error). */
  private open = false
  private screenWired = false

  constructor(store: AppStore) {
    this.store = store
  }

  /** Records a new error and reveals the console on every selected monitor. */
  report(report: ErrorReport): void {
    this.reports.push(report)
    if (this.reports.length > MAX_ENTRIES) {
      this.reports = this.reports.slice(-MAX_ENTRIES)
    }
    this.open = true
    this.reconcile()
    this.showAll()
    this.pushAll()
  }

  /** Empties the buffer (the console's Clear button) and pushes the now-empty list to all. */
  clear(): void {
    this.reports = []
    this.pushAll()
  }

  /** Closes the console on ALL monitors at once (the console's Close button). Buffer is kept. */
  close(): void {
    this.open = false
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.hide()
    }
  }

  /** Re-applies the monitor selection (called when Settings change or a display is added/removed). */
  onSettingsChanged(): void {
    this.reconcile()
    if (this.open) this.showAll()
    this.pushAll()
  }

  dispose(): void {
    if (this.screenWired) {
      screen.removeListener('display-added', this.onDisplaysChanged)
      screen.removeListener('display-removed', this.onDisplaysChanged)
      screen.removeListener('display-metrics-changed', this.onDisplaysChanged)
      this.screenWired = false
    }
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.wins.clear()
    this.reports = []
  }

  private onDisplaysChanged = (): void => {
    this.reconcile()
    if (this.open) this.showAll()
    this.pushAll()
  }

  /** Resolves the selected displays and creates/destroys console windows to match. */
  private reconcile(): void {
    this.ensureScreenListeners()
    const targets = this.targetDisplays()
    const targetIds = new Set(targets.map((d) => String(d.id)))

    for (const [id, win] of this.wins) {
      if (!targetIds.has(id)) {
        if (!win.isDestroyed()) win.destroy()
        this.wins.delete(id)
      }
    }

    for (const display of targets) {
      const id = String(display.id)
      if (this.wins.has(id)) continue
      const win = createErrorConsoleWindow(this.computeBounds(display))
      win.on('closed', () => this.wins.delete(id))
      // The renderer mounts after load; replay the current buffer once it's ready.
      win.webContents.on('did-finish-load', () => {
        if (!win.isDestroyed()) win.webContents.send(CH.errorsPush, this.reports)
      })
      this.wins.set(id, win)
    }
  }

  private showAll(): void {
    for (const [id, win] of this.wins) {
      if (win.isDestroyed()) continue
      const display = this.displayById(id)
      if (display) win.setBounds(this.computeBounds(display))
      if (!win.isVisible()) win.showInactive()
    }
  }

  private pushAll(): void {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.webContents.send(CH.errorsPush, this.reports)
    }
  }

  private targetDisplays(): DisplayLike[] {
    const likes = screen.getAllDisplays().map(displayToLike)
    const primaryId = screen.getPrimaryDisplay().id
    const enabled = this.store.getSettings().errorConsoleDisplayIds
    return resolveEnabledDisplays(likes, enabled, primaryId)
  }

  private displayById(id: string): DisplayLike | null {
    const match = screen.getAllDisplays().find((d) => String(d.id) === id)
    return match ? displayToLike(match) : null
  }

  /** Bottom-left of the given display's work area, clamped to fit small screens. */
  private computeBounds(display: DisplayLike): Rect {
    const wa = display.workArea
    const width = Math.min(WIDTH, wa.width - 2 * MARGIN)
    const height = Math.min(HEIGHT, wa.height - 2 * MARGIN)
    return {
      x: wa.x + MARGIN,
      y: wa.y + wa.height - height - MARGIN,
      width,
      height
    }
  }

  private ensureScreenListeners(): void {
    if (this.screenWired) return
    this.screenWired = true
    screen.on('display-added', this.onDisplaysChanged)
    screen.on('display-removed', this.onDisplaysChanged)
    screen.on('display-metrics-changed', this.onDisplaysChanged)
  }
}
