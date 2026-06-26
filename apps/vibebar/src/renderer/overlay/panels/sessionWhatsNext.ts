import type { GitStatus, SessionEntry, SessionState } from '@shared/types.js'

export interface WhatsNextSuggestion {
  id: string
  label: string
  icon: string
}

const DISPLAY_CAP = 100

export { DISPLAY_CAP as SESSION_DISPLAY_CAP }

/** Default pins when copying handoff with none pinned. */
export const SESSION_PIN_RECENT_DEFAULT = 3

/** Pure heuristics for Session Hub "what's next" footer (no LLM). */
export function buildWhatsNextSuggestions(input: {
  state: SessionState | null
  gitStatus: GitStatus | null
  terminalIssueCount: number
}): WhatsNextSuggestion[] {
  const entries = input.state?.entries ?? []
  const suggestions: WhatsNextSuggestion[] = []

  const unpinnedAudit = entries.some((e) => e.type === 'audit-finding' && !e.pinned)
  if (unpinnedAudit) {
    suggestions.push({
      id: 'pin-handoff',
      label: 'Pin audit findings and copy handoff',
      icon: 'Pin'
    })
  }

  if (input.terminalIssueCount > 0) {
    suggestions.push({
      id: 'open-terminal',
      label: 'Open terminal to verify fixes',
      icon: 'SquareTerminal'
    })
  }

  const hasGitChanges = (input.gitStatus?.changeCount ?? 0) > 0
  const hasDiffCopied = entries.some((e) => e.type === 'git-diff')
  if (hasGitChanges && !hasDiffCopied) {
    suggestions.push({
      id: 'copy-diff',
      label: 'Copy git diff prompt for AI',
      icon: 'GitBranch'
    })
  }

  if (entries.length === 0) {
    suggestions.push({
      id: 'copy-prompt',
      label: 'Copy a prompt from the library',
      icon: 'Library'
    })
  }

  return suggestions.slice(0, 2)
}

/** Returns visible entries (newest first) capped unless showAll is true. */
export function capSessionEntries(entries: SessionEntry[], showAll: boolean): SessionEntry[] {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp)
  if (showAll || sorted.length <= DISPLAY_CAP) return sorted
  return sorted.slice(0, DISPLAY_CAP)
}
