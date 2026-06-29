import type { AgentCompanionToolActivity } from './agentCompanionApi.js'

/** How many tool rows the Agent Companion drawer shows before "+N more". */
export const AGENT_COMPANION_ACTIVITY_VISIBLE_LIMIT = 5

/** Delay before clearing the Activity list after a run finishes. */
export const AGENT_COMPANION_TOOLS_CLEAR_DELAY_MS = 5000

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

export function sliceVisibleToolActivity(
  tools: AgentCompanionToolActivity[],
  expanded: boolean,
  limit = AGENT_COMPANION_ACTIVITY_VISIBLE_LIMIT
): { visible: AgentCompanionToolActivity[]; hiddenCount: number } {
  if (expanded || tools.length <= limit) {
    return { visible: tools, hiddenCount: 0 }
  }
  return { visible: tools.slice(-limit), hiddenCount: tools.length - limit }
}
