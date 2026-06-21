import type { ErrorReport } from '@shared/api.js'
import { redactSecrets } from '../shared/redactErrors'
import '../shared/styles.css'

/**
 * The in-app error console window (bottom-left, always-on-top overlay).
 *
 * Built entirely with safe DOM APIs — every untrusted value is written via `textContent` or as a
 * text node, and `innerHTML`/`outerHTML`/`document.write` are never used. It receives the live,
 * already-redacted error list from main over IPC, applies a second redaction pass before copying
 * (defense in depth), and falls back to a manual-copy textarea if the clipboard is unavailable.
 *
 * No inline scripts, no eval, no remote loading: the page is a bundled ES module served from
 * 'self', so it satisfies the app's strict production CSP unchanged.
 */

const MAX_ENTRIES = 50
const COPY_NOTE = 'This console only stores errors locally for debugging.'

let reports: ErrorReport[] = []

const root = document.getElementById('root')

// --- small DOM helpers (no innerHTML) -------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { class?: string; text?: string; style?: Partial<CSSStyleDeclaration> } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (opts.class) node.className = opts.class
  if (opts.text !== undefined) node.textContent = opts.text
  if (opts.style) Object.assign(node.style, opts.style)
  return node
}

function button(label: string, onClick: () => void, accent = false): HTMLButtonElement {
  const b = el('button', { text: label, class: 'vibe-no-drag' })
  Object.assign(b.style, {
    cursor: 'pointer',
    border: '1px solid var(--color-vibe-border)',
    borderRadius: '8px',
    padding: '4px 10px',
    fontSize: '12px',
    color: accent ? '#0d0f14' : 'var(--color-vibe-text)',
    background: accent ? 'var(--color-vibe-accent)' : 'rgba(255,255,255,0.04)'
  })
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

// --- static shell ---------------------------------------------------------------------------

const panel = el('div', { class: 'vibe-glass is-solid' })
Object.assign(panel.style, {
  position: 'absolute',
  inset: '0',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
  opacity: '0',
  transform: 'translateY(14px) scale(0.98)',
  transition: 'opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)'
})

const header = el('div', { class: 'vibe-drag' })
Object.assign(header.style, {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-vibe-border)'
})

const title = el('h1', { text: 'App Error Console' })
Object.assign(title.style, {
  margin: '0',
  fontSize: '13px',
  fontWeight: '600',
  letterSpacing: '0.2px',
  color: 'var(--color-vibe-text)'
})

const actions = el('div')
Object.assign(actions.style, { display: 'flex', gap: '6px' })
actions.appendChild(button('Copy Errors', () => void copyErrors()))
actions.appendChild(button('Clear', () => void clearErrors()))
actions.appendChild(button('Close', () => void closeConsole(), true))

header.appendChild(title)
header.appendChild(actions)

const note = el('div', { text: COPY_NOTE })
Object.assign(note.style, {
  padding: '6px 12px',
  fontSize: '11px',
  color: 'var(--color-vibe-muted)',
  borderBottom: '1px solid var(--color-vibe-border)'
})

const list = el('div', { class: 'vibe-scroll' })
Object.assign(list.style, {
  flex: '1',
  minHeight: '0',
  overflowY: 'auto',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
})

panel.appendChild(header)
panel.appendChild(note)
panel.appendChild(list)
if (root) root.appendChild(panel)

// Slide/fade in on first paint.
requestAnimationFrame(() => {
  panel.style.opacity = '1'
  panel.style.transform = 'translateY(0) scale(1)'
})

// --- rendering ------------------------------------------------------------------------------

function metaLine(report: ErrorReport): string {
  const where = [report.source, report.line, report.column]
    .filter((p) => p !== null && p !== '' && p !== undefined)
    .join(':')
  const time = new Date(report.timestamp).toLocaleTimeString()
  return where ? `${time} \u00b7 ${where}` : time
}

