import { BrowserWindow, screen } from 'electron'
import type { ResourceSnapshot, ResourceWidgetId } from '@shared/types.js'
import { CH } from '@shared/channels.js'
import {
  computeResourceWidgetBounds,
  RESOURCE_WIDGET_HEIGHT,
  RESOURCE_WIDGET_WIDTH,
  type ToolbarLayoutSnapshot
} from '@shared/resourceWidgetLayout.js'
import { resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import { createResourceWidgetWindow } from '../overlay/windowFactory.js'
import { clampResourceWidgetBounds, trackWindowBounds } from '../overlay/windowBounds.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const WIDTH = RESOURCE_WIDGET_WIDTH
const HEIGHT = RESOURCE_WIDGET_HEIGHT
const POLL_MS = 2000

/** Stable order so staggered defaults and reconcile output stay deterministic. */
const WIDGET_ORDER: ResourceWidgetId[] = ['ram', 'cpu', 'disk', 'appMem']

export interface ToolbarLayoutProvider {
  getToolbarLayouts(): ToolbarLayoutSnapshot[]
}

function displayToLike(d: Electron.Display): DisplayLike {
  return { id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea }
}

function widgetKey(displayId: string, widgetId: ResourceWidgetId): string {
  return `${displayId}:${widgetId}`
}

function parseWidgetKey(key: string): { displayId: string; widgetId: ResourceWidgetId } | null {
  const sep = key.indexOf(':')
  if (sep <= 0) return null
  const displayId = key.slice(0, sep)
  const widgetId = key.slice(sep + 1) as ResourceWidgetId
  if (!WIDGET_ORDER.includes(widgetId)) return null
  return { displayId, widgetId }
}

/**
 * Owns the floating system-resource widgets. The user enables them and picks which monitors and
 * which metrics to show in Settings; this manages one tiny, always-on-top window per
 * (display x enabled metric). Each window is freely draggable and its position is persisted
 * (keyed by `${displayId}:${widgetId}`), so the layout is restored on the next launch.
 *
 * With **Sync with toolbar** enabled (default), widgets form an L-shaped stack beside the toolbar
 * until the user drags one away — detached widgets stay put while the rest keep following the bar.
 *
 * Sampling polls the OS on an interval and pushes a snapshot to every open widget. The timer only
 * runs while the feature is enabled with at least one metric selected, so a disabled monitor costs
 * nothing in the background.
 */
export class ResourceMonitorController {
  private readonly store: AppStore
  private readonly sampler: { sample: (diskPath: string) => Promise<ResourceSnapshot> }
  private readonly toolbarLayouts: ToolbarLayoutProvider | null
  private readonly wins = new Map<string, BrowserWindow>()
  private readonly untrack = new Map<string, () => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private screenWired = false
  private repositioning = false

  constructor(
    store: AppStore,
    sampler: { sample: (diskPath: string) => Promise<ResourceSnapshot> },
    toolbarLayouts: ToolbarLayoutProvider | null = null
  ) {
    this.store = store
    this.sampler = sampler
    this.toolbarLayouts = toolbarLayouts
  }

  /** Builds windows from the persisted settings (called once on startup). */
  start(): void {
    this.onSettingsChanged()
  }

  /** Re-applies settings: rebuilds the window set and starts/stops polling. */
  onSettingsChanged(): void {
    this.reconcile()
    this.applySyncedPositions()
    this.syncPolling()
  }

  /** Repositions synced widgets after the toolbar moves or changes dock. */
  onToolbarLayoutChanged(): void {
    if (!this.isSyncEnabled()) return
    this.applySyncedPositions()
  }

  dispose(): void {
    this.stopPolling()
    if (this.screenWired) {
      screen.removeListener('display-added', this.onDisplaysChanged)
      screen.removeListener('display-removed', this.onDisplaysChanged)
      screen.removeListener('display-metrics-changed', this.onDisplaysChanged)
      this.screenWired = false
    }
    for (const stop of this.untrack.values()) stop()
    this.untrack.clear()
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.wins.clear()
  }

  private onDisplaysChanged = (): void => {
    this.reconcile()
    this.applySyncedPositions()
  }

  /** Resolves the desired (display x widget) set and creates/destroys windows to match. */
  private reconcile(): void {
    this.ensureScreenListeners()
    const settings = this.store.getSettings()
    const enabled = Boolean(settings.resourceMonitorEnabled)
    const widgets = enabled ? this.enabledWidgets(settings.resourceMonitorWidgets) : []
    const displays = enabled && widgets.length > 0 ? this.targetDisplays() : []

    const wanted = new Map<string, { display: DisplayLike; widget: ResourceWidgetId; index: number }>()
    for (const display of displays) {
      widgets.forEach((widget, index) => {
        wanted.set(widgetKey(String(display.id), widget), { display, widget, index })
      })
    }

    for (const [key, win] of this.wins) {
      if (!wanted.has(key)) {
        this.untrack.get(key)?.()
        this.untrack.delete(key)
        if (!win.isDestroyed()) win.destroy()
        this.wins.delete(key)
      }
    }

    for (const [key, { display, widget, index }] of wanted) {
      if (this.wins.has(key)) continue
      this.repositioning = true
      const win = createResourceWidgetWindow(widget, this.resolveBounds(key, display, widget, index))
      this.repositioning = false
      win.on('closed', () => {
        this.untrack.get(key)?.()
        this.untrack.delete(key)
        this.wins.delete(key)
      })
      this.untrack.set(
        key,
        trackWindowBounds(win, (bounds) => {
          this.store.setResourceWidgetBounds(key, bounds)
          if (this.isSyncEnabled() && !this.repositioning) {
            this.store.setResourceWidgetDetached(key, true)
          }
        })
      )
      win.webContents.on('did-finish-load', () => {
        if (!win.isDestroyed()) win.showInactive()
      })
      this.wins.set(key, win)
    }
  }

  private applySyncedPositions(): void {
    if (!this.isSyncEnabled()) return

    this.repositioning = true
    try {
      for (const key of this.wins.keys()) {
        if (this.store.isResourceWidgetDetached(key)) continue
        const parsed = parseWidgetKey(key)
        if (!parsed) continue
        const display = this.displayLikeFor(parsed.displayId)
        if (!display) continue
        const bounds = this.layoutBounds(parsed.displayId, parsed.widgetId, display)
        const win = this.wins.get(key)
        if (!win || win.isDestroyed()) continue
        win.setBounds(bounds)
      }
    } finally {
      this.repositioning = false
    }
  }

  private enabledWidgets(ids: ResourceWidgetId[] | undefined): ResourceWidgetId[] {
    const selected = new Set(ids ?? WIDGET_ORDER)
    return WIDGET_ORDER.filter((id) => selected.has(id))
  }

  private targetDisplays(): DisplayLike[] {
    const likes = screen.getAllDisplays().map(displayToLike)
    const primaryId = screen.getPrimaryDisplay().id
    const enabled = this.store.getSettings().resourceMonitorDisplayIds ?? []
    return resolveEnabledDisplays(likes, enabled, primaryId)
  }

  private displayLikeFor(displayId: string): DisplayLike | null {
    const display = screen.getAllDisplays().find((d) => String(d.id) === displayId)
    return display ? displayToLike(display) : null
  }

  private toolbarLayoutFor(displayId: string): ToolbarLayoutSnapshot | null {
    return this.toolbarLayouts?.getToolbarLayouts().find((l) => l.displayId === displayId) ?? null
  }

  private syncedIndex(displayId: string, widgetId: ResourceWidgetId): number {
    const widgets = this.enabledWidgets(this.store.getSettings().resourceMonitorWidgets)
    const synced = widgets.filter(
      (id) => !this.store.isResourceWidgetDetached(widgetKey(displayId, id))
    )
    const index = synced.indexOf(widgetId)
    return index >= 0 ? index : 0
  }

  private layoutBounds(
    displayId: string,
    widgetId: ResourceWidgetId,
    display: DisplayLike
  ): Rect {
    const settings = this.store.getSettings()
    const placement = settings.resourceMonitorPlacement ?? 'below'
    const layout = this.toolbarLayoutFor(displayId)
    const workArea = display.workArea
    const syncedIndex = this.syncedIndex(displayId, widgetId)
    const bounds = computeResourceWidgetBounds(placement, layout, workArea, syncedIndex)
    const clamped = clampResourceWidgetBounds(bounds, workArea)
    return { x: clamped.x, y: clamped.y, width: WIDTH, height: HEIGHT }
  }

  /** Restores saved/detached positions or stacks widgets beside the toolbar. */
  private resolveBounds(
    key: string,
    display: DisplayLike,
    widget: ResourceWidgetId,
    _index: number
  ): Rect {
    const sync = this.isSyncEnabled()
    const detached = this.store.isResourceWidgetDetached(key)

    if (sync && !detached) {
      return this.layoutBounds(String(display.id), widget, display)
    }

    const saved = this.store.getResourceWidgetBounds(key)
    if (saved) {
      const clamped = clampResourceWidgetBounds(saved, display.workArea)
      return { x: clamped.x, y: clamped.y, width: WIDTH, height: HEIGHT }
    }

    return this.layoutBounds(String(display.id), widget, display)
  }

  private isSyncEnabled(): boolean {
    return this.store.getSettings().resourceMonitorSyncWithToolbar !== false
  }

  private syncPolling(): void {
    if (this.wins.size > 0) this.startPolling()
    else this.stopPolling()
  }

  private startPolling(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async poll(): Promise<void> {
    const snapshot = await this.sampler.sample(this.diskPath())
    for (const win of this.wins.values()) {
      if (!win.isDestroyed()) win.webContents.send(CH.resourcesPush, snapshot)
    }
  }

  private diskPath(): string {
    const project = this.store.getActiveProjectPath()
    if (project) return project
    const systemDrive = process.env['SystemDrive']
    return systemDrive ? `${systemDrive}\\` : '/'
  }

  private ensureScreenListeners(): void {
    if (this.screenWired) return
    this.screenWired = true
    screen.on('display-added', this.onDisplaysChanged)
    screen.on('display-removed', this.onDisplaysChanged)
    screen.on('display-metrics-changed', this.onDisplaysChanged)
  }
}
