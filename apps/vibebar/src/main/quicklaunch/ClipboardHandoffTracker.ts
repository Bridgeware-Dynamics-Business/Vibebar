/** Clipboard copy is "recent" for paste-bridge within this window. */
export const RECENT_COPY_MS = 120_000

/**
 * Tracks when VibeBar last wrote meaningful content to the clipboard so Quick Launch can
 * optionally paste after opening Cursor (explicit opt-in via settings).
 */
export class ClipboardHandoffTracker {
  private lastCopyAt = 0

  recordCopy(): void {
    this.lastCopyAt = Date.now()
  }

  hasRecentCopy(maxAgeMs = RECENT_COPY_MS): boolean {
    if (this.lastCopyAt <= 0) return false
    return Date.now() - this.lastCopyAt <= maxAgeMs
  }

  /** Test helper — resets state. */
  reset(): void {
    this.lastCopyAt = 0
  }
}
