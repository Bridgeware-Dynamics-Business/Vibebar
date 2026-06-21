import { MAX_SYNC_INSTANCES } from '../shared/constants.js'
import { conflictMessage, type RunningPair } from './pathConflict.js'
import { SyncService, type SyncLogger, type SyncStartPayload } from './service.js'

export class SyncManager {
  private readonly byId = new Map<string, SyncService>()
  private readonly logger: SyncLogger

  constructor(logger: SyncLogger) {
    this.logger = logger
  }

  private runningPairs(): RunningPair[] {
    const out: RunningPair[] = []
    for (const [id, svc] of this.byId) {
      const p = svc.getPaths()
      if (p && svc.isRunning()) {
        out.push({ id, sourceRoot: p.sourceRoot, destRoot: p.destRoot })
      }
    }
    return out
  }

  listStatus(): Array<{ id: string; running: boolean }> {
    return [...this.byId.entries()].map(([id, svc]) => ({
      id,
      running: svc.isRunning()
    }))
  }

  isRunning(id: string): boolean {
    return this.byId.get(id)?.isRunning() ?? false
  }

  async start(instanceId: string, payload: SyncStartPayload): Promise<void> {
    if (this.byId.size >= MAX_SYNC_INSTANCES && !this.byId.has(instanceId)) {
      throw new Error(`At most ${MAX_SYNC_INSTANCES} sync instances can run at once.`)
    }

    const existing = this.byId.get(instanceId)
    existing?.stop()
    this.byId.delete(instanceId)

    const msg = conflictMessage(payload.sourceRoot, payload.destRoot, this.runningPairs())
    if (msg) throw new Error(msg)

    const svc = new SyncService(instanceId, this.logger)
    await svc.start(payload)
    this.byId.set(instanceId, svc)
  }

  stop(instanceId: string): void {
    const svc = this.byId.get(instanceId)
    svc?.stop()
    this.byId.delete(instanceId)
  }

  stopAll(): void {
    for (const id of [...this.byId.keys()]) {
      this.stop(id)
    }
  }
}
