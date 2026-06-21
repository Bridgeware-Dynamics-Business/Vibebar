import chokidar from 'chokidar'
import type { BrowserWindow } from 'electron'
import {
  compileIgnoreMatchers,
  getIgnoreGlobList,
  isIgnoredAbs,
  parseUserIgnoreLines
} from './ignore.js'
import { mirrorFull, type MirrorOptions } from './mirror.js'

export interface SyncStartPayload {
  sourceRoot: string
  destRoot: string
  ignoreText: string
  maxFileBytes: number | null
  debounceMs: number
}

const DEFAULT_DEBOUNCE_MS = 350

function log(
  win: BrowserWindow | null,
  instanceId: string,
  instanceTag: string,
  message: string
): void {
  const forConsole = `[${new Date().toISOString()}] [${instanceTag}] ${message}`
  console.log(forConsole)
  const forUi = `[${new Date().toISOString()}] ${message}`
  // Two string args: some Electron/renderer paths mishandle a single object payload on ipcRenderer.on
  win?.webContents.send('sync:log', instanceId, forUi)
}

function shortInstanceTag(instanceId: string): string {
  return instanceId.length <= 12 ? instanceId : instanceId.slice(0, 8)
}

export class SyncService {
  private readonly instanceId: string
  private readonly instanceTag: string
  private watcher: chokidar.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private mirrorOpts: MirrorOptions | null = null
  private win: BrowserWindow | null = null
  private debounceMs = DEFAULT_DEBOUNCE_MS
  private mirroring = false
  private mirrorQueued = false
  private paths: { sourceRoot: string; destRoot: string } | null = null

  constructor(instanceId: string) {
    this.instanceId = instanceId
    this.instanceTag = shortInstanceTag(instanceId)
  }

  getPaths(): { sourceRoot: string; destRoot: string } | null {
    return this.paths
  }

  isRunning(): boolean {
    return this.watcher !== null
  }

  private async runMirrorFull(): Promise<void> {
    if (!this.mirrorOpts || !this.win) return
    if (this.mirroring) {
      this.mirrorQueued = true
      return
    }
    this.mirroring = true
    const id = this.instanceId
    const tag = this.instanceTag
    const win = this.win
    try {
      do {
        this.mirrorQueued = false
        const r = await mirrorFull(this.mirrorOpts)
        log(
          win,
          id,
          tag,
          `Mirror: ${r.copied} updated, ${r.skipped} unchanged, ${r.deleted} removed`
        )
      } while (this.mirrorQueued)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log(win, id, tag, `Mirror error: ${msg}`)
    } finally {
      this.mirroring = false
    }
  }

  private scheduleMirror(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.runMirrorFull()
    }, this.debounceMs)
  }

  async start(payload: SyncStartPayload, win: BrowserWindow): Promise<void> {
    this.stop()
    const { sourceRoot, destRoot, ignoreText, maxFileBytes } = payload
    this.debounceMs =
      Number.isFinite(payload.debounceMs) && payload.debounceMs >= 50
        ? payload.debounceMs
        : DEFAULT_DEBOUNCE_MS
    this.win = win
    this.paths = { sourceRoot, destRoot }
    const id = this.instanceId
    const tag = this.instanceTag

    const extra = parseUserIgnoreLines(ignoreText)
    const matchIgnore = compileIgnoreMatchers(extra)
    const fgIgnore = getIgnoreGlobList(extra)

    this.mirrorOpts = {
      sourceRoot,
      destRoot,
      matchIgnore,
      fgIgnore,
      maxFileBytes,
      onSkip: (reason, rel) => {
        log(win, id, tag, `Skip (${reason}): ${rel}`)
      }
    }

    log(win, id, tag, 'Initial mirror...')
    await this.runMirrorFull()

    this.watcher = chokidar.watch(sourceRoot, {
      ignored: (p) => isIgnoredAbs(sourceRoot, p, matchIgnore),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      persistent: true
    })

    this.watcher.on('all', (event) => {
      if (event === 'error') return
      this.scheduleMirror()
    })

    this.watcher.on('error', (err) => {
      log(win, id, tag, `Watcher error: ${err.message}`)
    })

    log(win, id, tag, 'Watching source folder.')
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    void this.watcher?.close()
    this.watcher = null
    this.mirrorOpts = null
    this.paths = null
    this.mirrorQueued = false
    this.mirroring = false
  }
}
