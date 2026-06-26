import type { IntentContract } from '@shared/types.js'

/** True when the user has set a non-empty current task goal. */
export function isIntentActive(intent: IntentContract | null | undefined): boolean {
  return Boolean(intent?.goal?.trim())
}

/** Markdown lines for `## Current task` sections in handoffs and fix bundles. */
export function formatIntentSection(intent: IntentContract | null | undefined): string[] {
  if (!isIntentActive(intent) || !intent) return []

  const lines: string[] = ['## Current task', '', intent.goal.trim(), '']

  if (intent.constraints.length > 0) {
    lines.push('**Constraints:**')
    for (const c of intent.constraints) lines.push(`- ${c}`)
    lines.push('')
  }

  if (intent.filesInScope.length > 0) {
    lines.push('**Files in scope:**', intent.filesInScope.map((f) => `- \`${f}\``).join('\n'), '')
  }

  if (intent.acceptanceCriteria.length > 0) {
    lines.push('**Acceptance criteria:**')
    for (const a of intent.acceptanceCriteria) lines.push(`- ${a}`)
    lines.push('')
  }

  if (intent.verifyCommand) {
    lines.push(`**Verify command:** \`${intent.verifyCommand}\``, '')
  }

  return lines
}

/** Parses multiline text fields (one item per non-empty line). */
export function parseIntentListField(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}
