import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import type { DetachedPanelController } from '../overlay/DetachedPanelController.js'
import type { OverlayManager } from '../overlay/OverlayManager.js'

/**
 * Owns the Windows system-tray icon. VibeBar's windows all set `skipTaskbar`, so the tray is the
 * only persistent system-level handle on the running app. Its context menu lets the user toggle
 * the toolbar's visibility, open Settings, or quit outright. Left-clicking the icon also toggles
 * the toolbar so the common case is one click.
 */
export class TrayController {
  private readonly overlay: OverlayManager
  private readonly detachedPanels: DetachedPanelController
  private tray: Tray | null = null

  constructor(overlay: OverlayManager, detachedPanels: DetachedPanelController) {
    this.overlay = overlay
    this.detachedPanels = detachedPanels
  }

  start(): void {
    if (this.tray) return
    const tray = new Tray(this.icon())
    tray.setToolTip('VibeBar')
    tray.on('click', () => {
      this.overlay.toggleVisible()
      this.rebuildMenu()
    })
    this.tray = tray
    this.rebuildMenu()
  }

  dispose(): void {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy()
    this.tray = null
  }

  /** Rebuilds the context menu so the Show/Hide label reflects the toolbar's current state. */
  private rebuildMenu(): void {
    if (!this.tray) return
    const menu = Menu.buildFromTemplate([
      {
        label: this.overlay.isVisible() ? 'Hide Toolbar' : 'Show Toolbar',
        click: () => {
          this.overlay.toggleVisible()
          this.rebuildMenu()
        }
      },
      {
        label: 'Open Settings',
        click: () => this.detachedPanels.show('settings')
      },
      { type: 'separator' },
      {
        label: 'Close VibeBar',
        click: () => app.quit()
      }
    ])
    this.tray.setContextMenu(menu)
  }

  /**
   * Resolves the tray icon. In dev the asset lives in the app's `build/` folder; in a packaged
   * build `build/icon.png` is copied to the resources root via electron-builder `extraResources`.
   */
  private icon(): Electron.NativeImage {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(app.getAppPath(), 'build', 'icon.png')
    return nativeImage.createFromPath(path)
  }
}
