import { BrowserWindow, dialog, ipcMain, screen } from 'electron'
import { CODESYNC_CHANNELS, registerCodeSyncIpc, type CodeSyncHandle } from '@vibebar/codesync'
import type { DockSide } from '@shared/types.js'
import { createCodeSyncWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const DEFAULT_W = 460
const DEFAULT_H = 720
const MARGIN = 88

/**
 * Manages the Code Sync companion and wires the sync engine into ipcMain. Code Sync renders as
 * a floating, always-on-top overlay that appears on the side opposite the toolbar (toolbar left
 * → Code Sync right). The window is created lazily and reused; the toolbar button toggles its
 * visibility (hiding preserves state). Config is persisted under the store's `codesync` namespace.
 */
export class CodeSyncController {
  private readonly store: AppStore
  private win: BrowserWindow | null = null
  private handle: CodeSyncHandle | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  register(): void {
    this.handle = registerCodeSyncIpc({
      ipcMain,
      store: {
        load: () => this.store.getCodeSyncConfig(),
        save: (partial) => this.store.saveCodeSyncConfig(partial)
      },
      pickFolder: async () => {
        const opts = { properties: ['openDirectory'] as const } satisfies Electron.OpenDialogOptions
        const result =
          this.win && !this.win.isDestroyed()
            ? await dialog.showOpenDialog(this.win, opts)
            : await dialog.showOpenDialog(opts)
        return result.canceled ? null : (result.filePaths[0] ?? null)
      },
      sendLog: (entry) => {
        if (this.win && !this.win.isDestroyed()) {
          this.win.webContents.send(CODESYNC_CHANNELS.log, entry)
        }
      }
    })
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

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide()
  }

  dispose(): void {
    this.handle?.dispose()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return
    this.win = createCodeSyncWindow(this.computeBounds())
    this.win.on('closed', () => {
      this.win = null
    })
  }

  /** Places Code Sync on the side opposite the toolbar dock, floating with a screen margin. */
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
      // Toolbar on the left → Code Sync on the right.
      x = wa.x + wa.width - width - MARGIN
    }
    return { x, y, width, height }
  }
}
