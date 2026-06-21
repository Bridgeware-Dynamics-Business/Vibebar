import { describe, expect, it } from 'vitest'
import { ToolRegistry } from './ToolRegistry.js'

describe('ToolRegistry', () => {
  const registry = new ToolRegistry()

  it('exposes a unique set of tools', () => {
    const ids = registry.list().map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('prompt-library')
    expect(ids).toContain('code-sync')
    expect(ids).toContain('settings')
  })

  it('classifies Code Sync as a window tool and Prompt Library as a panel', () => {
    expect(registry.isWindowTool('code-sync')).toBe(true)
    expect(registry.isPanelTool('prompt-library')).toBe(true)
    expect(registry.isPanelTool('code-sync')).toBe(false)
  })

  it('pins settings to the end of the toolbar', () => {
    expect(registry.get('settings')?.pinnedEnd).toBe(true)
  })

  it('returns undefined for unknown tools', () => {
    expect(registry.get('nope' as never)).toBeUndefined()
  })
})
