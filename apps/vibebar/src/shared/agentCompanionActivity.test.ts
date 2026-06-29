import { describe, expect, it } from 'vitest'
import {
  classifyAgentToolKind,
  finalizeRunningToolActivity,
  formatToolDetailPath,
  recentToolActivityForExpand,
  summarizeAgentToolActivity,
  summarizeStepKinds
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

describe('classifyAgentToolKind', () => {
  it('classifies common agent tools', () => {
    expect(classifyAgentToolKind('Read file', 'read', 'src/app.ts')).toBe('read')
    expect(classifyAgentToolKind('Apply patch', 'StrReplace', 'foo.ts')).toBe('edit')
    expect(classifyAgentToolKind('Grep pattern', 'grep')).toBe('search')
    expect(classifyAgentToolKind('Run command', 'shell', 'npm test')).toBe('shell')
  })
})

describe('summarizeAgentToolActivity', () => {
  it('returns the last running tool and counts for completed/failed', () => {
    const tools = [
      { id: '1', label: 'Read', status: 'done' as const },
      { id: '2', label: 'Grep', status: 'done' as const },
      { id: '3', label: 'Shell', status: 'running' as const },
      { id: '4', label: 'Search', status: 'failed' as const }
    ]
    expect(summarizeAgentToolActivity(tools)).toEqual({
      active: tools[2],
      completedCount: 2,
      failedCount: 1,
      totalCount: 4
    })
  })
})

describe('summarizeStepKinds', () => {
  it('builds readable chips for the work trace header', () => {
    const steps = [
      { id: '1', label: 'Edit', kind: 'edit' as const, status: 'done' as const },
      { id: '2', label: 'Edit', kind: 'edit' as const, status: 'done' as const },
      { id: '3', label: 'Read', kind: 'read' as const, status: 'done' as const }
    ]
    expect(summarizeStepKinds(steps)).toEqual(['2 edits', '1 read'])
  })
})

describe('formatToolDetailPath', () => {
  it('shortens long paths while keeping the tail', () => {
    const long = 'P:/very/long/project/path/apps/vibebar/src/main/agent/AcpClient.ts'
    const formatted = formatToolDetailPath(long, 40)
    expect(formatted).toContain('agent/AcpClient.ts')
    expect(formatted!.length).toBeLessThanOrEqual(40)
  })
})

describe('recentToolActivityForExpand', () => {
  const tools = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    label: `Tool ${i}`,
    status: 'done' as const
  }))

  it('shows the latest tools up to the limit', () => {
    const { visible, hiddenCount } = recentToolActivityForExpand(tools, 8)
    expect(hiddenCount).toBe(2)
    expect(visible.map((t) => t.id)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9'])
  })
})
