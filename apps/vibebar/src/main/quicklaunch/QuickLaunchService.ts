import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { dialog } from 'electron'
import type { QuickLaunchApp, QuickLaunchResult } from '@shared/types.js'
import type { AppStore } from '../settings/store.js'
import { ClipboardHandoffTracker } from './ClipboardHandoffTracker.js'
import { builtInCandidates } from './launchPaths.js'
import { findCursorCli, scheduleWindowsPaste } from './pasteBridge.js'

export interface QuickLaunchOptions {
  /** User explicitly opened Cursor from a copy toast — still gated by settings in main IPC. */
  fromCopyToast?: boolean
  /** Request paste-after-open when settings + recent copy allow it. */
  pasteAfterOpen?: boolean
}

/**
 * Launches external editors/apps (Cursor, Codex, or anything the user adds) straight from the
 * toolbar, opening the active project folder when one is selected. Like {@link GitHubService},
 * this is a deliberately narrow gateway to spawning external processes: the renderer can only
 * reference an app by id, and the executable path is set here — via built-in auto-detection or
 * the native file picker — so a compromised renderer can never coax the main process into
 * spawning an arbitrary command line.
 */
export class QuickLaunchService {
  readonly clipboardHandoff = new ClipboardHandoffTracker()

  constructor(private readonly store: AppStore) {}

  /**
   * Returns the configured apps, opportunistically auto-detecting and persisting paths for any
   * built-in entry whose path is still empty (first run, or after a fresh install of the editor).
   */
  list(): QuickLaunchApp[] {
    const apps = this.store.getQuickLaunchApps()
    let changed = false
    const resolved = apps.map((app) => {
      if (app.path || !app.builtIn) return app
      const detected = builtInCandidates(app.id, process.env, process.platform).find((p) =>
        existsSync(p)
      )
      if (!detected) return app
      changed = true
      return { ...app, path: detected }
    })
    return changed ? this.store.setQuickLaunchApps(resolved) : resolved
  }

  async launch(
    id: string,
    projectRoot: string | null,
    options?: QuickLaunchOptions
  ): Promise<QuickLaunchResult> {
    const app = this.list().find((a) => a.id === id)
    if (!app) return { ok: false, error: 'Quick launch app not found.' }
    if (!app.path) {
      return { ok: false, error: `Set the path to ${app.name} in Settings → Quick Launch first.` }
    }
    if (!existsSync(app.path)) {
      return {
        ok: false,
        error: `${app.name} wasn't found at its saved location. Update its path in Settings.`
      }
    }
    try {
      const args = projectRoot && existsSync(projectRoot) ? [projectRoot] : []
      const useCli =
        id === 'cursor' && findCursorCli(process.env, process.platform) != null
          ? findCursorCli(process.env, process.platform)!
          : app.path
      this.spawnDetached(useCli, args)

      const shouldPaste =
        id === 'cursor' &&
        Boolean(options?.pasteAfterOpen) &&
        (Boolean(options?.fromCopyToast) || this.clipboardHandoff.hasRecentCopy())

      if (!shouldPaste) {
        return { ok: true }
      }

      const pasted = await scheduleWindowsPaste()
      if (pasted) {
        return { ok: true, pasteAttempted: true, pasteSucceeded: true }
      }
      return {
        ok: true,
        pasteAttempted: true,
        pasteSucceeded: false,
        pasteNotice: 'Copied — paste in Cursor manually'
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async add(): Promise<QuickLaunchApp[]> {
    const picked = await this.pickExecutable()
    if (!picked) return this.list()
    const app: QuickLaunchApp = {
      id: `custom-${Date.now().toString(36)}`,
      name: prettyName(picked),
      path: picked,
      icon: 'Rocket'
    }
    return this.store.addQuickLaunchApp(app)
  }

  async locate(id: string): Promise<QuickLaunchApp[]> {
    const picked = await this.pickExecutable()
    if (!picked) return this.list()
    return this.store.updateQuickLaunchApp(id, { path: picked })
  }

  remove(id: string): QuickLaunchApp[] {
    return this.store.removeQuickLaunchApp(id)
  }

  /** Shows/hides an app in the toolbar without deleting it (it stays manageable in Settings). */
  setVisible(id: string, visible: boolean): QuickLaunchApp[] {
    return this.store.updateQuickLaunchApp(id, { visible })
  }

  private async pickExecutable(): Promise<string | null> {
    const filters =
      process.platform === 'win32'
        ? [{ name: 'Programs', extensions: ['exe', 'cmd', 'bat', 'lnk'] }]
        : process.platform === 'darwin'
          ? [{ name: 'Applications', extensions: ['app'] }]
          : []
    const result = await dialog.showOpenDialog({
      title: 'Choose an application to quick launch',
      buttonLabel: 'Add to Quick Launch',
      properties: ['openFile'],
      filters
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  }

  private spawnDetached(filePath: string, args: string[]): void {
    const opts = { detached: true, stdio: 'ignore' as const, windowsHide: true }
    if (process.platform === 'darwin' && filePath.endsWith('.app')) {
      // launcher is the .app bundle; `open -a` foregrounds it with the project arg.
      spawn('open', ['-a', filePath, ...args], opts).unref()
      return
    }
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(filePath)) {
      // Batch shims (e.g. an npm-global `codex.cmd`) must run through cmd.exe; passing the path
      // and args as separate argv entries sidesteps quoting issues with spaces.
      spawn('cmd.exe', ['/c', filePath, ...args], opts).unref()
      return
    }
    spawn(filePath, args, opts).unref()
  }
}

/** Derives a friendly display name from an executable path (e.g. `Code.exe` → "Code"). */
function prettyName(filePath: string): string {
  const base = basename(filePath, extname(filePath)).trim() || 'App'
  return base.charAt(0).toUpperCase() + base.slice(1)
}
