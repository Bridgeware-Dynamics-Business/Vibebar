import type { File } from '@babel/types'
import type { AuditCategory, AuditFinding } from '@shared/types.js'
import type { AuditContext, AuditRuleInput, ScanFile } from '../engine/context.js'
import type { TaintAnalyzer } from '../engine/taint.js'

/**
 * Per-file context handed to every file-scoped rule during the single pass. The expensive bits
 * (masked source, parsed AST) are lazy + memoized, so a rule that only needs raw text never pays
 * for parsing, and a file parsed by one rule is reused by the next.
 */
export interface FileRuleContext {
  input: AuditRuleInput
  ctx: AuditContext
  file: ScanFile
  isPython: boolean
  isJs: boolean
  /** Source with string/comment *contents* blanked (offsets preserved). Memoized. */
  masked(): string
  /** Parsed Babel AST for JS/TS files (null for Python or on syntax error). Memoized. */
  ast(): File | null
  /** Shared intra-file taint analyzer. */
  taint(): TaintAnalyzer
}

export interface ProjectRuleContext {
  input: AuditRuleInput
}

export interface FileRule {
  id: string
  category: AuditCategory
  scope: 'file'
  /** Max findings this rule may contribute across the whole scan (noise guard). */
  cap?: number
  /** Cheap raw-text gate; skip the file entirely when it returns false. */
  prefilter?(content: string, file: ScanFile): boolean
  /** Whether the rule applies to this file at all (language/location gating). */
  appliesTo(ctx: { file: ScanFile; input: AuditRuleInput; isPython: boolean; isJs: boolean }): boolean
  /** Returns at most a few findings for this single file. */
  run(ctx: FileRuleContext): AuditFinding[]
}

export interface ProjectRule {
  id: string
  category: AuditCategory
  scope: 'project'
  run(ctx: ProjectRuleContext): AuditFinding[]
}

export type Rule = FileRule | ProjectRule

export function isFileRule(rule: Rule): rule is FileRule {
  return rule.scope === 'file'
}