function renderEntry(report: ErrorReport): HTMLElement {
  const card = el('div')
  Object.assign(card.style, {
    border: '1px solid var(--color-vibe-border)',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.28)',
    padding: '8px 10px'
  })

  const top = el('div')
  Object.assign(top.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px'
  })

  const badge = el('span', {
    text: report.kind === 'unhandledrejection' ? 'rejection' : 'error'
  })
  Object.assign(badge.style, {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    padding: '1px 6px',
    borderRadius: '999px',
    color: '#0d0f14',
    background:
      report.kind === 'unhandledrejection'
        ? 'var(--color-vibe-accent-2)'
        : '#f97583'
  })

  const meta = el('span', { text: metaLine(report) })
  Object.assign(meta.style, { fontSize: '11px', color: 'var(--color-vibe-muted)' })

  top.appendChild(badge)
  top.appendChild(meta)

  // Untrusted text — written as textContent, never parsed as HTML.
  const message = el('div', { text: report.message })
  Object.assign(message.style, {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-vibe-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  })

  card.appendChild(top)
  card.appendChild(message)

  if (report.stack) {
    const pre = el('pre', { text: report.stack, class: 'vibe-scroll' })
    Object.assign(pre.style, {
      margin: '6px 0 0',
      maxHeight: '160px',
      overflow: 'auto',
      fontSize: '11px',
      lineHeight: '1.45',
      color: 'var(--color-vibe-muted)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    })
    card.appendChild(pre)
  }

  return card
}

function render(): void {
  // Clear without innerHTML.
  while (list.firstChild) list.removeChild(list.firstChild)

  if (reports.length === 0) {
    const empty = el('div', { text: 'No errors captured.' })
    Object.assign(empty.style, {
      padding: '16px',
      textAlign: 'center',
      fontSize: '12px',
      color: 'var(--color-vibe-muted)'
    })
    list.appendChild(empty)
    return
  }

  // Newest first.
  for (const report of [...reports].reverse().slice(0, MAX_ENTRIES)) {
    list.appendChild(renderEntry(report))
  }
}

// --- actions --------------------------------------------------------------------------------

function buildReportText(): string {
  return reports
    .slice(-MAX_ENTRIES)
    .reverse()
    .map((r) => {
      const lines = [
        `[${r.kind}] ${r.timestamp}`,
        r.message,
        r.source ? `at ${[r.source, r.line, r.column].filter(Boolean).join(':')}` : '',
        r.stack
      ].filter(Boolean)
      return lines.join('\n')
    })
    .join('\n\n----------------------------------------\n\n')
}

async function copyErrors(): Promise<void> {
  // Second redaction pass before the text ever reaches the clipboard.
  const text = redactSecrets(buildReportText())
  try {
    const result = await window.vibebar?.clipboard?.write(text)
    if (!result?.copied) throw new Error('clipboard write reported failure')
  } catch {
    showCopyFallback(text)
  }
}

async function clearErrors(): Promise<void> {
  reports = []
  render()
  try {
    await window.vibebar?.errors?.clear()
  } catch {
    /* local view already cleared; ignore */
  }
}

async function closeConsole(): Promise<void> {
  // Play the exit animation, then ask main to hide the window.
  panel.style.opacity = '0'
  panel.style.transform = 'translateY(14px) scale(0.98)'
  window.setTimeout(() => {
    void window.vibebar?.errors?.close()
  }, 200)
}

/** Visible manual-copy escape hatch when the clipboard path fails. */
function showCopyFallback(text: string): void {
  const overlay = el('div')
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    zIndex: '50'
  })

  const box = el('div', { class: 'vibe-glass is-solid' })
  Object.assign(box.style, {
    width: '100%',
    maxWidth: '420px',
    borderRadius: '14px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  })

  const heading = el('div', { text: 'Copy manually' })
  Object.assign(heading.style, {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-vibe-text)'
  })

  const hint = el('div', {
    text: 'Automatic copy was blocked. Select all and copy this text yourself.'
  })
  Object.assign(hint.style, { fontSize: '11px', color: 'var(--color-vibe-muted)' })

  const area = el('textarea', { class: 'vibe-scroll' })
  area.readOnly = true
  area.value = text
  area.rows = 12
  Object.assign(area.style, {
    width: '100%',
    resize: 'none',
    borderRadius: '8px',
    border: '1px solid var(--color-vibe-border)',
    background: 'rgba(0,0,0,0.35)',
    color: 'var(--color-vibe-text)',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    padding: '8px'
  })

  const dismiss = button('Close', () => overlay.remove(), true)
  const row = el('div')
  Object.assign(row.style, { display: 'flex', justifyContent: 'flex-end' })
  row.appendChild(dismiss)

  box.appendChild(heading)
  box.appendChild(hint)
  box.appendChild(area)
  box.appendChild(row)
  overlay.appendChild(box)
  panel.appendChild(overlay)

  area.focus()
  area.select()
}

// --- live data ------------------------------------------------------------------------------

window.vibebar?.errors?.onPush((incoming) => {
  reports = Array.isArray(incoming) ? incoming.slice(-MAX_ENTRIES) : []
  render()
  // A fresh error should re-reveal the panel if it was animated out.
  panel.style.opacity = '1'
  panel.style.transform = 'translateY(0) scale(1)'
})

render()
