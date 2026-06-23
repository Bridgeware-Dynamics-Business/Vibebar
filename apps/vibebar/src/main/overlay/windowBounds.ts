import type { BrowserWindow } from 'electron'
import type { WindowBounds } from '@shared/types.js'

const DEBOUNCE_MS = 500

/** Keeps saved bounds on-screen after display topology changes. */
export function clampWindowBounds(bounds: WindowBounds, workArea: {
  x: number
  y: number
  width: number
  height: number
}): WindowBounds {
  const width = Math.min(Math.max(bounds.width, 320), workArea.width)
  const height = Math.min(Math.max(bounds.height, 240), workArea.height)
  const x = Math.min(
    Math.max(bounds.x, workArea.x),
    workArea.x + workArea.width - width
  )
  const y = Math.min(
    Math.max(bounds.y, workArea.y),
    workArea.y + workArea.height - height
  )
  return { x, y, width, height }
}

/** Debounced persistence of a window's bounds on move/resize. */
export function trackWindowBounds(
  win: BrowserWindow,
  save: (bounds: WindowBounds) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const persist = (): void => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    save({ x: b.x, y: b.y, width: b.width, height: b.height })
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, DEBOUNCE_MS)
  }

  win.on('moved', schedule)
  win.on('resized', schedule)

  return () => {
    if (timer) clearTimeout(timer)
  }
}
