import { spawnSync } from 'node:child_process'
import type { AgentCompanionModelOption } from '@shared/agentCompanionModels.js'
import {
  AGENT_COMPANION_FALLBACK_MODELS,
  mergeAgentModelLists
} from '@shared/agentCompanionModels.js'
import { envWithAgentPath } from './findAgentCli.js'

/** Parse `agent --list-models` / `agent models` stdout (text or JSON). */
export function parseAgentModelsOutput(raw: string): AgentCompanionModelOption[] {
  const text = raw.trim()
  if (!text) return []

  try {
    const json = JSON.parse(text) as unknown
    const fromJson = parseModelsJson(json)
    if (fromJson.length > 0) return fromJson
  } catch {
    /* fall through to line parsing */
  }

  const models: AgentCompanionModelOption[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || /^available models/i.test(trimmed) || /^models:?$/i.test(trimmed)) continue
    if (/^[-─=]{3,}/.test(trimmed)) continue

    const tabParts = trimmed.split('\t').map((p) => p.trim()).filter(Boolean)
    if (tabParts.length >= 2) {
      models.push({ id: tabParts[0], label: tabParts.slice(1).join(' ') })
      continue
    }

    const idMatch = trimmed.match(/^([^\s]+)(?:\s{2,}|\s-\s|\s:\s|\s)\s*(.+)$/)
    if (idMatch) {
      models.push({ id: idMatch[1], label: idMatch[2].trim() })
      continue
    }

    const single = trimmed.match(/^([a-z0-9][a-z0-9._[\]=,-]*)\s*$/i)
    if (single) {
      models.push({ id: single[1], label: single[1] })
    }
  }
  return models
}

function parseModelsJson(json: unknown): AgentCompanionModelOption[] {
  if (!json || typeof json !== 'object') return []
  const root = json as Record<string, unknown>
  const candidates = [
    root.models,
    root.availableModels,
    root.data,
    Array.isArray(json) ? json : null
  ].filter(Array.isArray)

  for (const arr of candidates) {
    const parsed = (arr as unknown[])
      .map((entry) => {
        if (typeof entry === 'string') return { id: entry, label: entry }
        if (!entry || typeof entry !== 'object') return null
        const o = entry as Record<string, unknown>
        const id =
          (typeof o.id === 'string' && o.id) ||
          (typeof o.modelId === 'string' && o.modelId) ||
          (typeof o.value === 'string' && o.value) ||
          ''
        const label =
          (typeof o.label === 'string' && o.label) ||
          (typeof o.name === 'string' && o.name) ||
          id
        return id ? { id, label } : null
      })
      .filter((x): x is AgentCompanionModelOption => x != null)
    if (parsed.length > 0) return parsed
  }
  return []
}

/** Query the Cursor CLI for account models; falls back to a curated list. */
export function listAgentModels(agentPath: string): AgentCompanionModelOption[] {
  const attempts: string[][] = [['--list-models'], ['models']]
  for (const args of attempts) {
    try {
      const result = spawnSync(agentPath, args, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15_000,
        env: envWithAgentPath(),
        shell:
          process.platform === 'win32' &&
          (agentPath.endsWith('.cmd') || agentPath.endsWith('.bat'))
      })
      const out = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const parsed = parseAgentModelsOutput(out)
      if (parsed.length > 0) return mergeAgentModelLists(parsed)
    } catch {
      /* try next invocation style */
    }
  }
  return [...AGENT_COMPANION_FALLBACK_MODELS]
}
