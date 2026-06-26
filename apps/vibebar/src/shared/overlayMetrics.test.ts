import { describe, expect, it } from 'vitest'
import {
  collapsedToolbarLength,
  drawerInwardExtent,
  AGENT_DRAWER_SIZE
} from './overlayMetrics.js'

describe('collapsedToolbarLength', () => {
  it('matches the full horizontal strip with project and two quick-launch apps', () => {
    expect(collapsedToolbarLength({ quickLaunchCount: 2, hasProject: true })).toBe(1010)
  })

  it('omits the context-folder slot without a project', () => {
    expect(collapsedToolbarLength({ quickLaunchCount: 2, hasProject: false })).toBe(958)
  })
})

describe('drawerInwardExtent', () => {
  it('returns width for side docks and height for top', () => {
    expect(drawerInwardExtent('left')).toBe(AGENT_DRAWER_SIZE.width)
    expect(drawerInwardExtent('top')).toBe(AGENT_DRAWER_SIZE.height)
  })
})
