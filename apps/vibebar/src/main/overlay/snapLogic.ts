import type { DockSide, Orientation } from '@shared/types.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Picks the work-area edge the window is closest to. Bottom is intentionally excluded:
 * VibeBar docks left, right, or top only (left/right stay vertical, top goes horizontal).
 */
export function nearestDock(win: Rect, workArea: Rect): DockSide {
  const distLeft = win.x - workArea.x
  const distRight = workArea.x + workArea.width - (win.x + win.width)
  const distTop = win.y - workArea.y

  let dock: DockSide = 'left'
  let best = distLeft
  if (distRight < best) {
    best = distRight
    dock = 'right'
  }
  if (distTop < best) {
    dock = 'top'
  }
  return dock
}

/**
 * Distance in pixels from the window to a given dock edge. Used to decide when the toolbar is
 * close enough to "magnetically" lock onto that edge while dragging.
 */
export function dockDistance(dock: DockSide, win: Rect, workArea: Rect): number {
  if (dock === 'left') return win.x - workArea.x
  if (dock === 'right') return workArea.x + workArea.width - (win.x + win.width)
  return win.y - workArea.y // top
}

/**
 * Default magnetic catch zone. Within this distance of an edge the toolbar snaps flush while
 * still dragging, making it easy to lock to a side without pixel-perfect aim.
 */
export const SNAP_THRESHOLD = 180

/**
 * Returns the edge to magnetically lock onto for a live drag position, or null when the window
 * is still in the free middle zone (beyond the catch distance of the nearest edge).
 */
export function snapTarget(win: Rect, workArea: Rect, threshold = SNAP_THRESHOLD): DockSide | null {
  const dock = nearestDock(win, workArea)
  return dockDistance(dock, win, workArea) <= threshold ? dock : null
}

export function orientationFor(dock: DockSide): Orientation {
  return dock === 'top' ? 'horizontal' : 'vertical'
}

/**
 * Computes the flush-to-edge window rect for a dock side. `thickness` is the toolbar's
 * short dimension, `length` its long dimension, and `panelExtent` the inward space an open
 * panel needs (0 when collapsed). `anchor` is the current free-axis position, preserved and
 * clamped so the toolbar does not jump along the edge when docking or expanding.
 */
export function dockedRect(
  dock: DockSide,
  workArea: Rect,
  thickness: number,
  length: number,
  panelExtent: number,
  anchor: number
): Rect {
  if (dock === 'top') {
    const width = Math.min(length, workArea.width)
    const height = thickness + panelExtent
    const x = clamp(anchor, workArea.x, workArea.x + workArea.width - width)
    return { x, y: workArea.y, width, height }
  }

  const width = thickness + panelExtent
  const height = Math.min(length, workArea.height)
  const y = clamp(anchor, workArea.y, workArea.y + workArea.height - height)
  const x = dock === 'left' ? workArea.x : workArea.x + workArea.width - width
  return { x, y, width, height }
}
