import { BrowserWindow, screen } from 'electron'
import { createConfirmWindow } from './windowFactory.js'
import type { Rect } from './snapLogic.js'

const WIDTH = 360
const HEIGHT = 180

/**
 * Owns the centered "Close Vibe Bar" confirmation popup. The toolbar's power button asks main to
 * `open()` this; the popup's Yes calls `app.quit()` and its No calls `cancelQuit()` -> `close()`.
 * The window is created lazily, reused, and re-centered on the display under the cursor each time
 * it is shown, so it always appears in the middle of the active screen.
 */
export class ConfirmQuitController {
  private win: BrowserWindow | null = null

  /** Centers and reveals the confirmation popup on the display under the cursor. */
  open(): void {
    const win = this.ensureWindow()
    win.setBounds(this.computeBounds())
    win.show()
    win.focus()
  }

  /** Hides the popup without quitting (the "No" button). */
  close(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide()
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = createConfirmWindow(this.computeBounds())
    win.on('closed', () => {
      this.win = null
    })
    this.win = win
    return win
  }

  /** Centered on the work area of the display currently under the cursor. */
  private computeBounds(): Rect {
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = Math.min(WIDTH, wa.width)
    const height = Math.min(HEIGHT, wa.height)
    return {
      x: Math.round(wa.x + (wa.width - width) / 2),
      y: Math.round(wa.y + (wa.height - height) / 2),
      width,
      height
    }
  }
}
