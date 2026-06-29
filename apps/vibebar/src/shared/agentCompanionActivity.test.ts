import { describe, expect, it } from 'vitest'
import {
  finalizeRunningToolActivity,
  sliceVisibleToolActivity
} from './agentCompanionActivity.js'

describe('finalizeRunningToolActivity', () => {
  it('marks running tools as done and leaves others unchanged', () => {
    const tools = [
      { id: '1', label: 'Read', status: 'running' as const },
      { id: '2', label: 'Grep', status: 'done' as const },
      { id: '3', label: 'Shell', status: 'failed' as const },
      { id: '4', label: 'Search', status: 'running' as const }
    ]
    expect(finalizeRunningToolActivity(tools)).toBe(true)
    expect(tools.map((t) => t.status)).toEqual(['done', 'done', 'failed', 'done'])
  })

  it('returns false when nothing was running', () => {
    const tools = [{ id: '1', label: 'Read', status: 'done' as const }]
    expect(finalizeRunningToolActivity(tools)).toBe(false)
  })
})

describe('sliceVisibleToolActivity', () => {
  const tools = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    label: `Tool ${i}`,
    status: 'done' as const
  }))

  it('shows all tools when expanded', () => {
    expect(sliceVisibleToolActivity(tools, true)).toEqual({
      visible: tools,
      hiddenCount: 0
    })
  })

  it('shows the latest five tools when collapsed', () => {
    const { visible, hiddenCount } = sliceVisibleToolActivity(tools, false, 5)
    expect(hiddenCount).toBe(3)
    expect(visible.map((t) => t.id)).toEqual(['3', '4', '5', '6', '7'])
  })
})
