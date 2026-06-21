import { describe, expect, it } from 'vitest'
import {
  SNAP_THRESHOLD,
  clamp,
  dockDistance,
  dockedRect,
  nearestDock,
  orientationFor,
  snapTarget,
  type Rect
} from './snapLogic.js'

const workArea: Rect = { x: 0, y: 0, width: 1920, height: 1040 }

describe('clamp', () => {
  it('bounds a value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })
})

describe('nearestDock', () => {
  it('snaps to the left edge when closest', () => {
    expect(nearestDock({ x: 10, y: 400, width: 64, height: 300 }, workArea)).toBe('left')
  })

  it('snaps to the right edge when closest', () => {
    expect(nearestDock({ x: 1850, y: 400, width: 64, height: 300 }, workArea)).toBe('right')
  })

  it('snaps to the top edge when closest', () => {
    expect(nearestDock({ x: 900, y: 6, width: 64, height: 300 }, workArea)).toBe('top')
  })

  it('handles a non-zero work area origin (second monitor)', () => {
    const wa: Rect = { x: 1920, y: 0, width: 1920, height: 1040 }
    expect(nearestDock({ x: 1930, y: 400, width: 64, height: 300 }, wa)).toBe('left')
    expect(nearestDock({ x: 3790, y: 400, width: 64, height: 300 }, wa)).toBe('right')
  })
})

describe('dockDistance', () => {
  it('measures the gap to each edge', () => {
    expect(dockDistance('left', { x: 30, y: 400, width: 64, height: 300 }, workArea)).toBe(30)
    expect(dockDistance('right', { x: 1800, y: 400, width: 64, height: 300 }, workArea)).toBe(56)
    expect(dockDistance('top', { x: 900, y: 12, width: 64, height: 300 }, workArea)).toBe(12)
  })
})

describe('snapTarget', () => {
  it('locks onto an edge within the catch distance', () => {
    expect(snapTarget({ x: 40, y: 400, width: 64, height: 300 }, workArea)).toBe('left')
    expect(snapTarget({ x: 1820, y: 400, width: 64, height: 300 }, workArea)).toBe('right')
    expect(snapTarget({ x: 900, y: 20, width: 64, height: 300 }, workArea)).toBe('top')
  })

  it('returns null in the free middle zone', () => {
    const middle = { x: 900, y: 500, width: 64, height: 300 }
    expect(dockDistance(nearestDock(middle, workArea), middle, workArea)).toBeGreaterThan(
      SNAP_THRESHOLD
    )
    expect(snapTarget(middle, workArea)).toBeNull()
  })

  it('respects a custom threshold', () => {
    const near = { x: 120, y: 400, width: 64, height: 300 }
    expect(snapTarget(near, workArea, 100)).toBeNull()
    expect(snapTarget(near, workArea, 200)).toBe('left')
  })
})

describe('orientationFor', () => {
  it('maps top to horizontal and sides to vertical', () => {
    expect(orientationFor('top')).toBe('horizontal')
    expect(orientationFor('left')).toBe('vertical')
    expect(orientationFor('right')).toBe('vertical')
  })
})

describe('dockedRect', () => {
  it('docks flush to the left edge with vertical sizing', () => {
    const r = dockedRect('left', workArea, 64, 600, 0, 200)
    expect(r).toEqual({ x: 0, y: 200, width: 64, height: 600 })
  })

  it('keeps the toolbar flush right when a panel expands inward', () => {
    const r = dockedRect('right', workArea, 64, 600, 400, 200)
    expect(r.width).toBe(464)
    expect(r.x).toBe(1920 - 464)
  })

  it('docks across the top with horizontal sizing', () => {
    const r = dockedRect('top', workArea, 64, 700, 0, 100)
    expect(r.y).toBe(0)
    expect(r.height).toBe(64)
    expect(r.width).toBe(700)
  })

  it('clamps the anchor so the window stays within the work area', () => {
    const r = dockedRect('left', workArea, 64, 600, 0, 5000)
    expect(r.y).toBe(workArea.height - 600)
  })
})
