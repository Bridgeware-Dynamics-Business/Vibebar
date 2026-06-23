import { BrowserWindow, screen } from 'electron'
import type { DockSide } from '@shared/types.js'
import { createNoteWindow } from '../overlay/windowFactory.js'
import type { Rect } from '../overlay/snapLogic.js'
import type { AppStore } from '../settings/store.js'

const DEFAULT_W = 460
const DEFAULT_H = 720
const MARGIN = 88
/** Each new sticky note is nudged so stacked pop-outs don't land exactly on top of each other. */
const CASCADE = 28

/**
 * Manages the "sticky" note pop-out windows. Each note can pop out into its own frameless,
 * always-on-top overlay (mirroring Code Sync) that lives on screen independently of the main
 * Notes panel — closing the panel never closes a popped-out note. Windows are keyed by note id
 * and reused; popping out an already-open note just focuses it. Note content persists on disk via
 * the shared NotesService, so these windows hold only view state.
 */
export class NoteWindowController {
  private readonly store: AppStore
  private readonly wins = new Map<string, BrowserWindow>()

  constructor(store: AppStore) {
    this.store = store
  }

  /** Opens (or focuses) the sticky window for a note. */
  popOut(noteId: string): { ok: boolean } {
    const existing = this.wins.get(noteId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return { ok: true }
    }
    const win = createNoteWindow(noteId, this.computeBounds())
    win.on('closed', () => this.wins.delete(noteId))
    this.wins.set(noteId, win)
    win.show()
    win.focus()
    return { ok: true }
  }

  /** Pushes an event to every open sticky window (e.g. note saved elsewhere, project changed). */
  broadcast(channel: string, payload: unknown): void {
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

  /** Places a sticky note opposite the toolbar, cascading each subsequent window. */
  private computeBounds(): Rect {
    const wa = screen.getPrimaryDisplay().workArea
    const dock: DockSide = this.store.getSettings().dock
    const width = Math.min(DEFAULT_W, wa.width - 2 * MARGIN)
    const height = Math.min(DEFAULT_H, wa.height - 2 * MARGIN)
    const step = this.wins.size * CASCADE

    let x: number
    let y = Math.round(wa.y + (wa.height - height) / 2)
    if (dock === 'right') {
      x = wa.x + MARGIN
    } else if (dock === 'top') {
      x = Math.round(wa.x + (wa.width - width) / 2)
      y = wa.y + wa.height - height - MARGIN
    } else {
      x = wa.x + wa.width - width - MARGIN
    }
    // Cascade within the work area so stacked notes stay visible and on-screen.
    x = Math.min(x + step, wa.x + wa.width - width)
    y = Math.min(y + step, wa.y + wa.height - height)
    return { x, y, width, height }
  }
}
