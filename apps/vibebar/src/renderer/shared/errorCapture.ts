import type { ErrorReport } from '@shared/api.js'
import { redactSecrets } from './redactErrors'

/**
 * Renderer-side error capture for the in-app error console.
 *
 * Installs `error` (uncaught exceptions) and `unhandledrejection` listeners exactly once per
 * renderer, redacts every captured value locally (see ./redactErrors), and forwards the report to
 * the main process, which surfaces the always-on-top console window. Everything stays local: no
 * network, no telemetry, no remote code.
 *
 * Design constraints honored here:
 *  - Fail-safe: capturing/forwarding an error must never throw or recurse. A reentrancy guard plus
 *    blanket try/catch ensure a fault in the console can't cascade into more error events.
 *  - HMR-safe: installation is guarded by window.__APP_ERROR_CONSOLE_INSTALLED__.
 *  - Dev-only test hook: Ctrl+Shift+E throws a sample error, gated behind import.meta.env.DEV.
 */

let reporting = false
let counter = 0

function nextId(): string {
  counter = (counter + 1) % 1_000_000
  return `${Date.now().toString(36)}-${counter.toString(36)}`
}

/** Coerces any thrown value into a redacted, length-bounded string. Never throws. */
function safeString(value: unknown, max = 40_000): string {
  let text: string
  try {
    if (value instanceof Error) {
      text = value.stack || `${value.name}: ${value.message}`
    } else if (typeof value === 'string') {
      text = value
    } else {
      text = JSON.stringify(value)
    }
  } catch {
    text = '[unserializable error value]'
  }
  if (typeof text !== 'string') text = String(text)
  if (text.length > max) text = `${text.slice(0, max)}\u2026 [truncated]`
  return redactSecrets(text)
}

function send(report: ErrorReport): void {
  try {
    void window.vibebar?.errors?.report(report)
  } catch {
    // Bridge missing or IPC failed — swallow. The console is a debugging aid, never a hard dep.
  }
}

function handleError(event: ErrorEvent): void {
  if (reporting) return
  reporting = true
  try {
    const err = event.error
    send({
      id: nextId(),
      kind: 'error',
      message: safeString(event.message || (err instanceof Error ? err.message : err), 20_000),
      source: redactSecrets(String(event.filename ?? '')).slice(0, 4096),
      line: Number.isFinite(event.lineno) ? event.lineno : null,
      column: Number.isFinite(event.colno) ? event.colno : null,
      stack: err instanceof Error ? safeString(err.stack ?? '') : '',
      timestamp: new Date().toISOString()
    })
  } catch {
    // Never let the reporter itself surface a new error.
  } finally {
    reporting = false
  }
}

function handleRejection(event: PromiseRejectionEvent): void {
  if (reporting) return
  reporting = true
  try {
    const reason = event.reason
    send({
      id: nextId(),
      kind: 'unhandledrejection',
      message: safeString(reason instanceof Error ? reason.message : reason, 20_000),
      source: '',
      line: null,
      column: null,
      stack: reason instanceof Error ? safeString(reason.stack ?? '') : '',
      timestamp: new Date().toISOString()
    })
  } catch {
    // Swallow — see handleError.
  } finally {
    reporting = false
  }
}

/**
 * Installs the capture listeners once. Safe to call multiple times (e.g. on hot reload); the
 * global flag makes every call after the first a no-op.
 */
export function installErrorConsole(): void {
  try {
    if (typeof window === 'undefined' || window.__APP_ERROR_CONSOLE_INSTALLED__) return
    window.__APP_ERROR_CONSOLE_INSTALLED__ = true

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    // Dev-only verification hook. Disabled entirely in production builds (import.meta.env.DEV is
    // statically false there, so the listener is tree-shaken/never attached).
    if (import.meta.env.DEV) {
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
          e.preventDefault()
          // Thrown async so it bubbles to the global 'error' handler like a real uncaught error.
          setTimeout(() => {
            throw new Error('App Error Console test error (Ctrl+Shift+E)')
          }, 0)
        }
      })
    }
  } catch {
    // If installation fails the app must still run normally.
  }
}
