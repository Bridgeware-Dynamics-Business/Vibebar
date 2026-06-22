import { BrowserWindow, screen } from 'electron'
import type { DockSide } from '@shared/types.js'
import type { DetachablePanelId } from '@shared/tools.js'
import { createDetachedPanelWindow } from './windowFactory.js'
import type { Rect } from './snapLogic.js'
import type { AppStore } from '../settings/store.js'

const MARGIN = 88

/** Per-panel default window size; each detached panel opens at a size that suits its content. */
const PANEL_SIZE: Record<DetachablePanelId, { width: number; height: number }> = {
  'prompt-library': { width: 460, height: 720 },
  'security-audit': { width: 520, height: 720 },
  'context-packer': { width: 460, height: 680 },
  settings: { width: 440, height: 640 }
}

/**
 * Manages the detached panel companion windows. Each detachable toolbar panel can pop out into
 * its own floating, always-on-top overlay that appears on the side opposite the toolbar
 * (mirroring Code Sync), giving every tool a consistent "popped-out menu" presentation.
 *
 * Windows are created lazily per panel and reused; the panel's Detach button toggles its
 * visibility. Hiding preserves renderer state. All panel data flows through the globally
 * registered IPC handlers, so no per-window engine wiring is needed here — only window
 * lifecycle + positioning.
 */
export class DetachedPanelController {
  private readonly store: AppStore
  private readonly wins = new Map<DetachablePanelId, BrowserWindow>()

  constructor(store: AppStore) {
    this.store = store
  }

  toggle(panelId: DetachablePanelId): { visible: boolean } {
    const existing = this.wins.get(panelId)
    if (existing && !existing.isDestroyed() && existing.isVisible()) {
      existing.hide()
      return { visible: false }
    }
    const win = this.ensureWindow(panelId)
    // Re-anchor opposite the toolbar each time it's shown (dock may have changed).
    win.setBounds(this.computeBounds(panelId))
    win.show()
    win.focus()
    return { visible: true }
  }

  /** Ensures a panel's window exists and is visible (used by the tray's "Open Settings"). */
  show(panelId: DetachablePanelId): { visible: boolean } {
    const win = this.ensureWindow(panelId)
    win.setBounds(this.computeBounds(panelId))
    win.show()
    win.focus()
    return { visible: true }
  }

  /** Pushes an event to every open detached window (e.g. live project changes). */
  send(channel: string, payload: unknown): void {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  dispose(): void {
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.wins.clear()
  }

  private ensureWindow(panelId: DetachablePanelId): BrowserWindow {
    const existing = this.wins.get(panelId)
    if (existing && !existing.isDestroyed()) return existing
    const win = createDetachedPanelWindow(panelId, this.computeBounds(panelId))
    win.on('closed', () => this.wins.delete(panelId))
    this.wins.set(panelId, win)
    return win
  }

  /** Places the window on the side opposite the toolbar dock, floating with a screen margin. */
  private computeBounds(panelId: DetachablePanelId): Rect {
    const wa = screen.getPrimaryDisplay().workArea
    const dock: DockSide = this.store.getSettings().dock
    const size = PANEL_SIZE[panelId]
    const width = Math.min(size.width, wa.width - 2 * MARGIN)
    const height = Math.min(size.height, wa.height - 2 * MARGIN)

    let x: number
    let y = Math.round(wa.y + (wa.height - height) / 2)
    if (dock === 'right') {
      x = wa.x + MARGIN
    } else if (dock === 'top') {
      x = Math.round(wa.x + (wa.width - width) / 2)
      y = wa.y + wa.height - height - MARGIN
    } else {
      // Toolbar on the left → panel on the right.
      x = wa.x + wa.width - width - MARGIN
    }
    return { x, y, width, height }
  }
}
