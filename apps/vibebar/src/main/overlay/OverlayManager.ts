import { BrowserWindow, screen } from 'electron'
import { CH } from '@shared/channels.js'
import type { DockSide, DisplayInfo, OverlayLayout } from '@shared/types.js'
import type { AppStore } from '../settings/store.js'
import { mapDisplays, resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import {
  SNAP_THRESHOLD,
  dockedRect,
  nearestDock,
  orientationFor,
  snapTarget,
  type Rect
} from './snapLogic.js'
import { createOverlayWindow } from './windowFactory.js'

const TOOLBAR_THICKNESS = 64
// The bar holds a fixed run of circular buttons (project, tools, GitHub, quick-launch, settings).
// Keep collapsed and open lengths equal so the buttons always have room to stay perfectly round
// (no flex-shrink squish) and the bar doesn't change length when a side panel opens — only its
// width grows by PANEL_EXTENT.
const COLLAPSED_LENGTH = 680
const OPEN_LENGTH = 680
const PANEL_EXTENT = 470
const MOVE_SETTLE_MS = 110

interface OverlayEntry {
  win: BrowserWindow
  dock: DockSide
  anchor: number
  panelOpen: boolean
  moveTimer: ReturnType<typeof setTimeout> | null
}

function displayToLike(d: Electron.Display): DisplayLike {
  return { id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea }
}

/**
 * Owns the overlay windows across enabled monitors. Handles drag-to-snap, dock/orientation
 * changes, and panel expansion, and keeps windows reconciled with the connected displays.
 */
export class OverlayManager {
  private readonly store: AppStore
  private readonly byDisplay = new Map<string, OverlayEntry>()
  private repositioning = false

  constructor(store: AppStore) {
    this.store = store
  }

  start(): void {
    this.reconcile()
    screen.on('display-added', this.reconcile)
    screen.on('display-removed', this.reconcile)
    screen.on('display-metrics-changed', this.reconcile)
  }

  private currentBounds(dock: DockSide, workArea: Rect, anchor: number, panelOpen: boolean): Rect {
    const length = panelOpen ? OPEN_LENGTH : COLLAPSED_LENGTH
    const extent = panelOpen ? PANEL_EXTENT : 0
    return dockedRect(dock, workArea, TOOLBAR_THICKNESS, length, extent, anchor)
  }

  private centerAnchor(dock: DockSide, workArea: Rect): number {
    return dock === 'top'
      ? workArea.x + (workArea.width - COLLAPSED_LENGTH) / 2
      : workArea.y + (workArea.height - COLLAPSED_LENGTH) / 2
  }

  private reconcile = (): void => {
    const displays = screen.getAllDisplays()
    const primaryId = screen.getPrimaryDisplay().id
    const likes = displays.map(displayToLike)
    const settings = this.store.getSettings()
    const enabled = resolveEnabledDisplays(likes, settings.enabledDisplayIds, primaryId)
    const enabledIds = new Set(enabled.map((d) => String(d.id)))

    for (const [id, entry] of this.byDisplay) {
      if (!enabledIds.has(id)) {
        if (entry.moveTimer) clearTimeout(entry.moveTimer)
        entry.win.destroy()
        this.byDisplay.delete(id)
      }
    }

    for (const d of enabled) {
      const id = String(d.id)
      if (this.byDisplay.has(id)) {
        this.positionWindow(id)
        continue
      }
      // Restore this monitor's own saved placement; fall back to the global default dock.
      const saved = this.store.getDisplayLayout(id)
      const dock = saved?.dock ?? settings.dock
      const anchor = saved?.anchor ?? this.centerAnchor(dock, d.workArea)
      const bounds = this.currentBounds(dock, d.workArea, anchor, false)
      const win = createOverlayWindow(bounds)
      const entry: OverlayEntry = { win, dock, anchor, panelOpen: false, moveTimer: null }
      this.byDisplay.set(id, entry)
      this.attachMoveHandler(id, entry)
      win.webContents.on('did-finish-load', () => this.sendLayout(id))
      win.on('closed', () => this.byDisplay.delete(id))
    }
  }

  private workAreaFor(id: string): Rect | null {
    const display = screen.getAllDisplays().find((d) => String(d.id) === id)
    return display ? display.workArea : null
  }

  private positionWindow(id: string): void {
    const entry = this.byDisplay.get(id)
    const workArea = this.workAreaFor(id)
    if (!entry || !workArea) return
    const bounds = this.currentBounds(entry.dock, workArea, entry.anchor, entry.panelOpen)
    this.repositioning = true
    entry.win.setBounds(bounds)
    this.repositioning = false
  }

  private persist(id: string, entry: OverlayEntry): void {
    this.store.setDisplayLayout(id, { dock: entry.dock, anchor: entry.anchor })
  }

  private attachMoveHandler(id: string, entry: OverlayEntry): void {
    entry.win.on('move', () => {
      if (this.repositioning) return
      this.handleMoveLive(id)
      if (entry.moveTimer) clearTimeout(entry.moveTimer)
      entry.moveTimer = setTimeout(() => this.handleMoveEnd(id), MOVE_SETTLE_MS)
    })
  }

  /**
   * Magnetic snapping during the drag, scoped to the monitor being dragged. As the toolbar
   * nears an edge it locks flush, preserving the perpendicular (free-axis) position so it still
   * follows the cursor along the edge. Beyond the catch distance it floats freely. Other
   * monitors are never touched, so each bar moves and stays independently.
   */
  private handleMoveLive(id: string): void {
    const entry = this.byDisplay.get(id)
    if (!entry) return
    const winBounds = entry.win.getBounds()
    const workArea = screen.getDisplayMatching(winBounds).workArea
    const target = snapTarget(winBounds, workArea, SNAP_THRESHOLD)
    if (!target) return

    const prevDock = entry.dock
    entry.dock = target
    entry.anchor = target === 'top' ? winBounds.x : winBounds.y
    this.positionWindow(id)
    // Flip orientation live (vertical <-> horizontal) the moment this monitor's edge changes.
    if (target !== prevDock) this.sendLayout(id)
  }

  private handleMoveEnd(id: string): void {
    const entry = this.byDisplay.get(id)
    if (!entry) return
    const winBounds = entry.win.getBounds()
    const workArea = screen.getDisplayMatching(winBounds).workArea
    const prevDock = entry.dock
    entry.dock = nearestDock(winBounds, workArea)
    entry.anchor = entry.dock === 'top' ? winBounds.x : winBounds.y
    this.positionWindow(id)
    this.persist(id, entry)
    if (entry.dock !== prevDock) this.sendLayout(id)
  }

  /** Applies a dock to every monitor (the Settings "Dock position" buttons act globally). */
  setDock(dock: DockSide): OverlayLayout {
    this.store.setDock(dock)
    for (const [id, entry] of this.byDisplay) {
      const wa = this.workAreaFor(id)
      entry.dock = dock
      if (wa) entry.anchor = this.centerAnchor(dock, wa)
      this.positionWindow(id)
      this.persist(id, entry)
      this.sendLayout(id)
    }
    return { dock, orientation: orientationFor(dock) }
  }

  /**
   * Expands/collapses the panel for a single monitor — the one whose window made the request.
   * Panel state is per-display, so opening a menu on one screen never resizes or shifts the
   * toolbars on the other monitors.
   */
  setPanelForSender(sender: Electron.WebContents, open: boolean): OverlayLayout {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        entry.panelOpen = open
        this.positionWindow(id)
        return { dock: entry.dock, orientation: orientationFor(entry.dock) }
      }
    }
    return this.layout()
  }

  /** Fallback layout (primary/global). Per-window layout is delivered via sendLayout. */
  layout(): OverlayLayout {
    const dock = this.store.getSettings().dock
    return { dock, orientation: orientationFor(dock) }
  }

  /** The layout for the window that sent an IPC request, so each renderer inits to its own dock. */
  layoutForSender(sender: Electron.WebContents): OverlayLayout {
    for (const entry of this.byDisplay.values()) {
      if (entry.win.webContents.id === sender.id) {
        return { dock: entry.dock, orientation: orientationFor(entry.dock) }
      }
    }
    return this.layout()
  }

  displays(): DisplayInfo[] {
    return mapDisplays(screen.getAllDisplays().map(displayToLike), screen.getPrimaryDisplay().id)
  }

  /** Sends one monitor its own current layout (dock + orientation). */
  private sendLayout(id: string): void {
    const entry = this.byDisplay.get(id)
    if (!entry || entry.win.isDestroyed()) return
    entry.win.webContents.send(CH.overlayLayout, {
      dock: entry.dock,
      orientation: orientationFor(entry.dock)
    })
  }

  broadcast(channel: string, payload: unknown): void {
    for (const entry of this.byDisplay.values()) {
      entry.win.webContents.send(channel, payload)
    }
  }

  onSettingsChanged(): void {
    this.reconcile()
    for (const id of this.byDisplay.keys()) this.sendLayout(id)
  }

  destroy(): void {
    screen.removeListener('display-added', this.reconcile)
    screen.removeListener('display-removed', this.reconcile)
    screen.removeListener('display-metrics-changed', this.reconcile)
    for (const entry of this.byDisplay.values()) {
      if (entry.moveTimer) clearTimeout(entry.moveTimer)
      entry.win.destroy()
    }
    this.byDisplay.clear()
  }
}
