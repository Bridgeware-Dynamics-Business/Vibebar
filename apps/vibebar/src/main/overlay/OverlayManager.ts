import { BrowserWindow, screen } from 'electron'
import type { DetachablePanelId } from '@shared/tools.js'
import { CH } from '@shared/channels.js'
import type { DockSide, DisplayInfo, OverlayLayout } from '@shared/types.js'
import type { ToolbarLayoutSnapshot } from '@shared/resourceWidgetLayout.js'
import type { AppStore } from '../settings/store.js'
import { mapDisplays, resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import {
  collapsedToolbarLength,
  panelInwardExtent,
  TOOLBAR_THICKNESS,
  toolbarProbeSize
} from '@shared/overlayMetrics.js'
import {
  centerAnchor,
  dockedRect,
  orientationFor,
  probeAtCursor,
  resolveDockOnDrop,
  resolvePlacement,
  type Point,
  type Rect
} from './snapLogic.js'
import { createOverlayWindow } from './windowFactory.js'

const MOVE_SETTLE_MS = 450
/** Fallback if the renderer never acks layoutReady after an orientation change. */
const LAYOUT_READY_TIMEOUT_MS = 600

interface OverlayEntry {
  win: BrowserWindow
  dock: DockSide
  anchor: number
  panelOpen: boolean
  /** Inward panel size (px) when open — matches {@link PANEL_SIZES} for the active tool. */
  panelInward: number
  /** Command palette open — window expands to the full work area for the modal overlay. */
  paletteOpen: boolean
  /** True while the user is actively dragging this toolbar (renderer dragBegin → dragEnd). */
  dragging: boolean
  /** Ignore move events from programmatic setBounds (drawer/panel resize) so snap logic does not run. */
  suppressMoveSnapUntil: number
  /** Waiting for renderer to paint the new dock orientation before resizing the window. */
  awaitingLayoutReady: boolean
  layoutReadyTimer: ReturnType<typeof setTimeout> | null
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
  private toolbarLayoutListener: (() => void) | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  /** Resource widgets subscribe to toolbar moves/dock changes for synced placement. */
  setToolbarLayoutListener(listener: (() => void) | null): void {
    this.toolbarLayoutListener = listener
  }

  /** Collapsed toolbar rects per enabled overlay display (for resource widget sync). */
  getToolbarLayouts(): ToolbarLayoutSnapshot[] {
    const layouts: ToolbarLayoutSnapshot[] = []
    for (const [id, entry] of this.byDisplay) {
      const workArea = this.workAreaFor(id)
      if (!workArea) continue
      layouts.push({
        displayId: id,
        dock: entry.dock,
        workArea,
        toolbarBounds: entry.win.isDestroyed()
          ? this.currentBounds(id, entry.dock, workArea, entry.anchor, entry)
          : entry.win.getBounds()
      })
    }
    return layouts
  }

  private notifyToolbarLayoutChanged(): void {
    this.toolbarLayoutListener?.()
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
      entry.anchor = this.centerAnchorFor(id, entry.dock, wa)
      this.positionWindow(id)
    }
    this.restoreAndFocus(true)
    this.notifyToolbarLayoutChanged()
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

  /** Resizes every toolbar window after the button count changes (e.g. quick-launch edits). */
  refreshToolbarSizes(): void {
    for (const id of this.byDisplay.keys()) {
      const entry = this.byDisplay.get(id)!
      if (entry.dragging) continue
      const workArea = this.workAreaFor(id)
      if (workArea && entry.dock === 'top') {
        entry.anchor = centerAnchor('top', workArea, this.toolbarLengthFor())
      }
      this.positionWindow(id)
      this.sendLayout(id)
    }
    this.notifyToolbarLayoutChanged()
  }

  /** Marks the sender overlay as mid-drag so move handlers do not snap early. */
  beginDragForSender(sender: Electron.WebContents): void {
    for (const entry of this.byDisplay.values()) {
      if (entry.win.webContents.id === sender.id) {
        entry.dragging = true
        if (entry.moveTimer) {
          clearTimeout(entry.moveTimer)
          entry.moveTimer = null
        }
        return
      }
    }
  }

  /** Snaps the sender overlay after the user releases a toolbar drag. */
  endDragForSender(sender: Electron.WebContents, cursor?: Point): void {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id === sender.id) {
        entry.dragging = false
        this.handleMoveEnd(id, cursor)
        return
      }
    }
  }

  /** Renderer committed the new dock layout — safe to resize the overlay window. */
  layoutReadyForSender(sender: Electron.WebContents): void {
    for (const [id, entry] of this.byDisplay) {
      if (entry.win.webContents.id !== sender.id) continue
      if (entry.awaitingLayoutReady) {
        this.finishLayoutReady(id, entry)
      } else if (entry.panelOpen) {
        // setPanel IPC can arrive after layoutReady when the renderer acks on the next frame.
        this.positionWindow(id)
        this.notifyToolbarLayoutChanged()
      }
      return
    }
  }

  private finishLayoutReady(id: string, entry: OverlayEntry): void {
    if (!entry.awaitingLayoutReady) return
    entry.awaitingLayoutReady = false
    if (entry.layoutReadyTimer) {
      clearTimeout(entry.layoutReadyTimer)
      entry.layoutReadyTimer = null
    }
    this.positionWindow(id)
    this.notifyToolbarLayoutChanged()
  }

  private cancelLayoutReady(entry: OverlayEntry): void {
    if (!entry.awaitingLayoutReady) return
    entry.awaitingLayoutReady = false
    if (entry.layoutReadyTimer) {
      clearTimeout(entry.layoutReadyTimer)
      entry.layoutReadyTimer = null
    }
  }

  private scheduleLayoutReady(id: string, entry: OverlayEntry): void {
    entry.awaitingLayoutReady = true
    if (entry.layoutReadyTimer) clearTimeout(entry.layoutReadyTimer)
    entry.layoutReadyTimer = setTimeout(() => {
      entry.layoutReadyTimer = null
      if (entry.awaitingLayoutReady) this.finishLayoutReady(id, entry)
    }, LAYOUT_READY_TIMEOUT_MS)
  }

  /**
   * Sends layout to the renderer. When orientation flips to vertical, defers setBounds until
   * layoutReady so the strip is not laid out tall inside a short top-dock window. When flipping
   * to horizontal (top dock), resizes immediately so the wide bar is not clipped in a narrow
   * side-dock window while the renderer repaints.
   */
  private syncLayoutAndBounds(id: string, orientationChanged: boolean): void {
    const entry = this.byDisplay.get(id)
    if (!entry) return
    const becomingHorizontal = orientationChanged && entry.dock === 'top'
    if (becomingHorizontal) {
      this.positionWindow(id)
    }
    this.sendLayout(id)
    if (orientationChanged) {
      this.scheduleLayoutReady(id, entry)
    } else {
      this.positionWindow(id)
    }
    this.notifyToolbarLayoutChanged()
  }

  private toolbarLengthFor(): number {
    const apps = this.store.getQuickLaunchApps()
    const visible = apps.filter((app) => app.visible !== false).length
    const hasProject = Boolean(this.store.getActiveProjectPath())
    return collapsedToolbarLength({ quickLaunchCount: visible, hasProject })
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

  private inwardExtent(entry: OverlayEntry): number {
    return entry.panelOpen ? entry.panelInward : 0
  }

  private currentBounds(
    id: string,
    dock: DockSide,
    workArea: Rect,
    anchor: number,
    entry: OverlayEntry
  ): Rect {
    const length = this.toolbarLengthFor()
    const extent = this.inwardExtent(entry)
    return dockedRect(dock, workArea, TOOLBAR_THICKNESS, length, extent, anchor)
  }

  private centerAnchorFor(id: string, dock: DockSide, workArea: Rect): number {
    return centerAnchor(dock, workArea, this.toolbarLengthFor())
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
        if (entry.layoutReadyTimer) clearTimeout(entry.layoutReadyTimer)
        entry.win.destroy()
        this.byDisplay.delete(id)
      }
    }

    for (const d of enabled) {
      const id = String(d.id)
      if (this.byDisplay.has(id)) {
        const entry = this.byDisplay.get(id)!
        if (!entry.dragging) this.positionWindow(id)
        continue
      }
      // Restore this monitor's own saved placement; fall back to the global default dock.
      const saved = this.store.getDisplayLayout(id)
      const dock = saved?.dock ?? settings.dock
      const anchor = saved?.anchor ?? this.centerAnchorFor(id, dock, d.workArea)
      const bounds = dockedRect(
        dock,
        d.workArea,
        TOOLBAR_THICKNESS,
        this.toolbarLengthFor(),
        0,
        anchor
      )
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
        dragging: false,
        suppressMoveSnapUntil: 0,
        awaitingLayoutReady: false,
        layoutReadyTimer: null,
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
      : this.currentBounds(id, entry.dock, workArea, entry.anchor, entry)
    this.repositioning = true
    entry.suppressMoveSnapUntil = Date.now() + (entry.panelOpen ? 900 : 700)
    entry.win.setBounds(bounds, false)
    this.repositioning = false
  }

  private persist(id: string, entry: OverlayEntry): void {
    this.store.setDisplayLayout(id, { dock: entry.dock, anchor: entry.anchor })
  }

  private attachMoveHandler(id: string, entry: OverlayEntry): void {
    entry.win.on('move', () => {
      if (this.repositioning || entry.dragging || Date.now() < entry.suppressMoveSnapUntil) return
      // Fallback when dragEnd IPC is missed (rare); never snap during an active drag.
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
   * Snaps the toolbar to the nearest edge after a drag ends. Uses this overlay's display work
   * area (not getDisplayMatching) so multi-monitor setups never land on the wrong screen.
   * Dock/orientation changes happen here only — never mid-drag — so resizing the frameless
   * window during an active drag cannot throw it off-screen on Windows.
   */
  private handleMoveEnd(id: string, cursor?: Point): void {
    const entry = this.byDisplay.get(id)
    if (!entry || entry.paletteOpen || entry.dragging) return
    const workArea = this.workAreaFor(id)
    if (!workArea) return

    const winBounds = entry.win.getBounds()
    const barLength = this.toolbarLengthFor()
    let probe: Rect = winBounds
    if (cursor) {
      const seed = probeAtCursor(cursor, { width: winBounds.width, height: winBounds.height })
      const dockGuess = resolveDockOnDrop(seed, workArea)
      probe = probeAtCursor(cursor, toolbarProbeSize(dockGuess, barLength))
    }

    const prevDock = entry.dock
    const placement = resolvePlacement(probe, workArea, barLength)
    entry.dock = placement.dock
    entry.anchor = placement.anchor

    const orientationChanged = prevDock !== entry.dock
    this.syncLayoutAndBounds(id, orientationChanged)
    this.persist(id, entry)
  }

  setDock(dock: DockSide): OverlayLayout {
    this.store.setDock(dock)
    for (const [id, entry] of this.byDisplay) {
      const wa = this.workAreaFor(id)
      const prevDock = entry.dock
      entry.dock = dock
      if (wa) entry.anchor = this.centerAnchorFor(id, dock, wa)
      this.syncLayoutAndBounds(id, prevDock !== dock)
      this.persist(id, entry)
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
        if (open) {
          entry.panelOpen = true
          entry.panelInward = panelId ? panelInwardExtent(panelId, entry.dock) : 0
          // Defer setBounds until the renderer paints the panel (layoutReady) so the toolbar
          // does not reflow inside a resized window before the panel shell exists.
          this.scheduleLayoutReady(id, entry)
        } else {
          entry.panelOpen = false
          entry.panelInward = 0
          this.cancelLayoutReady(entry)
          this.positionWindow(id)
        }
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
      if (entry.layoutReadyTimer) clearTimeout(entry.layoutReadyTimer)
      entry.win.destroy()
    }
    this.byDisplay.clear()
  }
}
