import type { GuardrailId } from './types.js'

interface Guardrail {
  id: GuardrailId
  line: string
}

const GUARDRAILS: Record<GuardrailId, Guardrail> = {
  'no-secrets': {
    id: 'no-secrets',
    line: 'Never print, log, or hard-code secrets, API keys, tokens, or connection strings. Read them from environment variables and keep them out of any output you produce.'
  },
  'no-innerHTML': {
    id: 'no-innerHTML',
    line: 'Do not use innerHTML, outerHTML, document.write, or dangerouslySetInnerHTML with untrusted data. Build DOM nodes or use safe templating to prevent XSS.'
  },
  'keep-context-isolation': {
    id: 'keep-context-isolation',
    line: 'Keep Electron security intact: contextIsolation must stay true, sandbox stays true, nodeIntegration stays false, and the renderer must only reach the main process through the existing typed preload bridge.'
  },
  'parameterized-queries': {
    id: 'parameterized-queries',
    line: 'Use parameterized queries or an ORM for all database access. Never build SQL by string concatenation with user input.'
  },
  'validate-input': {
    id: 'validate-input',
    line: 'Validate and narrow all external input (request bodies, query params, IPC payloads) before use, and return clear errors on invalid input.'
  },
  'no-eval': {
    id: 'no-eval',
    line: 'Do not use eval, new Function, or run dynamically constructed code. Prefer explicit, statically analyzable logic.'
  }
}

/**
 * Builds the hardened safety block appended when the guardrail toggle is on. Only the
 * guardrails a template declares are included, so the block stays relevant to the task.
 */
export function buildGuardrailBlock(ids: GuardrailId[]): string {
  const unique = [...new Set(ids)].filter((id): id is GuardrailId => id in GUARDRAILS)
  if (unique.length === 0) return ''
  const lines = unique.map((id) => `- ${GUARDRAILS[id].line}`)
  return ['Safety constraints (do not violate):', ...lines].join('\n')
}

export function guardrailLine(id: GuardrailId): string | null {
  return GUARDRAILS[id]?.line ?? null
}
