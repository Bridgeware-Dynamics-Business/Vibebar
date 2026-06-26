import { describe, expect, it } from 'vitest'
import {
  anchorFromDrop,
  barSpan,
  centerAnchor,
  dockedRect,
  nearestDock,
  nearestDockFromCenter,
  orientationChanges,
  probeAtCursor,
  resolveDockOnDrop,
  resolvePlacement,
  snapTarget,
  type Rect
} from './snapLogic.js'

const primaryWork: Rect = { x: 0, y: 0, width: 1920, height: 1040 }
const secondaryWork: Rect = { x: 1920, y: 0, width: 1920, height: 1040 }
const BAR_LENGTH = 1000

describe('snapTarget', () => {
  it('returns null when the window is in the free middle zone', () => {
    const win: Rect = { x: 900, y: 400, width: 64, height: 700 }
    expect(snapTarget(win, primaryWork)).toBeNull()
  })

  it('locks to top when near the top edge', () => {
    const win: Rect = { x: 400, y: 40, width: 64, height: 700 }
    expect(snapTarget(win, primaryWork)).toBe('top')
  })
})

describe('nearestDockFromCenter', () => {
  it('picks top when the window center is closest to the top edge', () => {
    const win: Rect = { x: 900, y: 80, width: 64, height: 900 }
    expect(nearestDockFromCenter(win, primaryWork)).toBe('top')
  })
})

describe('nearestDock', () => {
  it('recovers to left when dragged far off the left of a secondary monitor', () => {
    const win: Rect = { x: 100, y: 200, width: 64, height: 700 }
    expect(nearestDock(win, secondaryWork)).toBe('left')
  })
})

describe('anchorFromDrop', () => {
  it('centers the bar horizontally on the drop point for top dock', () => {
    const probe: Rect = { x: 460, y: 0, width: 1000, height: 64 }
    const anchor = anchorFromDrop('top', probe, primaryWork, BAR_LENGTH)
    const rect = dockedRect('top', primaryWork, 64, BAR_LENGTH, 0, anchor)
    expect(anchor).toBe(460)
    expect(rect.x).toBe(460)
    expect(rect.width).toBe(BAR_LENGTH)
  })

  it('centers the bar vertically on the drop point for left dock', () => {
    const probe: Rect = { x: 0, y: 20, width: 64, height: 1000 }
    const anchor = anchorFromDrop('left', probe, primaryWork, BAR_LENGTH)
    expect(anchor).toBe(20)
    const rect = dockedRect('left', primaryWork, 64, BAR_LENGTH, 0, anchor)
    expect(rect.y).toBe(20)
    expect(rect.height).toBe(BAR_LENGTH)
  })

  it('keeps the full bar on-screen when dropped near the bottom', () => {
    const probe: Rect = { x: 0, y: 980, width: 64, height: 1000 }
    const anchor = anchorFromDrop('left', probe, primaryWork, BAR_LENGTH)
    expect(anchor).toBe(40)
    expect(anchor + barSpan('left', primaryWork, BAR_LENGTH)).toBeLessThanOrEqual(1040)
  })
})

describe('probeAtCursor', () => {
  it('centers the probe on the release point', () => {
    const probe = probeAtCursor({ x: 500, y: 400 }, { width: 64, height: 700 })
    expect(probe.x).toBe(468)
    expect(probe.y).toBe(50)
  })
})

describe('resolveDockOnDrop', () => {
  it('snaps to right when released near the right edge', () => {
    const win: Rect = { x: 3700, y: 400, width: 64, height: 700 }
    expect(resolveDockOnDrop(win, secondaryWork)).toBe('right')
  })

  it('snaps to left when released near the left edge', () => {
    const win: Rect = { x: 2100, y: 400, width: 64, height: 700 }
    expect(resolveDockOnDrop(win, secondaryWork)).toBe('left')
  })

  it('prefers top when released at the top-left corner', () => {
    const win: Rect = { x: 1920, y: 0, width: 64, height: 700 }
    expect(resolveDockOnDrop(win, secondaryWork)).toBe('top')
  })
})

describe('resolvePlacement', () => {
  it('centers horizontally on top dock so the full bar is visible', () => {
    const probe = probeAtCursor({ x: 2500, y: 40 }, { width: 64, height: 700 })
    const { dock, anchor } = resolvePlacement(probe, secondaryWork, BAR_LENGTH)
    expect(dock).toBe('top')
    expect(anchor).toBe(centerAnchor('top', secondaryWork, BAR_LENGTH))
    const rect = dockedRect('top', secondaryWork, 64, BAR_LENGTH, 0, anchor)
    expect(rect.x + rect.width).toBeLessThanOrEqual(3840)
    expect(rect.x).toBeGreaterThanOrEqual(1920)
  })
})

describe('centerAnchor', () => {
  it('returns the leading edge for a centered toolbar', () => {
    expect(centerAnchor('top', primaryWork, BAR_LENGTH)).toBe(460)
    expect(centerAnchor('left', primaryWork, BAR_LENGTH)).toBe(20)
  })
})

describe('dockedRect top', () => {
  it('places the toolbar flush with the top of the work area', () => {
    const rect = dockedRect('top', secondaryWork, 64, 500, 0, 2000)
    expect(rect.y).toBe(0)
    expect(rect.height).toBe(64)
  })

  it('keeps a centered top bar fully inside the work area', () => {
    const anchor = centerAnchor('top', primaryWork, BAR_LENGTH)
    const rect = dockedRect('top', primaryWork, 64, BAR_LENGTH, 0, anchor)
    expect(rect.x).toBe(anchor)
    expect(rect.x).toBeGreaterThanOrEqual(primaryWork.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(primaryWork.x + primaryWork.width)
    expect(rect.y).toBe(primaryWork.y)
  })

  it('clamps anchor when the bar is wider than the work area', () => {
    const rect = dockedRect('top', { x: 0, y: 0, width: 800, height: 600 }, 64, BAR_LENGTH, 0, 9999)
    expect(rect.x).toBe(0)
    expect(rect.width).toBe(800)
  })
})

describe('orientationChanges', () => {
  it('detects vertical to horizontal flips', () => {
    expect(orientationChanges('left', 'top')).toBe(true)
    expect(orientationChanges('left', 'right')).toBe(false)
  })
})
