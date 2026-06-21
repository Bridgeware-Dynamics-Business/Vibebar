import { BrowserWindow, screen } from 'electron'
import type { DockSide } from '@shared/types.js'
import { createPromptLibraryWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const DEFAULT_W = 460
const DEFAULT_H = 720
const MARGIN = 88

/**
 * Manages the detached Prompt Library companion window. It renders as a floating, always-on-top
 * overlay that appears on the side opposite the toolbar (mirroring Code Sync), giving the Prompt
 * Library a "popped-out menu" presentation. The window is created lazily and reused; the toolbar
 * button (or the panel's Detach button) toggles its visibility. Hiding preserves renderer state.
 *
 * Prompt data flows through the globally-registered `prompts:*` IPC handlers, so no per-window
 * engine wiring is needed here — only window lifecycle + positioning.
 */
export class PromptLibraryController {
  private readonly store: AppStore
  private win: BrowserWindow | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  toggle(): { visible: boolean } {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide()
      return { visible: false }
    }
    this.ensureWindow()
    // Re-anchor opposite the toolbar each time it's shown (dock may have changed).
    this.win?.setBounds(this.computeBounds())
    this.win?.show()
    this.win?.focus()
    return { visible: true }
  }

  /** Pushes an event to the detached window if it exists (e.g. live project changes). */
  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, payload)
    }
  }

  dispose(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return
    this.win = createPromptLibraryWindow(this.computeBounds())
    this.win.on('closed', () => {
      this.win = null
    })
  }

  /** Places the window on the side opposite the toolbar dock, floating with a screen margin. */
  private computeBounds(): Rect {
    const wa = screen.getPrimaryDisplay().workArea
    const dock: DockSide = this.store.getSettings().dock
    const width = Math.min(DEFAULT_W, wa.width - 2 * MARGIN)
    const height = Math.min(DEFAULT_H, wa.height - 2 * MARGIN)

    let x: number
    let y = Math.round(wa.y + (wa.height - height) / 2)
    if (dock === 'right') {
      x = wa.x + MARGIN
    } else if (dock === 'top') {
      x = Math.round(wa.x + (wa.width - width) / 2)
      y = wa.y + wa.height - height - MARGIN
    } else {
      // Toolbar on the left → Prompt Library on the right.
      x = wa.x + wa.width - width - MARGIN
    }
    return { x, y, width, height }
  }
}
