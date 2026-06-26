import type { ResourceSnapshot, ResourceWidgetId } from '@shared/types.js'
import '../shared/styles.css'

/**
 * A single floating system-resource widget (RAM, CPU, disk, or VibeBar memory). The window is a
 * tiny, always-on-top, transparent frame; this renders one rounded glass chip inside it that the
 * user drags freely (the whole chip is a `-webkit-app-region: drag` region). The target metric is
 * chosen by the `widget` query param, and live values arrive over IPC from the main-process poller.
 *
 * Built with safe DOM APIs only (no innerHTML), matching the error console window's approach.
 */

const AMBER = '#f5a623'
const RED = '#f97583'

type Level = 'ok' | 'warn' | 'danger'

interface WidgetView {
  label: string
  /** Big primary readout (e.g. "72%"). */
  value: (s: ResourceSnapshot) => string
  /** Small muted line under the bar (e.g. "11.2 / 32 GB"). */
  detail: (s: ResourceSnapshot) => string
  /** Bar fill 0-100. */
  percent: (s: ResourceSnapshot) => number
  level: (s: ResourceSnapshot) => Level
}

const VIEWS: Record<ResourceWidgetId, WidgetView> = {
  ram: {
    label: 'RAM',
    value: (s) => `${Math.round(s.ram.usedPct)}%`,
    detail: (s) => `${s.ram.usedGb.toFixed(1)} / ${Math.round(s.ram.totalGb)} GB`,
    percent: (s) => s.ram.usedPct,
    level: (s) => (s.ram.usedPct > 85 ? 'danger' : s.ram.usedPct > 70 ? 'warn' : 'ok')
  },
  cpu: {
    label: 'CPU',
    value: (s) => `${Math.round(s.cpu.usagePct)}%`,
    detail: () => 'load',
    percent: (s) => s.cpu.usagePct,
    level: (s) => (s.cpu.usagePct > 90 ? 'danger' : s.cpu.usagePct > 75 ? 'warn' : 'ok')
  },
  disk: {
    label: 'DISK',
    value: (s) => `${Math.round(s.disk.freeGb)} GB`,
    detail: () => 'free',
    percent: (s) =>
      s.disk.totalGb > 0 ? ((s.disk.totalGb - s.disk.freeGb) / s.disk.totalGb) * 100 : 0,
    level: (s) => (s.disk.freeGb < 5 ? 'danger' : s.disk.freeGb < 20 ? 'warn' : 'ok')
  },
  appMem: {
    label: 'VIBEBAR',
    value: (s) => `${Math.round(s.appMem.rssMb)} MB`,
    detail: () => 'memory',
    percent: (s) => Math.min(100, (s.appMem.rssMb / 1024) * 100),
    level: (s) => (s.appMem.rssMb > 800 ? 'danger' : s.appMem.rssMb > 400 ? 'warn' : 'ok')
  }
}

function colorFor(level: Level): string {
  if (level === 'danger') return RED
  if (level === 'warn') return AMBER
  return 'var(--color-vibe-accent)'
}

const root = document.getElementById('root')

// Transparent window frame so the chip's rounded corners show through (matches the overlay).
document.documentElement.classList.add('vibe-overlay-root')
document.body.classList.add('vibe-overlay-root')

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

const params = new URLSearchParams(window.location.search)
const widgetId = (params.get('widget') ?? 'ram') as ResourceWidgetId
const view = VIEWS[widgetId] ?? VIEWS.ram

// --- chip shell -----------------------------------------------------------------------------

const chip = el('div', { class: 'vibe-glass is-solid vibe-drag' })
Object.assign(chip.style, {
  position: 'absolute',
  inset: '0',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '5px',
  padding: '8px 10px',
  borderRadius: '14px',
  overflow: 'hidden',
  boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
  cursor: 'grab',
  opacity: '0',
  transform: 'scale(0.96)',
  transition: 'opacity 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1)'
})

const topRow = el('div')
Object.assign(topRow.style, {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px'
})

const label = el('span', { text: view.label })
Object.assign(label.style, {
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.6px',
  color: 'var(--color-vibe-muted)'
})

const value = el('span', { text: '--' })
Object.assign(value.style, {
  fontSize: '15px',
  fontWeight: '700',
  color: 'var(--color-vibe-text)'
})

topRow.appendChild(label)
topRow.appendChild(value)

const barTrack = el('div')
Object.assign(barTrack.style, {
  height: '4px',
  borderRadius: '999px',
  background: 'rgba(255,255,255,0.1)',
  overflow: 'hidden'
})

const barFill = el('div')
Object.assign(barFill.style, {
  height: '100%',
  width: '0%',
  borderRadius: '999px',
  background: 'var(--color-vibe-accent)',
  transition: 'width 320ms ease, background 320ms ease'
})
barTrack.appendChild(barFill)

const detail = el('span', { text: '' })
Object.assign(detail.style, {
  fontSize: '10px',
  color: 'var(--color-vibe-muted)'
})

chip.appendChild(topRow)
chip.appendChild(barTrack)
chip.appendChild(detail)
if (root) root.appendChild(chip)

requestAnimationFrame(() => {
  chip.style.opacity = '1'
  chip.style.transform = 'scale(1)'
})

// --- live updates ---------------------------------------------------------------------------

function render(snapshot: ResourceSnapshot): void {
  const level = view.level(snapshot)
  const color = colorFor(level)
  value.textContent = view.value(snapshot)
  value.style.color = level === 'ok' ? 'var(--color-vibe-text)' : color
  detail.textContent = view.detail(snapshot)
  const pct = Math.max(0, Math.min(100, view.percent(snapshot)))
  barFill.style.width = `${pct}%`
  barFill.style.background = color
}

window.vibebar?.resources?.onPush((snapshot) => render(snapshot))
