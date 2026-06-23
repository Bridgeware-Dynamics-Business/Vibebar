import type { AuditConfidence } from '@shared/types.js'
import { type NodePath, traverseAst } from '../engine/taint.js'
import type { FileRuleContext } from './types.js'

/**
 * Bridges the proven regex/lexer detection layer with the AST taint layer: given a byte offset where
 * a structural match fired, find the call expression that encloses it and ask the taint analyzer
 * whether any of its arguments are attacker-controlled. A `true` answer lifts confidence to `high`.
 * We never *downgrade* below `medium` on a taint miss, so recall is preserved on free variables and
 * cross-file flows the intra-file analysis cannot see.
 */
function findEnclosingCall(ctx: FileRuleContext, index: number): NodePath | null {
  const ast = ctx.ast()
  if (!ast) return null
  let best: NodePath | null = null
  let bestStart = -1
  traverseAst(ast, {
    CallExpression(path) {
      const node = path.node
      if (node.start == null || node.end == null) return
      if (node.start <= index && index <= node.end && node.start > bestStart) {
        best = path
        bestStart = node.start
      }
    }
  })
  return best
}

function callHasTaintedArg(ctx: FileRuleContext, call: NodePath): boolean {
  if (!call.isCallExpression()) return false
  const taint = ctx.taint()
  return call.get('arguments').some((arg) => taint.isTainted(arg as NodePath))
}

/** `high` when taint reaches the sink at `index`, otherwise `medium`. */
export function confidenceAt(ctx: FileRuleContext, index: number): AuditConfidence {
  if (!ctx.isJs) return 'medium'
  const call = findEnclosingCall(ctx, index)
  if (call && callHasTaintedArg(ctx, call)) return 'high'
  return 'medium'
}

/** Runs `visitor` against the file's AST when it parsed; a convenience for AST-first rules. */
export function withAst(ctx: FileRuleContext, visit: (helpers: { taintAt: (index: number) => AuditConfidence }) => void): void {
  if (!ctx.ast()) return
  visit({ taintAt: (index: number) => confidenceAt(ctx, index) })
}

export interface SinkMatch {
  /** Byte offset of the call, for the code frame. */
  index: number
  /** True when taint analysis confirms untrusted input reaches the watched argument. */
  tainted: boolean
  /** True when the watched argument is anything other than a constant string/number literal. */
  dynamic: boolean
  /** Human label of the callee, e.g. "fetch" or "res.redirect". */
  label: string
}

interface CalleeInfo {
  objectName?: string
  propertyName?: string
  calleeName?: string
  label: string
}

function calleeInfo(path: NodePath): CalleeInfo | null {
  if (!path.isCallExpression() && !path.isNewExpression()) return null
  const callee = path.get('callee') as NodePath
  if (callee.isIdentifier()) {
    return { calleeName: callee.node.name, label: callee.node.name }
  }
  if (callee.isMemberExpression()) {
    const obj = callee.get('object')
    const propNode = callee.node.property
    const propertyName = propNode.type === 'Identifier' ? propNode.name : undefined
    const objectName = obj.isIdentifier()
      ? obj.node.name
      : obj.isMemberExpression() && obj.get('property').isIdentifier()
        ? (obj.node.property as { name?: string }).name
        : undefined
    return {
      objectName,
      propertyName,
      label: `${objectName ?? '?'}.${propertyName ?? '?'}`
    }
  }
  return null
}

function argIsDynamic(arg: NodePath | undefined): boolean {
  if (!arg || !arg.node) return false
  if (arg.isStringLiteral() || arg.isNumericLiteral() || arg.isBooleanLiteral()) return false
  if (arg.isTemplateLiteral() && arg.get('expressions').length === 0) return false
  return true
}

/**
 * Finds calls to a watched sink and reports, for the chosen argument, whether it is dynamic and
 * whether taint confirms attacker control. AST-first so a sink that appears only inside a string or
 * comment is never matched. Returns nothing when the AST is unavailable (caller may fall back).
 */
export function findSinkCalls(
  ctx: FileRuleContext,
  opts: {
    match: (info: CalleeInfo) => boolean
    /** Which argument carries the dangerous value; defaults to the first. */
    argIndex?: number
    /** When true, only report calls whose watched argument is dynamic (not a constant literal). */
    requireDynamic?: boolean
  }
): SinkMatch[] {
  const ast = ctx.ast()
  if (!ast) return []
  const taint = ctx.taint()
  const out: SinkMatch[] = []
  traverseAst(ast, {
    CallExpression(path) {
      const info = calleeInfo(path)
      if (!info || !opts.match(info)) return
      const args = path.get('arguments')
      const arg = (Array.isArray(args) ? args[opts.argIndex ?? 0] : undefined) as NodePath | undefined
      const dynamic = argIsDynamic(arg)
      if (opts.requireDynamic && !dynamic) return
      const node = path.node
      out.push({
        index: node.start ?? 0,
        tainted: arg ? taint.isTainted(arg) : false,
        dynamic,
        label: info.label
      })
    }
  })
  return out
}
