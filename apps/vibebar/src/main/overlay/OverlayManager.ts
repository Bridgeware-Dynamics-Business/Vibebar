import { BrowserWindow, screen } from 'electron'
import type { DetachablePanelId } from '@shared/tools.js'
import { CH } from '@shared/channels.js'
import type { DockSide, DisplayInfo, OverlayLayout } from '@shared/types.js'
import type { AppStore } from '../settings/store.js'
import { mapDisplays, resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import {
  collapsedToolbarLength,
  panelInwardExtent,
  TOOLBAR_THICKNESS
} from '@shared/overlayMetrics.js'
import {
  SNAP_THRESHOLD,
  dockedRect,
  nearestDock,
  orientationFor,
  snapTarget,
  type Rect
} from './snapLogic.js'
import { createOverlayWindow } from './windowFactory.js'

const COLLAPSED_LENGTH = collapsedToolbarLength()
const MOVE_SETTLE_MS = 110

interface OverlayEntry {
  win: BrowserWindow
  dock: DockSide
  anchor: number
  panelOpen: boolean
  /** Inward panel size (px) when open — matches {@link PANEL_SIZES} for the active tool. */
  panelInward: number
  /** Command palette open — window expands to the full work area for the modal overlay. */
  paletteOpen: boolean
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
  /** Prevents infinite reconcile when resetting stale display ids. */
  private reconcilingFallback = false
  // Whether the toolbars are currently shown. Hiding (from the tray) keeps the windows alive so
  // renderer state is preserved; it is in-memory only and resets to visible on relaunch.
  private visible = true
  /** Display id of the toolbar the user last clicked or focused — routes the palette hotkey. */
  private activeDisplayId: string | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  start(): void {
    this.reconcile()
    screen.on('display-added', this.reconcile)
    screen.on('display-removed', this.reconcile)
    screen.on('display-metrics-changed', this.reconcile)
  }

  /** Whether the toolbars are currently shown. */
  isVisible(): boolean {
    return this.visible
  }

  /** Shows or hides every overlay window at once (driven by the tray's Show/Hide item). */
  setVisible(visible: boolean): void {
    this.visible = visible
    for (const entry of this.byDisplay.values()) {
      if (entry.win.isDestroyed()) continue
      if (visible) {
        entry.win.show()
        entry.win.moveTop()
      } else entry.win.hide()
    }
  }

  /** Flips visibility and returns the new state, so the tray can relabel its menu item. */
  toggleVisible(): boolean {
    this.setVisible(!this.visible)
    return this.visible
  }

  /**
   * Shows every overlay window. Does not reposition (so user drags are not fighting timers).
   * Pass `reposition: true` only for explicit recovery (reset toolbar).
   */
  restoreAndFocus(reposition = false): void {
    this.visible = true
    if (reposition) {
      for (const id of this.byDisplay.keys()) this.positionWindow(id)
    }
    for (const entry of this.byDisplay.values()) {
      if (entry.win.isDestroyed()) continue
      entry.win.show()
      entry.win.moveTop()
    }
  }

  /** Reloads every overlay window (dev HMR recovery when vite port changes). */
  reloadAll(): void {
    for (const entry of this.byDisplay.values()) {
      if (entry.win.isDestroyed()) continue
      entry.win.webContents.reload()
    }
  }

  /**
   * Recovery when the toolbar vanished (hidden, off-screen, or stale display ids).
   * Resets placement to defaults on each enabled display and forces visibility.
   */
  resetToolbar(): void {
    this.visible = true
    for (const entry of this.byDisplay.values()) {
      entry.panelOpen = false
      entry.panelInward = 0
      entry.paletteOpen = false
    }
    this.store.clearDisplayLayouts()
    this.store.saveSettings({ enabledDisplayIds: [] })
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.isDestroyed()) continue
      const wa = this.workAreaFor(id)
      if (!wa) continue
      entry.dock = this.store.getSettings().dock
      entry.anchor = this.centerAnchor(entry.dock, wa)
      this.positionWindow(id)
    }
    this.restoreAndFocus(true)
  }

  /** Collapses any expanded panel shell (fixes empty wide overlay with no tools visible). */
  collapseAllPanels(): void {
    for (const [id, entry] of this.byDisplay) {
      let changed = false
      if (entry.panelOpen) {
        entry.panelOpen = false
        entry.panelInward = 0
        changed = true
      }
      if (entry.paletteOpen) {
        entry.paletteOpen = false
        changed = true
      }
      if (changed) this.positionWindow(id)
    }
  }

  /**
   * Expands/collapses the overlay window to the full work area while the command palette is open,
   * so the modal backdrop and list are not clipped to the thin toolbar strip.
   */
  setCommandPaletteForSender(sender: Electron.WebContents, open: boolean): OverlayLayout {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        entry.paletteOpen = open
        this.positionWindow(id)
        if (open) entry.win.moveTop()
        return this.layoutForEntry(id, entry)
      }
    }
    return this.layout()
  }

  /** Marks the overlay window that sent the request as the user's active toolbar. */
  setActiveForSender(sender: Electron.WebContents): void {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        this.activeDisplayId = id
        return
      }
    }
  }

  /**
   * Opens the command palette on the display the user last clicked, closing it on any others.
   * Falls back to the display under the cursor, then primary.
   */
  openCommandPaletteHotkey(): void {
    const targetId = this.resolveCommandPaletteTarget()
    if (!targetId) return

    for (const [id, entry] of this.byDisplay) {
      if (entry.win.isDestroyed()) continue
      if (id === targetId) {
        entry.paletteOpen = true
        this.positionWindow(id)
        entry.win.moveTop()
        entry.win.webContents.send(CH.overlayCommandPalette, { open: true })
        continue
      }
      if (entry.paletteOpen) {
        entry.paletteOpen = false
        this.positionWindow(id)
        entry.win.webContents.send(CH.overlayCommandPalette, { open: false })
      }
    }
  }

  private resolveCommandPaletteTarget(): string | null {
    if (this.activeDisplayId && this.byDisplay.has(this.activeDisplayId)) {
      return this.activeDisplayId
    }
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const cursorId = String(cursorDisplay.id)
    if (this.byDisplay.has(cursorId)) return cursorId
    const primaryId = String(screen.getPrimaryDisplay().id)
    if (this.byDisplay.has(primaryId)) return primaryId
    return this.byDisplay.keys().next().value ?? null
  }

  /** How many overlay windows are active (diagnostics). */
  windowCount(): number {
    return this.byDisplay.size
  }

  private anchorOffset(entry: OverlayEntry, workArea: Rect): number {
    return entry.dock === 'top' ? entry.anchor - workArea.x : entry.anchor - workArea.y
  }

  private layoutForEntry(id: string, entry: OverlayEntry): OverlayLayout {
    const workArea = this.workAreaFor(id)
    return {
      dock: entry.dock,
      orientation: orientationFor(entry.dock),
      anchorOffset: workArea ? this.anchorOffset(entry, workArea) : 0
    }
  }

  private currentBounds(
    dock: DockSide,
    workArea: Rect,
    anchor: number,
    panelOpen: boolean,
    panelInward: number
  ): Rect {
    const length = COLLAPSED_LENGTH
    const extent = panelOpen ? panelInward : 0
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
      const bounds = this.currentBounds(dock, d.workArea, anchor, false, 0)
      const win = createOverlayWindow(bounds, (w) => {
        if (this.visible) {
          w.show()
          w.moveTop()
        } else w.hide()
      })
      const entry: OverlayEntry = {
        win,
        dock,
        anchor,
        panelOpen: false,
        panelInward: 0,
        paletteOpen: false,
        moveTimer: null
      }
      this.byDisplay.set(id, entry)
      this.attachMoveHandler(id, entry)
      this.attachInteractionHandlers(id, entry)
      win.webContents.on('did-finish-load', () => this.sendLayout(id))
      win.on('closed', () => this.byDisplay.delete(id))
    }

    // Stale enabledDisplayIds can leave zero windows after a monitor change — always keep primary.
    if (this.byDisplay.size === 0 && displays.length > 0 && !this.reconcilingFallback) {
      console.warn('[VibeBar] No overlay on enabled displays; resetting to primary monitor.')
      this.reconcilingFallback = true
      this.store.saveSettings({ enabledDisplayIds: [] })
      this.reconcile()
      this.reconcilingFallback = false
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
    const bounds = entry.paletteOpen
      ? { ...workArea }
      : this.currentBounds(entry.dock, workArea, entry.anchor, entry.panelOpen, entry.panelInward)
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

  /** Track focus so the palette hotkey targets the toolbar the user was last using. */
  private attachInteractionHandlers(id: string, entry: OverlayEntry): void {
    entry.win.on('focus', () => {
      this.activeDisplayId = id
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
    if (!entry || entry.paletteOpen) return
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
    if (!entry || entry.paletteOpen) return
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
  setPanelForSender(
    sender: Electron.WebContents,
    open: boolean,
    panelId?: DetachablePanelId
  ): OverlayLayout {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        entry.panelOpen = open
        entry.panelInward = open && panelId ? panelInwardExtent(panelId, entry.dock) : 0
        this.positionWindow(id)
        return this.layoutForEntry(id, entry)
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
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        return this.layoutForEntry(id, entry)
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
    const workArea = this.workAreaFor(id)
    if (!entry || entry.win.isDestroyed() || !workArea) return
    entry.win.webContents.send(CH.overlayLayout, {
      dock: entry.dock,
      orientation: orientationFor(entry.dock),
      anchorOffset: this.anchorOffset(entry, workArea)
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
