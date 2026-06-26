import type { DockSide } from './types.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Collapsed toolbar placement on one monitor — used to position synced resource widgets. */
export interface ToolbarLayoutSnapshot {
  displayId: string
  dock: DockSide
  workArea: Rect
  toolbarBounds: Rect
}

export type ResourceWidgetPlacement = 'below' | 'above'

export const RESOURCE_WIDGET_WIDTH = 150
export const RESOURCE_WIDGET_HEIGHT = 62
/** Gap between toolbar and widgets for above placement. */
export const RESOURCE_WIDGET_GAP = 12
/** Clearance below the toolbar bottom edge (below placement). */
export const RESOURCE_WIDGET_BELOW_CLEARANCE = 16
export const RESOURCE_WIDGET_MARGIN = 16

function spreadStep(index: number): number {
  return index * (RESOURCE_WIDGET_WIDTH + RESOURCE_WIDGET_GAP)
}

function workAreaBottom(workArea: Rect): number {
  return workArea.y + workArea.height
}

/** Horizontal row under a top-docked toolbar strip. */
function belowTopDock(toolbar: Rect, index: number): { x: number; y: number } {
  return {
    x: toolbar.x + spreadStep(index),
    y: toolbar.y + toolbar.height + RESOURCE_WIDGET_BELOW_CLEARANCE
  }
}

/**
 * Below a left/right toolbar: horizontal row aligned with the toolbar edge, spreading
 * outward along the bottom. When the screen bottom is tight, the row sits on the last row
 * under the bar instead of shifting to the side.
 */
function belowSideDock(
  dock: 'left' | 'right',
  toolbar: Rect,
  workArea: Rect,
  index: number
): { x: number; y: number } {
  const rowY = toolbar.y + toolbar.height + RESOURCE_WIDGET_BELOW_CLEARANCE
  const fitsBelow = rowY + RESOURCE_WIDGET_HEIGHT <= workAreaBottom(workArea)
  const y = fitsBelow ? rowY : toolbar.y + toolbar.height - RESOURCE_WIDGET_HEIGHT

  if (dock === 'left') {
    return { x: toolbar.x + spreadStep(index), y }
  }
  return {
    x: toolbar.x + toolbar.width - RESOURCE_WIDGET_WIDTH - spreadStep(index),
    y
  }
}

/** Horizontal row above the top edge of the toolbar. */
function aboveToolbar(toolbar: Rect, index: number, dock: DockSide): { x: number; y: number } {
  const y = toolbar.y - RESOURCE_WIDGET_GAP - RESOURCE_WIDGET_HEIGHT
  if (dock === 'right') {
    return {
      x: toolbar.x + toolbar.width - RESOURCE_WIDGET_WIDTH - spreadStep(index),
      y
    }
  }
  return { x: toolbar.x + spreadStep(index), y }
}

/** Fallback when no toolbar layout is available — horizontal row at bottom-left. */
function bottomFallbackRow(workArea: Rect, index: number): { x: number; y: number } {
  return {
    x: workArea.x + RESOURCE_WIDGET_MARGIN + spreadStep(index),
    y: workArea.y + workArea.height - RESOURCE_WIDGET_MARGIN - RESOURCE_WIDGET_HEIGHT
  }
}

/**
 * Computes screen bounds for one synced resource widget.
 * Widgets form a horizontal line directly under (or above) the toolbar edge.
 * `syncedIndex` is the widget's position among non-detached widgets on the same display (0 = first).
 */
export function computeResourceWidgetBounds(
  placement: ResourceWidgetPlacement,
  layout: ToolbarLayoutSnapshot | null,
  workArea: Rect,
  syncedIndex: number
): Rect {
  const index = Math.max(0, syncedIndex)

  if (!layout) {
    const { x, y } = bottomFallbackRow(workArea, index)
    return { x, y, width: RESOURCE_WIDGET_WIDTH, height: RESOURCE_WIDGET_HEIGHT }
  }

  const { dock, toolbarBounds: toolbar } = layout
  const pos =
    placement === 'below'
      ? dock === 'top'
        ? belowTopDock(toolbar, index)
        : belowSideDock(dock, toolbar, workArea, index)
      : aboveToolbar(toolbar, index, dock)

  return {
    x: pos.x,
    y: pos.y,
    width: RESOURCE_WIDGET_WIDTH,
    height: RESOURCE_WIDGET_HEIGHT
  }
}

/** True when the widget rect does not overlap the toolbar rect. */
export function resourceWidgetClearsToolbar(widget: Rect, toolbar: Rect): boolean {
  const overlapX = widget.x < toolbar.x + toolbar.width && widget.x + widget.width > toolbar.x
  const overlapY = widget.y < toolbar.y + toolbar.height && widget.y + widget.height > toolbar.y
  return !(overlapX && overlapY)
}
