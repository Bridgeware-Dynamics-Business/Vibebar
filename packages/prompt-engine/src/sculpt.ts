import type { ProjectProfile } from '@vibebar/project-detector'
import { buildGuardrailBlock } from './guardrails.js'
import type {
  PromptTemplate,
  ResolvedVariable,
  SculptContext,
  SculptOptions,
  SculptResult
} from './types.js'

const FRAMEWORK_LABELS: Record<string, string> = {
  electron: 'Electron',
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  fastapi: 'FastAPI',
  flask: 'Flask',
  django: 'Django',
  laravel: 'Laravel',
  unknown: 'your app'
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  php: 'PHP',
  unknown: 'your language'
}

const TEST_RUNNER_LABELS: Record<string, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  pytest: 'pytest',
  playwright: 'Playwright',
  unknown: 'your test runner'
}

/** Converts a ProjectProfile into the flat context the sculptor reads. */
export function buildContext(profile: ProjectProfile): SculptContext {
  const has = (tag: string): boolean => profile.stacks.includes(tag)
  return {
    framework: FRAMEWORK_LABELS[profile.framework] ?? FRAMEWORK_LABELS.unknown,
    language: LANGUAGE_LABELS[profile.language] ?? LANGUAGE_LABELS.unknown,
    testRunner: TEST_RUNNER_LABELS[profile.testRunner] ?? TEST_RUNNER_LABELS.unknown,
    packageManager: profile.packageManager,
    folderName: profile.folderName,
    gitBranch: profile.gitBranch ?? 'main',
    entryFile: profile.entryFile ?? '',
    rendererDir: profile.rendererDir ?? 'src',
    isElectron: profile.isElectron,
    hasDb: profile.hasDb,
    isMonorepo: profile.isMonorepo,
    isTypeScript: profile.language === 'typescript',
    isPython: profile.language === 'python',
    isRust: profile.language === 'rust',
    isGo: profile.language === 'go',
    isPhp: profile.language === 'php',
    isReact: has('react') || profile.framework === 'react',
    isNext: profile.framework === 'next',
    isVue: profile.framework === 'vue',
    isSvelte: profile.framework === 'svelte',
    isWeb: ['next', 'react', 'vue', 'svelte'].includes(profile.framework)
  }
}

function isTruthy(ctx: SculptContext, rawCondition: string): boolean {
  const condition = rawCondition.trim()
  const negate = condition.startsWith('!')
  const key = (negate ? condition.slice(1) : condition).trim()
  const value = ctx[key]
  const truthy = typeof value === 'string' ? value.length > 0 : Boolean(value)
  return negate ? !truthy : truthy
}

const IF_OPEN = /\{\{#if\s+([^}]+)\}\}/

/** Finds the index just past the matching {{/if}}, and the index of a top-level {{else}}. */
function findBlockBounds(
  body: string,
  contentStart: number
): { elseIndex: number; closeStart: number; afterClose: number } | null {
  let depth = 1
  let i = contentStart
  let elseIndex = -1
  const openTag = /\{\{#if\s+[^}]+\}\}/g
  const elseTag = /\{\{else\}\}/g
  const closeTag = /\{\{\/if\}\}/g
  while (i < body.length) {
    openTag.lastIndex = i
    elseTag.lastIndex = i
    closeTag.lastIndex = i
    const nextOpen = openTag.exec(body)
    const nextElse = elseTag.exec(body)
    const nextClose = closeTag.exec(body)
    if (!nextClose) return null
    const candidates = [nextOpen, nextElse, nextClose].filter(
      (m): m is RegExpExecArray => m !== null
    )
    candidates.sort((a, b) => a.index - b.index)
    const first = candidates[0]
    if (first === nextOpen) {
      depth++
      i = nextOpen.index + nextOpen[0].length
    } else if (first === nextElse) {
      if (depth === 1 && elseIndex === -1) elseIndex = nextElse.index
      i = nextElse.index + nextElse[0].length
    } else {
      depth--
      if (depth === 0) {
        return {
          elseIndex,
          closeStart: nextClose.index,
          afterClose: nextClose.index + nextClose[0].length
        }
      }
      i = nextClose.index + nextClose[0].length
    }
  }
  return null
}

/** Resolves {{#if}}...{{else}}...{{/if}} blocks (supports nesting). */
function renderConditionals(body: string, ctx: SculptContext): string {
  const open = IF_OPEN.exec(body)
  if (!open) return body
  const condition = open[1]
  const contentStart = open.index + open[0].length
  const bounds = findBlockBounds(body, contentStart)
  if (!bounds) return body

  const before = body.slice(0, open.index)
  const after = body.slice(bounds.afterClose)
  let truthyBranch: string
  let falsyBranch: string
  if (bounds.elseIndex !== -1) {
    truthyBranch = body.slice(contentStart, bounds.elseIndex)
    falsyBranch = body.slice(bounds.elseIndex + '{{else}}'.length, bounds.closeStart)
  } else {
    truthyBranch = body.slice(contentStart, bounds.closeStart)
    falsyBranch = ''
  }

  const chosen = isTruthy(ctx, condition) ? truthyBranch : falsyBranch
  // Recurse: chosen branch may contain nested blocks; `after` may contain sibling blocks.
  return renderConditionals(before + chosen, ctx) + renderConditionals(after, ctx)
}

function substituteVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => values[key] ?? '')
}

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export function resolveVariables(
  template: PromptTemplate,
  ctx: SculptContext
): ResolvedVariable[] {
  return template.variables.map((v) => {
    const raw = ctx[v.source]
    const value =
      typeof raw === 'string' && raw.length > 0
        ? raw
        : typeof raw === 'boolean'
          ? String(raw)
          : v.default
    return { key: v.key, value, label: v.label ?? v.key }
  })
}

/**
 * Determines whether a template should be shown for a project's stacks. A template is
 * visible when it targets 'any' or shares at least one stack tag with the project.
 */
export function isTemplateVisible(template: PromptTemplate, stacks: string[]): boolean {
  if (template.stacks.includes('any')) return true
  return template.stacks.some((s) => stacks.includes(s))
}

export function sculptPrompt(
  template: PromptTemplate,
  ctx: SculptContext,
  options: SculptOptions
): SculptResult {
  const resolved = resolveVariables(template, ctx)
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string') values[key] = value
  }
  for (const r of resolved) values[r.key] = r.value

  let text = renderConditionals(template.body, ctx)
  text = substituteVariables(text, values)
  text = collapseBlankRuns(text)

  if (options.guardrails) {
    const block = buildGuardrailBlock(template.guardrails)
    if (block) text = `${text}\n\n${block}`
  }

  return { sculptedText: text, resolvedVariables: resolved }
}

export interface FilterOptions {
  stacks: string[]
  category?: string
  query?: string
}

/** Filters templates by stack visibility, optional category, and a free-text query. */
export function filterTemplates(
  templates: PromptTemplate[],
  options: FilterOptions
): PromptTemplate[] {
  const q = options.query?.trim().toLowerCase() ?? ''
  return templates.filter((t) => {
    if (!isTemplateVisible(t, options.stacks)) return false
    if (options.category && options.category !== 'All' && !t.categories.includes(options.category as never)) {
      return false
    }
    if (q) {
      const haystack = `${t.title} ${t.description} ${t.categories.join(' ')}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}
