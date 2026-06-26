import { buildContext } from '@vibebar/prompt-engine'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { ReadyCheckResult, AgentMistake, ProjectMemoryDiff } from '@shared/types.js'
import { formatProjectMemoryOneLiner } from '../project/projectMemoryDiff.js'
import { formatIntentSection } from '../session/intentContract.js'
import { formatMistakeWarnings } from '../session/mistakeLedger.js'

export const PREPARE_CURSOR_CHAR_BUDGET = 8192

export interface PrepareCursorBootstrapInput {
  profile: ProjectProfile | null
  readyCheck: ReadyCheckResult
  intent: import('@shared/types.js').IntentContract | null
  memoryDiff?: ProjectMemoryDiff | null
  mistakes?: AgentMistake[]
}

/** Micro bootstrap for Cursor Agent — intent, verify recipe, Ready Check, MCP hint. */
export function buildPrepareCursorBootstrap(input: PrepareCursorBootstrapInput): string {
  const { profile, readyCheck, intent, memoryDiff, mistakes } = input
  if (!profile) return ''

  const ctx = buildContext(profile)
  const label = profile.folderName || `my ${String(ctx.framework)} project`
  const lines: string[] = [
    '# VibeBar — Prepare Cursor',
    '',
    `Project: **${label}** (${String(ctx.language)} · ${String(ctx.framework)})`,
    ''
  ]

  lines.push(...formatIntentSection(intent))

  const mistakeLines = formatMistakeWarnings(mistakes ?? [], 2)
  if (mistakeLines.length > 0) lines.push(...mistakeLines)

  const memoryLine = memoryDiff ? formatProjectMemoryOneLiner(memoryDiff) : null
  if (memoryLine) {
    lines.push('## Project context drift', '', memoryLine, '')
  }

  if (readyCheck.verifyRecipe) {
    lines.push('## Verify recipe', '', `\`${readyCheck.verifyRecipe.summary}\``, '')
  }

  const statusLabel =
    readyCheck.status === 'blocked'
      ? 'Blocked'
      : readyCheck.status === 'needs-review'
        ? 'Needs review'
        : 'Looks ready'
  lines.push(`## Ready Check: ${statusLabel}`, '')
  if (readyCheck.brief?.topItems.length) {
    readyCheck.brief.topItems.forEach((item, i) => {
      lines.push(`${i + 1}. **${item.label}** — ${item.nextAction}`)
    })
    lines.push('')
  } else {
    lines.push(readyCheck.brief?.summaryLine ?? 'No blockers detected.', '')
  }

  lines.push(
    '## Before editing',
    '',
    '- Read VibeBar MCP resources (`vibebar://session/intent`, `vibebar://ready-check/brief`, `vibebar://session/flight-log`).',
    '- Call `pack_changed` or `get_regression_context` for MVC context instead of guessing file scope.',
    '- Run the verify recipe when done; use `record_outcome` to update session verify pins.',
    ''
  )

  let text = lines.join('\n').trimEnd() + '\n'
  if (text.length > PREPARE_CURSOR_CHAR_BUDGET) {
    text = `${text.slice(0, PREPARE_CURSOR_CHAR_BUDGET)}\n…(truncated at ${PREPARE_CURSOR_CHAR_BUDGET} chars)\n`
  }
  return text
}
