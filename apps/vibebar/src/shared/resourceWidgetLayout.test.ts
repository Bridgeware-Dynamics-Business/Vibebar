import { describe, expect, it } from 'vitest'
import {
  computeResourceWidgetBounds,
  RESOURCE_WIDGET_BELOW_CLEARANCE,
  RESOURCE_WIDGET_GAP,
  RESOURCE_WIDGET_HEIGHT,
  RESOURCE_WIDGET_MARGIN,
  RESOURCE_WIDGET_WIDTH,
  resourceWidgetClearsToolbar,
  type ToolbarLayoutSnapshot
} from './resourceWidgetLayout.js'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const leftToolbar = { x: 0, y: 120, width: 64, height: 900 }

describe('computeResourceWidgetBounds', () => {
  it('keeps the row aligned under a tall left toolbar when the screen bottom is tight', () => {
    const layout: ToolbarLayoutSnapshot = {
      displayId: '1',
      dock: 'left',
      workArea,
      toolbarBounds: leftToolbar
    }
    const first = computeResourceWidgetBounds('below', layout, workArea, 0)
    const second = computeResourceWidgetBounds('below', layout, workArea, 1)

    expect(first.x).toBe(leftToolbar.x)
    expect(first.y).toBe(leftToolbar.y + leftToolbar.height - RESOURCE_WIDGET_HEIGHT)
    expect(second.y).toBe(first.y)
    expect(second.x).toBe(first.x + RESOURCE_WIDGET_WIDTH + RESOURCE_WIDGET_GAP)
  })

  it('places a horizontal row under a short left toolbar when there is room below', () => {
    const shortToolbar = { x: 0, y: 120, width: 64, height: 400 }
    const layout: ToolbarLayoutSnapshot = {
      displayId: '1',
      dock: 'left',
      workArea,
      toolbarBounds: shortToolbar
    }
    const first = computeResourceWidgetBounds('below', layout, workArea, 0)
    const rowY = shortToolbar.y + shortToolbar.height + RESOURCE_WIDGET_BELOW_CLEARANCE

    expect(first.y).toBe(rowY)
    expect(first.x).toBe(shortToolbar.x)
    expect(resourceWidgetClearsToolbar(first, shortToolbar)).toBe(true)
  })

  it('places a horizontal row directly under a right-docked toolbar when there is room', () => {
    const toolbar = { x: 1856, y: 120, width: 64, height: 400 }
    const layout: ToolbarLayoutSnapshot = {
      displayId: '1',
      dock: 'right',
      workArea,
      toolbarBounds: toolbar
    }
    const first = computeResourceWidgetBounds('below', layout, workArea, 0)
    const second = computeResourceWidgetBounds('below', layout, workArea, 1)
    const rowY = toolbar.y + toolbar.height + RESOURCE_WIDGET_BELOW_CLEARANCE

    expect(first.y).toBe(rowY)
    expect(second.y).toBe(rowY)
    expect(first.x + RESOURCE_WIDGET_WIDTH).toBe(toolbar.x + toolbar.width)
    expect(second.x).toBeLessThan(first.x)
  })

  it('places a horizontal row directly above a left-docked toolbar', () => {
    const layout: ToolbarLayoutSnapshot = {
      displayId: '1',
      dock: 'left',
      workArea,
      toolbarBounds: leftToolbar
    }
    const first = computeResourceWidgetBounds('above', layout, workArea, 0)
    const second = computeResourceWidgetBounds('above', layout, workArea, 1)
    const rowY = leftToolbar.y - RESOURCE_WIDGET_GAP - RESOURCE_WIDGET_HEIGHT

    expect(first.x).toBe(leftToolbar.x)
    expect(first.y).toBe(rowY)
    expect(second.y).toBe(rowY)
    expect(second.x).toBe(first.x + RESOURCE_WIDGET_WIDTH + RESOURCE_WIDGET_GAP)
    expect(first.y + first.height).toBeLessThanOrEqual(leftToolbar.y - RESOURCE_WIDGET_GAP)
  })

  it('places a horizontal row directly under a top-docked toolbar', () => {
    const toolbar = { x: 460, y: 0, width: 1000, height: 64 }
    const layout: ToolbarLayoutSnapshot = {
      displayId: '1',
      dock: 'top',
      workArea,
      toolbarBounds: toolbar
    }
    const first = computeResourceWidgetBounds('below', layout, workArea, 0)
    const third = computeResourceWidgetBounds('below', layout, workArea, 2)
    const rowY = toolbar.y + toolbar.height + RESOURCE_WIDGET_BELOW_CLEARANCE

    expect(first.x).toBe(toolbar.x)
    expect(first.y).toBe(rowY)
    expect(third.y).toBe(rowY)
    expect(third.x).toBeGreaterThan(first.x)
    expect(resourceWidgetClearsToolbar(first, toolbar)).toBe(true)
  })

  it('falls back to a bottom-left horizontal row when no toolbar layout is available', () => {
    const bounds = computeResourceWidgetBounds('below', null, workArea, 0)
    expect(bounds.x).toBe(workArea.x + RESOURCE_WIDGET_MARGIN)
    expect(bounds.y).toBe(
      workArea.y + workArea.height - RESOURCE_WIDGET_MARGIN - RESOURCE_WIDGET_HEIGHT
    )
  })
})
