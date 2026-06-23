import { globalShortcut } from 'electron'
import type { OverlayManager } from '../overlay/OverlayManager.js'
import type { TerminalController } from '../terminal/TerminalController.js'
import type { AppStore } from '../settings/store.js'

/** Default global shortcuts — mirrored in Settings copy. */
export const HOTKEY_TOGGLE_TOOLBAR = 'CommandOrControl+Shift+H'
export const HOTKEY_COMMAND_PALETTE = 'CommandOrControl+Shift+P'
export const HOTKEY_TOGGLE_TERMINAL = 'CommandOrControl+Shift+T'

/**
 * Registers global shortcuts for high-flow actions. Respects the user's hotkeysEnabled setting
 * and unregisters everything on dispose so Windows does not leak listeners across relaunches.
 */
export class HotkeyController {
  private registered = false

  constructor(
    private readonly store: AppStore,
    private readonly overlay: OverlayManager,
    private readonly terminal: TerminalController
  ) {}

  start(): void {
    this.apply()
  }

  /** Re-register after settings change (e.g. hotkeys toggled off). */
  refresh(): void {
    this.unregisterAll()
    this.apply()
  }

  dispose(): void {
    this.unregisterAll()
  }

  private apply(): void {
    if (!this.store.getSettings().hotkeysEnabled) return
    if (this.registered) return

    const ok =
      globalShortcut.register(HOTKEY_TOGGLE_TOOLBAR, () => {
        this.overlay.toggleVisible()
      }) &&
      globalShortcut.register(HOTKEY_COMMAND_PALETTE, () => {
        if (!this.overlay.isVisible()) this.overlay.restoreAndFocus()
        this.overlay.openCommandPaletteHotkey()
      }) &&
      globalShortcut.register(HOTKEY_TOGGLE_TERMINAL, () => {
        this.terminal.toggle()
      })

    this.registered = ok
    if (!ok) {
      console.warn('VibeBar: some global hotkeys could not be registered (may be in use).')
    }
  }

  private unregisterAll(): void {
    globalShortcut.unregister(HOTKEY_TOGGLE_TOOLBAR)
    globalShortcut.unregister(HOTKEY_COMMAND_PALETTE)
    globalShortcut.unregister(HOTKEY_TOGGLE_TERMINAL)
    this.registered = false
  }
}
