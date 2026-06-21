export const PROMPT_CATEGORIES = [
  'Security',
  'Debugging',
  'Context',
  'Code Review',
  'Refactor',
  'Performance',
  'Testing',
  'Deploy',
  'UI/UX',
  'Docs',
  'Database',
  'Auth'
] as const

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]

export type GuardrailId =
  | 'no-secrets'
  | 'no-innerHTML'
  | 'keep-context-isolation'
  | 'parameterized-queries'
  | 'validate-input'
  | 'no-eval'

export interface PromptVariable {
  key: string
  /** Dot path into the sculpt context, e.g. "framework" or "rendererDir". */
  source: string
  default: string
  label?: string
}

export interface PromptTemplate {
  id: string
  title: string
  categories: PromptCategory[]
  /** Stack tags that gate visibility. Include 'any' to always show. */
  stacks: string[]
  description: string
  variables: PromptVariable[]
  guardrails: GuardrailId[]
  /** Body text. Supports {{variable}} and {{#if cond}}...{{else}}...{{/if}}. */
  body: string
  favorite?: boolean
  usageCount?: number
  /** True for built-in prompts shipped in a pack; false/undefined for user prompts. */
  builtIn?: boolean
}

export interface SculptOptions {
  /** When true, append the hardened guardrail block referenced by the template. */
  guardrails: boolean
}

export interface ResolvedVariable {
  key: string
  value: string
  label: string
}

export interface SculptResult {
  sculptedText: string
  resolvedVariables: ResolvedVariable[]
}

/**
 * Flat key/value context the sculptor reads. String fields feed {{variable}} resolution;
 * boolean fields feed {{#if cond}} conditionals.
 */
export interface SculptContext {
  [key: string]: string | boolean | null
}
