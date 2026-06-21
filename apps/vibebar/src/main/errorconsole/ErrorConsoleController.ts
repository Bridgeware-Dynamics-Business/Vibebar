import { BrowserWindow, screen } from 'electron'
import type { ErrorReport } from '@shared/api.js'
import { CH } from '@shared/channels.js'
import { createErrorConsoleWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'

const WIDTH = 440
const HEIGHT = 460
const MARGIN = 24
const MAX_ENTRIES = 50

/**
 * Owns the in-app error console window. Renderers forward captured (already-redacted) errors here;
 * the controller keeps a small capped buffer, auto-shows the bottom-left overlay on each new error,
 * and pushes the live list to the window. The window's Close button hides it (buffer retained) so
 * it stays out of the way until the next error; Clear empties the buffer.
 *
 * The window is shown with `showInactive()` so a background error never steals keyboard focus from
 * the user's editor — it simply appears above everything, ready to click.
 */
export class ErrorConsoleController {
  private win: BrowserWindow | null = null
  private reports: ErrorReport[] = []

  /** Records a new error and reveals the console. */
  report(report: ErrorReport): void {
    this.reports.push(report)
    if (this.reports.length > MAX_ENTRIES) {
      this.reports = this.reports.slice(-MAX_ENTRIES)
    }
    this.ensureWindow()
    this.show()
    this.push()
  }

  /** Empties the buffer (the console's Clear button) and pushes the now-empty list. */
  clear(): void {
    this.reports = []
    this.push()
  }

  /** Hides the window until the next error (the console's Close button). Buffer is kept. */
  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide()
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
    this.reports = []
  }

  private show(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.setBounds(this.computeBounds())
    if (!this.win.isVisible()) this.win.showInactive()
  }

  private push(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send(CH.errorsPush, this.reports)
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return
    this.win = createErrorConsoleWindow(this.computeBounds())
    this.win.on('closed', () => {
      this.win = null
    })
    // The renderer mounts after load; replay the current buffer once it's ready.
    this.win.webContents.on('did-finish-load', () => this.push())
  }

  /** Bottom-left of the primary display's work area, clamped to fit small screens. */
  private computeBounds(): Rect {
    const wa = screen.getPrimaryDisplay().workArea
    const width = Math.min(WIDTH, wa.width - 2 * MARGIN)
    const height = Math.min(HEIGHT, wa.height - 2 * MARGIN)
    return {
      x: wa.x + MARGIN,
      y: wa.y + wa.height - height - MARGIN,
      width,
      height
    }
  }
}
