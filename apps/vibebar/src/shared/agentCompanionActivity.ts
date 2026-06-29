import type {
  AgentCompanionToolActivity,
  AgentCompanionToolKind
} from './agentCompanionApi.js'

/** Max tool rows shown when the user expands the activity summary. */
export const AGENT_COMPANION_ACTIVITY_EXPAND_LIMIT = 8

export interface AgentToolKindMeta {
  icon: string
  tone: string
  verb: string
}

const KIND_META: Record<AgentCompanionToolKind, AgentToolKindMeta> = {
  read: { icon: 'FileText', tone: 'text-sky-300/90', verb: 'read' },
  edit: { icon: 'Pencil', tone: 'text-vibe-accent-2/90', verb: 'edit' },
  search: { icon: 'ScanSearch', tone: 'text-indigo-300/90', verb: 'search' },
  shell: { icon: 'Terminal', tone: 'text-amber-200/90', verb: 'command' },
  think: { icon: 'Sparkles', tone: 'text-vibe-muted', verb: 'think' },
  other: { icon: 'Wrench', tone: 'text-vibe-muted', verb: 'action' }
}

const READ_HINTS = /\b(read|view|fetch|open)\b/i
const EDIT_HINTS = /\b(edit|write|patch|replace|apply|create|delete|strreplace|write)\b/i
const SEARCH_HINTS = /\b(grep|search|find|glob|semantic|list_dir|list dir)\b/i
const SHELL_HINTS = /\b(shell|terminal|run|exec|command|npm|git)\b/i
const THINK_HINTS = /\b(think|plan|reason)\b/i

/** Infer tool kind from ACP title/name/detail for timeline styling. */
export function classifyAgentToolKind(
  label: string,
  name?: string,
  detail?: string
): AgentCompanionToolKind {
  const haystack = `${label} ${name ?? ''} ${detail ?? ''}`.toLowerCase()
  if (EDIT_HINTS.test(haystack)) return 'edit'
  if (READ_HINTS.test(haystack)) return 'read'
  if (SEARCH_HINTS.test(haystack)) return 'search'
  if (SHELL_HINTS.test(haystack)) return 'shell'
  if (THINK_HINTS.test(haystack)) return 'think'
  return 'other'
}

export function toolKindMeta(kind: AgentCompanionToolKind | undefined): AgentToolKindMeta {
  return KIND_META[kind ?? 'other']
}

/** Mark any in-flight tools as done when the agent run ends without per-tool completion events. */
export function finalizeRunningToolActivity(tools: AgentCompanionToolActivity[]): boolean {
  let changed = false
  for (const tool of tools) {
    if (tool.status === 'running') {
      tool.status = 'done'
      changed = true
    }
  }
  return changed
}

export interface AgentToolActivitySummary {
  active: AgentCompanionToolActivity | null
  completedCount: number
  failedCount: number
  totalCount: number
}

/** Derive a compact view: one active tool plus counts for completed/failed steps. */
export function summarizeAgentToolActivity(
  tools: AgentCompanionToolActivity[]
): AgentToolActivitySummary {
  let active: AgentCompanionToolActivity | null = null
  let completedCount = 0
  let failedCount = 0
  for (const tool of tools) {
    if (tool.status === 'running') active = tool
    else if (tool.status === 'failed') failedCount++
    else completedCount++
  }
  return { active, completedCount, failedCount, totalCount: tools.length }
}

/** Human-readable summary chips for a collapsed work trace header. */
export function summarizeStepKinds(steps: AgentCompanionToolActivity[]): string[] {
  const counts = new Map<AgentCompanionToolKind, number>()
  for (const step of steps) {
    const kind = step.kind ?? 'other'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  const parts: string[] = []
  const push = (kind: AgentCompanionToolKind, singular: string, plural: string): void => {
    const n = counts.get(kind)
    if (!n) return
    parts.push(n === 1 ? `1 ${singular}` : `${n} ${plural}`)
    counts.delete(kind)
  }

  push('edit', 'edit', 'edits')
  push('read', 'read', 'reads')
  push('search', 'search', 'searches')
  push('shell', 'command', 'commands')
  push('think', 'step', 'steps')
  const other = counts.get('other')
  if (other) parts.push(other === 1 ? '1 action' : `${other} actions`)

  return parts
}

/** Recent tool steps for an optional expanded list (newest last). */
export function recentToolActivityForExpand(
  tools: AgentCompanionToolActivity[],
  limit = AGENT_COMPANION_ACTIVITY_EXPAND_LIMIT
): { visible: AgentCompanionToolActivity[]; hiddenCount: number } {
  if (tools.length <= limit) {
    return { visible: tools, hiddenCount: 0 }
  }
  return { visible: tools.slice(-limit), hiddenCount: tools.length - limit }
}

/** Shorten file paths for inline display in the echo timeline. */
export function formatToolDetailPath(detail: string | undefined, maxLen = 56): string | null {
  if (!detail?.trim()) return null
  const trimmed = detail.trim().replace(/\\/g, '/')
  if (trimmed.length <= maxLen) return trimmed
  const segments = trimmed.split('/')
  if (segments.length <= 2) return `…${trimmed.slice(-maxLen + 1)}`
  return `…/${segments.slice(-2).join('/')}`
}
