import { describe, expect, it } from 'vitest'
import { clampResourceWidgetBounds } from './windowBounds.js'

describe('clampResourceWidgetBounds', () => {
  it('does not inflate small widget sizes when clamping y', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
    const widget = { x: 0, y: 1048, width: 150, height: 62 }
    const clamped = clampResourceWidgetBounds(widget, workArea)

    expect(clamped.width).toBe(150)
    expect(clamped.height).toBe(62)
    expect(clamped.y).toBe(978)
  })
})
