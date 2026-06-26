import { BrowserWindow, screen } from 'electron'
import type { ResourceSnapshot, ResourceWidgetId } from '@shared/types.js'
import { CH } from '@shared/channels.js'
import { resolveEnabledDisplays, type DisplayLike } from '../settings/displayUtils.js'
import { createResourceWidgetWindow } from '../overlay/windowFactory.js'
import { clampWindowBounds, trackWindowBounds } from '../overlay/windowBounds.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const WIDTH = 150
const HEIGHT = 62
const MARGIN = 16
const STAGGER = 8
const POLL_MS = 2000

/** Stable order so staggered defaults and reconcile output stay deterministic. */
const WIDGET_ORDER: ResourceWidgetId[] = ['ram', 'cpu', 'disk', 'appMem']

function displayToLike(d: Electron.Display): DisplayLike {
  return { id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea }
}

function widgetKey(displayId: string, widgetId: ResourceWidgetId): string {
  return `${displayId}:${widgetId}`
}

/**
 * Owns the floating system-resource widgets. The user enables them and picks which monitors and
 * which metrics to show in Settings; this manages one tiny, always-on-top window per
 * (display x enabled metric). Each window is freely draggable and its position is persisted
 * (keyed by `${displayId}:${widgetId}`), so the layout is restored on the next launch.
 *
 * Sampling polls the OS on an interval and pushes a snapshot to every open widget. The timer only
 * runs while the feature is enabled with at least one metric selected, so a disabled monitor costs
 * nothing in the background.
 */
export class ResourceMonitorController {
  private readonly store: AppStore
  private readonly sampler: { sample: (diskPath: string) => Promise<ResourceSnapshot> }
  private readonly wins = new Map<string, BrowserWindow>()
  private readonly untrack = new Map<string, () => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private screenWired = false

  constructor(
    store: AppStore,
    sampler: { sample: (diskPath: string) => Promise<ResourceSnapshot> }
  ) {
    this.store = store
    this.sampler = sampler
  }

  /** Builds windows from the persisted settings (called once on startup). */
  start(): void {
    this.onSettingsChanged()
  }

  /** Re-applies settings: rebuilds the window set and starts/stops polling. */
  onSettingsChanged(): void {
    this.reconcile()
    this.syncPolling()
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
      const win = createResourceWidgetWindow(widget, this.resolveBounds(key, display, index))
      win.on('closed', () => {
        this.untrack.get(key)?.()
        this.untrack.delete(key)
        this.wins.delete(key)
      })
      this.untrack.set(
        key,
        trackWindowBounds(win, (bounds) => this.store.setResourceWidgetBounds(key, bounds))
      )
      win.webContents.on('did-finish-load', () => {
        if (!win.isDestroyed()) win.showInactive()
      })
      this.wins.set(key, win)
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

  /** Restores a saved position (clamped on-screen) or stacks widgets at the top-right by default. */
  private resolveBounds(key: string, display: DisplayLike, index: number): Rect {
    const saved = this.store.getResourceWidgetBounds(key)
    if (saved) {
      const clamped = clampWindowBounds(saved, display.workArea)
      return { x: clamped.x, y: clamped.y, width: WIDTH, height: HEIGHT }
    }
    const wa = display.workArea
    return {
      x: wa.x + wa.width - WIDTH - MARGIN,
      y: wa.y + MARGIN + index * (HEIGHT + STAGGER),
      width: WIDTH,
      height: HEIGHT
    }
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
