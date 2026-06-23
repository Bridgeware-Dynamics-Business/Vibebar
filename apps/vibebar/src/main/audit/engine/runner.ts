import type { AuditFinding } from '@shared/types.js'
import type { FileFindingsCache } from '../cache.js'
import type { AuditRuleInput, ScanFile } from './context.js'
import { isJsLike, isPython as isPy } from './context.js'
import { maskStringsAndComments } from './lexer.js'
import { parseToAst } from './parse.js'
import { createTaintAnalyzer } from './taint.js'
import { type FileRule, type FileRuleContext, type ProjectRule, type Rule, isFileRule } from '../rules/types.js'

export interface RunOptions {
  /** When provided, file-scoped findings for unchanged files are reused instead of recomputed. */
  cache?: FileFindingsCache
}

export interface RunResult {
  findings: AuditFinding[]
  /** How many files were served from the incremental cache. */
  cachedFiles: number
}

/** Computes every file-scoped rule's findings for a single file (each rule self-limits per file). */
function findingsForFile(file: ScanFile, input: AuditRuleInput, fileRules: FileRule[]): AuditFinding[] {
  const fileIsPython = isPy(file.path)
  const fileIsJs = isJsLike(file.path)

  let maskedCache: string | undefined
  let astComputed = false
  let astCache: ReturnType<typeof parseToAst> = null
  const taintAnalyzer = createTaintAnalyzer()

  const ctx: FileRuleContext = {
    input,
    ctx: input.ctx,
    file,
    isPython: fileIsPython,
    isJs: fileIsJs,
    masked: () => {
      if (maskedCache === undefined) maskedCache = maskStringsAndComments(file.content, fileIsPython)
      return maskedCache
    },
    ast: () => {
      if (!astComputed) {
        astComputed = true
        astCache = fileIsJs ? parseToAst(file.content) : null
      }
      return astCache
    },
    taint: () => taintAnalyzer
  }

  const out: AuditFinding[] = []
  for (const rule of fileRules) {
    if (rule.prefilter && !rule.prefilter(file.content, file)) continue
    if (!rule.appliesTo({ file, input, isPython: fileIsPython, isJs: fileIsJs })) continue
    try {
      out.push(...rule.run(ctx))
    } catch {
      /* a single failing rule never aborts the file */
    }
  }
  return out
}

/**
 * The single-pass engine. Where the old design looped over every file once per detector (~12x),
 * this iterates each file exactly once and runs every applicable file-rule against it, reusing one
 * parsed AST and one masked-source string per file. Per-rule global caps are applied while merging,
 * so cached and freshly-computed files behave identically. Project-scoped rules run once at the end.
 */
export function runRules(input: AuditRuleInput, rules: Rule[], options: RunOptions = {}): RunResult {
  const fileRules = rules.filter(isFileRule)
  const projectRules = rules.filter((r): r is ProjectRule => !isFileRule(r))
  const findings: AuditFinding[] = []
  const counts = new Map<string, number>()
  const cap = (id: string): number => fileRules.find((r) => r.id === id)?.cap ?? 8
  const cache = options.cache

  for (const file of input.files) {
    let perFile = cache?.get(file.path, file.content)
    if (!perFile) {
      perFile = findingsForFile(file, input, fileRules)
      cache?.set(file.path, file.content, perFile)
    }
    // Apply per-rule global caps deterministically in file order.
    for (const f of perFile) {
      const ruleId = f.id.includes('-') ? f.id.split('-').slice(0, -1).join('-') : f.id
      const matchedRule = fileRules.find((r) => f.id === r.id || f.id.startsWith(`${r.id}-`))
      const key = matchedRule?.id ?? ruleId
      const used = counts.get(key) ?? 0
      if (used >= cap(key)) continue
      counts.set(key, used + 1)
      findings.push(f)
    }
  }

  for (const rule of projectRules) {
    try {
      findings.push(...rule.run({ input }))
    } catch {
      /* a single failing project rule never aborts the scan */
    }
  }

  return { findings, cachedFiles: cache?.hits ?? 0 }
}
