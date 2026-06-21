import { describe, expect, it } from 'vitest'
import { mapDisplays, resolveEnabledDisplays, toDisplayInfo, type DisplayLike } from './displayUtils.js'

const primary: DisplayLike = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
}
const second: DisplayLike = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1400 }
}

describe('toDisplayInfo', () => {
  it('labels the primary display and includes resolution', () => {
    const info = toDisplayInfo(primary, 1, 0)
    expect(info.id).toBe('1')
    expect(info.isPrimary).toBe(true)
    expect(info.label).toContain('1920\u00d71080')
    expect(info.label).toContain('Primary')
  })

  it('does not mark non-primary displays as primary', () => {
    expect(toDisplayInfo(second, 1, 1).isPrimary).toBe(false)
  })
})

describe('resolveEnabledDisplays', () => {
  const all = [primary, second]

  it('falls back to primary when nothing is enabled', () => {
    expect(resolveEnabledDisplays(all, [], 1)).toEqual([primary])
  })

  it('returns the selected displays by id', () => {
    expect(resolveEnabledDisplays(all, ['2'], 1)).toEqual([second])
    expect(resolveEnabledDisplays(all, ['1', '2'], 1)).toHaveLength(2)
  })

  it('falls back to primary when the selection no longer matches any display', () => {
    expect(resolveEnabledDisplays(all, ['99'], 1)).toEqual([primary])
  })
})

describe('mapDisplays', () => {
  it('maps every display to DisplayInfo', () => {
    expect(mapDisplays([primary, second], 1)).toHaveLength(2)
  })
})
