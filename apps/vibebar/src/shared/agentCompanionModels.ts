/** Cursor agent model id + display label for Agent Companion. */
export interface AgentCompanionModelOption {
  id: string
  label: string
}

/** Default — fast Composer model for everyday agent work. */
export const DEFAULT_AGENT_COMPANION_MODEL_ID = 'composer-2.5-fast'

/** Shown when `agent --list-models` is unavailable (offline / CLI missing). */
export const AGENT_COMPANION_FALLBACK_MODELS: AgentCompanionModelOption[] = [
  { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' },
  { id: 'composer-2.5', label: 'Composer 2.5' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'gpt-5.5-medium', label: 'GPT-5.5 Medium' },
  { id: 'claude-4.6-sonnet-medium-thinking', label: 'Claude 4.6 Sonnet (Thinking)' },
  { id: 'claude-opus-4-8-thinking-high', label: 'Claude Opus 4.8 (Thinking High)' }
]

export function labelForAgentModel(
  modelId: string,
  options: AgentCompanionModelOption[] = AGENT_COMPANION_FALLBACK_MODELS
): string {
  const match = options.find((m) => m.id === modelId)
  if (match) return match.label
  return modelId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Merge CLI-reported models with fallbacks; CLI order wins, then unknown fallbacks. */
export function mergeAgentModelLists(
  fromCli: AgentCompanionModelOption[]
): AgentCompanionModelOption[] {
  const seen = new Set<string>()
  const merged: AgentCompanionModelOption[] = []
  for (const model of [...fromCli, ...AGENT_COMPANION_FALLBACK_MODELS]) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    merged.push(model)
  }
  return merged
}
