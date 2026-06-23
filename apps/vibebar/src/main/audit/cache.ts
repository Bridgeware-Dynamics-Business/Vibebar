import { createHash } from 'node:crypto'
import type { AuditFinding } from '@shared/types.js'

/**
 * In-memory, per-file findings cache keyed by (path + content hash). Auto-scan re-runs the audit on
 * a timer; between runs most files are byte-identical, so we reuse their previously-computed
 * file-scoped findings instead of re-parsing and re-scanning them. Project-scoped rules are cheap
 * and always re-run, so they are never cached here.
 */
export class FileFindingsCache {
  private store = new Map<string, AuditFinding[]>()
  /** Files served from cache during the current scan (reset by beginScan). */
  hits = 0

  private static hash(content: string): string {
    return createHash('sha1').update(content).digest('hex')
  }

  private static key(path: string, content: string): string {
    return `${path}\u0000${FileFindingsCache.hash(content)}`
  }

  beginScan(): void {
    this.hits = 0
  }

  get(path: string, content: string): AuditFinding[] | undefined {
    const hit = this.store.get(FileFindingsCache.key(path, content))
    if (hit) this.hits++
    return hit
  }

  set(path: string, content: string, findings: AuditFinding[]): void {
    this.store.set(FileFindingsCache.key(path, content), findings)
  }

  /** Drops stale entries for files no longer present (or changed), bounding memory across scans. */
  retain(currentKeys: Set<string>): void {
    for (const k of this.store.keys()) {
      if (!currentKeys.has(k)) this.store.delete(k)
    }
  }

  static keyFor(path: string, content: string): string {
    return FileFindingsCache.key(path, content)
  }

  clear(): void {
    this.store.clear()
    this.hits = 0
  }
}
