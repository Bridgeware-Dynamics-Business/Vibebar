import chokidar, { type FSWatcher } from 'chokidar'
import {
  compileIgnoreMatchers,
  getIgnoreGlobList,
  isIgnoredAbs,
  parseUserIgnoreLines
} from './ignore.js'
import { mirrorFull, type MirrorOptions } from './mirror.js'
import { relUnder } from './pathConflict.js'
import { DEFAULT_DEBOUNCE_MS } from '../shared/constants.js'

export interface SyncStartPayload {
  sourceRoot: string
  destRoot: string
  ignoreText: string
  maxFileBytes: number | null
  debounceMs: number
}

/** Receives a UI-facing log line for a given instance (timestamp prepended by caller if desired). */
export type SyncLogger = (instanceId: string, line: string) => void

function timestamp(): string {
  return new Date().toISOString()
}

function shortInstanceTag(instanceId: string): string {
  return instanceId.length <= 12 ? instanceId : instanceId.slice(0, 8)
}

export class SyncService {
  private readonly instanceId: string
  private readonly instanceTag: string
  private readonly logger: SyncLogger
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private mirrorOpts: MirrorOptions | null = null
  private debounceMs = DEFAULT_DEBOUNCE_MS
  private mirroring = false
  private mirrorQueued = false
  private paths: { sourceRoot: string; destRoot: string } | null = null
  /**
   * Cancellation flag handed to the running mirror. `stop()` flips `cancelled`, which aborts an
   * in-flight pass; `start()` installs a fresh token so a restart is not pre-cancelled.
   */
  private cancel: { cancelled: boolean } = { cancelled: false }

  constructor(instanceId: string, logger: SyncLogger) {
    this.instanceId = instanceId
    this.instanceTag = shortInstanceTag(instanceId)
    this.logger = logger
  }

  private log(message: string): void {
    console.log(`[${timestamp()}] [${this.instanceTag}] ${message}`)
    this.logger(this.instanceId, `[${timestamp()}] ${message}`)
  }

  getPaths(): { sourceRoot: string; destRoot: string } | null {
    return this.paths
  }

  isRunning(): boolean {
    return this.watcher !== null
  }

  private async runMirrorFull(): Promise<void> {
    // Capture the options (and their cancel signal) locally: stop() nulls this.mirrorOpts, and a
    // restart installs a new one — reading the field mid-pass would race with both.
    const opts = this.mirrorOpts
    if (!opts) return
    if (this.mirroring) {
      this.mirrorQueued = true
      return
    }
    this.mirroring = true
    try {
      do {
        this.mirrorQueued = false
        if (opts.signal?.cancelled) break
        const r = await mirrorFull(opts)
        this.log(`Mirror: ${r.copied} updated, ${r.skipped} unchanged, ${r.deleted} removed`)
      } while (this.mirrorQueued && !opts.signal?.cancelled)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log(`Mirror error: ${msg}`)
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

  async start(payload: SyncStartPayload): Promise<void> {
    this.stop()
    // Fresh token: stop() above marked the previous one cancelled, so a restart must not inherit it.
    this.cancel = { cancelled: false }
    const { sourceRoot, destRoot, ignoreText, maxFileBytes } = payload
    this.debounceMs =
      Number.isFinite(payload.debounceMs) && payload.debounceMs >= 50
        ? payload.debounceMs
        : DEFAULT_DEBOUNCE_MS
    this.paths = { sourceRoot, destRoot }

    const extra = parseUserIgnoreLines(ignoreText)

    // If the sync (destination) folder lives inside the source tree, exclude it from the
    // scan and watcher. Otherwise the source walk would re-ingest the destination's own
    // files and mirror them into a nested clone (dest/dest/dest…), duplicating the tree.
    const nestedDestRel = relUnder(sourceRoot, destRoot)
    if (nestedDestRel) {
      extra.push(nestedDestRel, `${nestedDestRel}/**`)
      this.log(`Sync folder is inside the source folder; excluding "${nestedDestRel}/" from mirroring.`)
    }

    const matchIgnore = compileIgnoreMatchers(extra)
    const fgIgnore = getIgnoreGlobList(extra)

    this.mirrorOpts = {
      sourceRoot,
      destRoot,
      matchIgnore,
      fgIgnore,
      maxFileBytes,
      signal: this.cancel,
      onSkip: (reason, rel) => {
        this.log(`Skip (${reason}): ${rel}`)
      }
    }

    this.log('Initial mirror...')
    await this.runMirrorFull()

    this.watcher = chokidar.watch(sourceRoot, {
      ignored: (p: string) => isIgnoredAbs(sourceRoot, p, matchIgnore),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      persistent: true
    })

    this.watcher.on('all', (event: string) => {
      if (event === 'error') return
      this.scheduleMirror()
    })

    this.watcher.on('error', (err: unknown) => {
      this.log(`Watcher error: ${err instanceof Error ? err.message : String(err)}`)
    })

    this.log('Watching source folder.')
  }

  stop(): void {
    // Flip the token first so any in-flight mirror pass aborts at its next checkpoint instead
    // of running to completion (the delete phase would otherwise keep mutating the destination).
    this.cancel.cancelled = true
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    void this.watcher?.close()
    this.watcher = null
    this.mirrorOpts = null
    this.paths = null
    this.mirrorQueued = false
    // Reset so a subsequent start() is not blocked by the guard in runMirrorFull; the cancelled
    // pass (if any) will abort at its next checkpoint and its own finally is now a no-op.
    this.mirroring = false
  }
}
