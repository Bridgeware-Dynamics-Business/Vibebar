import type { DockSide, Orientation } from '@shared/types.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Long-axis span of the docked toolbar after clamping to the monitor work area. */
export function barSpan(dock: DockSide, workArea: Rect, barLength: number): number {
  return dock === 'top'
    ? Math.min(barLength, workArea.width)
    : Math.min(barLength, workArea.height)
}

/**
 * Builds a probe rect centered on the release point. Edge detection and placement use this so a
 * tall vertical strip dragged to the top is judged by where the user let go, not stale bounds.
 */
export function probeAtCursor(cursor: Point, size: { width: number; height: number }): Rect {
  return {
    x: Math.round(cursor.x - size.width / 2),
    y: Math.round(cursor.y - size.height / 2),
    width: size.width,
    height: size.height
  }
}

/**
 * Distance in pixels from the window to a given dock edge. Negative values mean past the edge.
 */
export function dockDistance(dock: DockSide, win: Rect, workArea: Rect): number {
  if (dock === 'left') return win.x - workArea.x
  if (dock === 'right') return workArea.x + workArea.width - (win.x + win.width)
  return win.y - workArea.y
}

/**
 * Picks the work-area edge the window is closest to (by window bounds). Bottom is excluded:
 * VibeBar docks left, right, or top only.
 */
export function nearestDock(win: Rect, workArea: Rect): DockSide {
  const dLeft = dockDistance('left', win, workArea)
  const dRight = dockDistance('right', win, workArea)
  const dTop = dockDistance('top', win, workArea)

  let dock: DockSide = 'left'
  let best = dLeft
  if (dRight < best) {
    best = dRight
    dock = 'right'
  }
  if (dTop < best) {
    dock = 'top'
  }
  return dock
}

/**
 * Edge pick using the window center — fairer for long vertical strips where the leading corner
 * is still far from the top even when the user clearly dragged upward.
 */
export function nearestDockFromCenter(win: Rect, workArea: Rect): DockSide {
  const cx = win.x + win.width / 2
  const cy = win.y + win.height / 2

  const dLeft = cx - workArea.x
  const dRight = workArea.x + workArea.width - cx
  const dTop = cy - workArea.y

  let dock: DockSide = 'left'
  let best = dLeft
  if (dRight < best) {
    best = dRight
    dock = 'right'
  }
  if (dTop < best) {
    dock = 'top'
  }
  return dock
}

/** Magnetic catch zone (px). Within this distance of an edge the toolbar locks on drop. */
export const SNAP_THRESHOLD = 160

export function snapTarget(win: Rect, workArea: Rect, threshold = SNAP_THRESHOLD): DockSide | null {
  const dock = nearestDockFromCenter(win, workArea)
  return dockDistance(dock, win, workArea) <= threshold ? dock : null
}

export function orientationFor(dock: DockSide): Orientation {
  return dock === 'top' ? 'horizontal' : 'vertical'
}

export function orientationChanges(from: DockSide, to: DockSide): boolean {
  return orientationFor(from) !== orientationFor(to)
}

/**
 * Leading-edge anchor on the free axis so the whole toolbar is centered on the drop point and
 * fully inside the work area. `anchor` is always the start coordinate (x for top, y for sides).
 */
export function anchorFromDrop(
  dock: DockSide,
  probe: Rect,
  workArea: Rect,
  barLength: number
): number {
  const span = barSpan(dock, workArea, barLength)

  if (dock === 'top') {
    const centerX = probe.x + probe.width / 2
    const leadX = Math.round(centerX - span / 2)
    return clamp(leadX, workArea.x, workArea.x + workArea.width - span)
  }

  const centerY = probe.y + probe.height / 2
  const leadY = Math.round(centerY - span / 2)
  return clamp(leadY, workArea.y, workArea.y + workArea.height - span)
}

/** Default leading-edge anchor that centers the toolbar on a monitor. */
export function centerAnchor(dock: DockSide, workArea: Rect, barLength: number): number {
  const span = barSpan(dock, workArea, barLength)
  return dock === 'top'
    ? workArea.x + Math.round((workArea.width - span) / 2)
    : workArea.y + Math.round((workArea.height - span) / 2)
}

/**
 * Resolves dock + anchor after a drag ends. Top dock always centers horizontally so the full
 * bar is visible; side docks center vertically when the bar is taller than the work area.
 */
export function resolvePlacement(
  probe: Rect,
  workArea: Rect,
  barLength: number,
  threshold = SNAP_THRESHOLD
): { dock: DockSide; anchor: number } {
  const dock = resolveDockOnDrop(probe, workArea, threshold)

  /** Side docks: center on the free axis when the full bar cannot fit, otherwise follow the drop. */
  if (dock === 'top') {
    return { dock, anchor: centerAnchor('top', workArea, barLength) }
  }

  const span = barSpan(dock, workArea, barLength)
  if (span >= workArea.height - 1) {
    return { dock, anchor: centerAnchor(dock, workArea, barLength) }
  }

  const anchor = anchorFromDrop(dock, probe, workArea, barLength)
  const min = workArea.y
  const max = workArea.y + workArea.height - span
  if (anchor < min || anchor > max) {
    return { dock, anchor: centerAnchor(dock, workArea, barLength) }
  }

  return { dock, anchor }
}

/**
 * Picks the dock edge after a drag. Within the snap threshold the closest edge wins; otherwise
 * the mathematically nearest edge (toolbar is always edge-docked, never floating).
 */
export function resolveDockOnDrop(win: Rect, workArea: Rect, threshold = SNAP_THRESHOLD): DockSide {
  const edges: DockSide[] = ['left', 'right', 'top']
  const ranked = edges
    .map((dock) => ({ dock, dist: dockDistance(dock, win, workArea) }))
    .sort((a, b) => a.dist - b.dist)

  const bestDist = ranked[0]?.dist ?? Infinity
  const tied = ranked.filter((r) => r.dist === bestDist).map((r) => r.dock)

  if (bestDist <= threshold) {
    if (tied.length === 1) return tied[0]!
    // Corner tie: a tall strip dragged to the top-left/top-right prefers horizontal top dock.
    if (tied.includes('top') && win.height > win.width * 1.5) return 'top'
    return nearestDockFromCenter(win, workArea)
  }

  return nearestDockFromCenter(win, workArea)
}

/**
 * Flush-to-edge window rect. `anchor` is the leading position on the free axis (see anchorFromDrop).
 */
export function dockedRect(
  dock: DockSide,
  workArea: Rect,
  thickness: number,
  length: number,
  panelExtent: number,
  anchor: number
): Rect {
  const span = barSpan(dock, workArea, length)

  if (dock === 'top') {
    const height = thickness + panelExtent
    const x = clamp(anchor, workArea.x, workArea.x + workArea.width - span)
    return { x, y: workArea.y, width: span, height }
  }

  const width = thickness + panelExtent
  const y = clamp(anchor, workArea.y, workArea.y + workArea.height - span)
  const x = dock === 'left' ? workArea.x : workArea.x + workArea.width - width
  return { x, y, width, height: span }
}

/** @deprecated Use anchorFromDrop */
export function anchorFromBounds(dock: DockSide, win: Rect, workArea: Rect): number {
  return anchorFromDrop(dock, win, workArea, dock === 'top' ? win.width : win.height)
}
