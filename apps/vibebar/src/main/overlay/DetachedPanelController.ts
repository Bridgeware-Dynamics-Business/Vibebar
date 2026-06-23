import { BrowserWindow, screen } from 'electron'
import type { DockSide } from '@shared/types.js'
import type { DetachablePanelId } from '@shared/tools.js'
import { PANEL_SIZES } from '@shared/overlayMetrics.js'
import { createDetachedPanelWindow } from './windowFactory.js'
import type { Rect } from './snapLogic.js'
import type { AppStore } from '../settings/store.js'
import { clampWindowBounds, trackWindowBounds } from './windowBounds.js'

const MARGIN = 88

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
  private readonly untrack = new Map<DetachablePanelId, () => void>()

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
    win.setBounds(this.resolveBounds(panelId))
    win.show()
    win.focus()
    return { visible: true }
  }

  /** Ensures a panel's window exists and is visible (used by the tray's "Open Settings"). */
  show(panelId: DetachablePanelId): { visible: boolean } {
    const win = this.ensureWindow(panelId)
    win.setBounds(this.resolveBounds(panelId))
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
    for (const stop of this.untrack.values()) stop()
    this.untrack.clear()
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.wins.clear()
  }

  private ensureWindow(panelId: DetachablePanelId): BrowserWindow {
    const existing = this.wins.get(panelId)
    if (existing && !existing.isDestroyed()) return existing
    const bounds = this.resolveBounds(panelId)
    const win = createDetachedPanelWindow(panelId, bounds)
    win.on('closed', () => {
      this.untrack.get(panelId)?.()
      this.untrack.delete(panelId)
      this.wins.delete(panelId)
    })
    this.untrack.set(
      panelId,
      trackWindowBounds(win, (b) => this.store.setPanelBounds(panelId, b))
    )
    this.wins.set(panelId, win)
    return win
  }

  /** Restores saved bounds when present; otherwise computes default placement. */
  private resolveBounds(panelId: DetachablePanelId): Rect {
    const saved = this.store.getPanelBounds(panelId)
    const wa = screen.getPrimaryDisplay().workArea
    if (saved) return clampWindowBounds(saved, wa)
    return this.computeBounds(panelId)
  }

  /** Places the window on the side opposite the toolbar dock, floating with a screen margin. */
  private computeBounds(panelId: DetachablePanelId): Rect {
    const wa = screen.getPrimaryDisplay().workArea
    const dock: DockSide = this.store.getSettings().dock
    const size = PANEL_SIZES[panelId]
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
