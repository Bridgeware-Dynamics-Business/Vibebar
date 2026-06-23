import _traverse, { type NodePath, type TraverseOptions } from '@babel/traverse'
import type { File, Node } from '@babel/types'

/**
 * Lightweight, intra-procedural taint analysis over a Babel AST. The goal is not to be a sound
 * data-flow engine (that needs a whole-program model); it is to answer one practical question well:
 * "does an expression that feeds a dangerous sink originate from untrusted input within this file?"
 *
 * A `true` answer raises a finding's confidence to `high`; a `false` answer does not suppress a
 * structural match, it just keeps confidence at `medium` — so we never trade recall for precision.
 */

// `@babel/traverse` is CJS; under ESM interop the callable lives on `.default`.
const traverse = (typeof _traverse === 'function'
  ? _traverse
  : (_traverse as unknown as { default: typeof _traverse }).default) as typeof _traverse

/** Object roots whose members are attacker-controlled (request-shaped, browser location, argv). */
const SOURCE_ROOT = /^(req|request|ctx|context|httpRequest)$/i
const SOURCE_MEMBER = /^(body|query|params|param|headers|header|cookies|url|originalUrl|rawBody|files|file)$/i

/** Browser-global sources (DOM-driven XSS / open redirect). */
const SOURCE_GLOBAL = /^(location|document|window)$/

/** Calls that read attacker input, e.g. `searchParams.get(...)`, `req.header(...)`, `url.parse`. */
const SOURCE_CALL_MEMBER = /^(get|getAll|param|header|cookie)$/

/** Functions/methods that neutralize taint (validation, numeric coercion, allowlist lookups). */
const SANITIZER = /^(parseInt|parseFloat|Number|Boolean|encodeURIComponent|escape|btoa)$/
const SANITIZER_MEMBER = /^(parse|safeParse|validate|validateSync|cast|escape|sanitize|basename|normalize)$/

/** String methods that pass taint through (the result is still attacker-influenced). */
const PASSTHROUGH_MEMBER =
  /^(trim|trimStart|trimEnd|toString|toLowerCase|toUpperCase|replace|replaceAll|slice|substring|substr|concat|padStart|padEnd|at|normalize|split|join|repeat)$/

interface AnalyzeState {
  depth: number
  seen: Set<Node>
}

function unwrap(path: NodePath): NodePath {
  let p = path
  // Peel TS/paren wrappers that don't change taint.
  while (
    p &&
    (p.isTSAsExpression?.() ||
      p.isTSNonNullExpression?.() ||
      p.isTSSatisfiesExpression?.() ||
      p.isParenthesizedExpression?.() ||
      p.isAwaitExpression?.())
  ) {
    const inner = p.isAwaitExpression?.() ? p.get('argument') : p.get('expression')
    if (Array.isArray(inner) || !inner?.node) break
    p = inner
  }
  return p
}

/** True when this member chain is rooted at a request/browser source object. */
function isSourceMember(path: NodePath): boolean {
  if (!path.isMemberExpression()) return false
  const obj = path.get('object')
  const prop = path.node.property
  const propName = path.node.computed
    ? undefined
    : prop.type === 'Identifier'
      ? prop.name
      : undefined

  // req.body / req.query / ctx.request.body / request.params...
  if (obj.isIdentifier() && SOURCE_ROOT.test(obj.node.name)) {
    if (propName && SOURCE_MEMBER.test(propName)) return true
    // ctx.request.* (Koa) — let the deeper member match handle it.
  }
  // Deep chains: foo.req.body — only trust when the immediate root matches.
  if (obj.isMemberExpression() && isSourceMember(obj)) return true
  // Browser: location.hash, document.location.href, window.name, window.location.search
  if (obj.isIdentifier() && SOURCE_GLOBAL.test(obj.node.name)) {
    if (obj.node.name === 'window' && propName && !/^(location|name)$/.test(propName)) return false
    return true
  }
  if (obj.isMemberExpression()) {
    const innerObj = obj.get('object')
    if (innerObj.isIdentifier() && SOURCE_GLOBAL.test(innerObj.node.name)) return true
  }
  return false
}

/** Whether a function parameter is itself an untrusted source (handler req, IPC event args). */
function isSourceParam(binding: { path: NodePath; kind?: string }): boolean {
  if (binding.kind !== 'param') return false
  const paramPath = binding.path
  const idName = paramPath.isIdentifier() ? paramPath.node.name : undefined
  if (idName && SOURCE_ROOT.test(idName)) return true

  // Electron IPC: ipcMain.handle(channel, (event, ...args) => ...) — args after `event` are tainted.
  const fn = paramPath.getFunctionParent()
  if (fn) {
    const params = fn.node.params ?? []
    const idx = params.findIndex((p) => p === paramPath.node)
    const callArg = fn.parentPath
    if (callArg?.isCallExpression()) {
      const callee = callArg.get('callee')
      if (callee.isMemberExpression()) {
        const root = callee.get('object')
        const propNode = callee.node.property
        const prop = propNode.type === 'Identifier' ? propNode.name : ''
        if (root.isIdentifier() && /ipcMain/i.test(root.node.name) && /^(handle|on|once|handleOnce)$/.test(prop)) {
          if (idx >= 1) return true
        }
      }
    }
  }
  return false
}

function isTaintedPath(path: NodePath | null | undefined, state: AnalyzeState): boolean {
  if (!path || !path.node) return false
  if (state.depth > 24) return false
  if (state.seen.has(path.node)) return false
  state.seen.add(path.node)
  const p = unwrap(path)
  const next: AnalyzeState = { depth: state.depth + 1, seen: state.seen }

  if (p.isStringLiteral() || p.isNumericLiteral() || p.isBooleanLiteral() || p.isNullLiteral()) return false

  if (p.isTemplateLiteral()) {
    return p.get('expressions').some((e) => isTaintedPath(e as NodePath, next))
  }

  if (p.isBinaryExpression() && p.node.operator === '+') {
    return isTaintedPath(p.get('left') as NodePath, next) || isTaintedPath(p.get('right'), next)
  }

  if (p.isLogicalExpression() || p.isConditionalExpression()) {
    const branches = p.isConditionalExpression()
      ? [p.get('consequent'), p.get('alternate')]
      : [p.get('left'), p.get('right')]
    return branches.some((b) => isTaintedPath(b as NodePath, next))
  }

  if (p.isMemberExpression()) {
    if (isSourceMember(p)) return true
    return isTaintedPath(p.get('object'), next)
  }

  if (p.isCallExpression() || p.isNewExpression()) {
    const callee = p.get('callee') as NodePath
    // Sanitizers fully clean their input.
    if (callee.isIdentifier() && SANITIZER.test(callee.node.name)) return false
    if (callee.isMemberExpression()) {
      const propNode = callee.node.property
      const prop = propNode.type === 'Identifier' ? propNode.name : ''
      if (SANITIZER_MEMBER.test(prop)) return false
      // searchParams.get('x'), req.header('x'), cookies.get('x') — reading from a source object.
      if (SOURCE_CALL_MEMBER.test(prop)) {
        const recv = callee.get('object')
        if (
          (recv.isIdentifier() && /searchParams|params|query|cookies|headers|url/i.test(recv.node.name)) ||
          isTaintedPath(recv, next) ||
          isSourceMember(recv)
        ) {
          return true
        }
      }
      // Passthrough string methods on a tainted receiver keep the taint.
      if (PASSTHROUGH_MEMBER.test(prop) && isTaintedPath(callee.get('object'), next)) return true
    }
    // JSON.parse(tainted) stays tainted.
    if (
      callee.isMemberExpression() &&
      callee.get('object').isIdentifier() &&
      (callee.get('object').node as { name?: string }).name === 'JSON'
    ) {
      const jsonArgs = p.get('arguments') as NodePath[]
      return jsonArgs.some((a) => isTaintedPath(a, next))
    }
    return false
  }

  if (p.isArrayExpression()) {
    return p.get('elements').some((e) => isTaintedPath(e as NodePath, next))
  }

  if (p.isObjectExpression()) {
    return p.get('properties').some((prop) => {
      if (prop.isObjectProperty()) return isTaintedPath(prop.get('value') as NodePath, next)
      if (prop.isSpreadElement()) return isTaintedPath(prop.get('argument'), next)
      return false
    })
  }

  if (p.isSpreadElement()) {
    return isTaintedPath(p.get('argument'), next)
  }

  if (p.isIdentifier()) {
    const name = p.node.name
    if (SOURCE_GLOBAL.test(name)) return true
    const binding = p.scope.getBinding(name)
    if (!binding) return false
    if (isSourceParam(binding)) return true
    // Follow the declarator's initializer.
    if (binding.path.isVariableDeclarator()) {
      if (isTaintedPath(binding.path.get('init') as NodePath, next)) return true
    }
    // Follow reassignments: x = <tainted> after declaration.
    for (const violation of binding.constantViolations) {
      if (violation.isAssignmentExpression() && isTaintedPath(violation.get('right'), next)) return true
    }
    return false
  }

  return false
}

export interface TaintAnalyzer {
  /** True when the expression at `path` is influenced by untrusted input within this file. */
  isTainted(path: NodePath | null | undefined): boolean
}

export function createTaintAnalyzer(): TaintAnalyzer {
  return {
    isTainted(path) {
      return isTaintedPath(path, { depth: 0, seen: new Set<Node>() })
    }
  }
}

/** Thin wrapper over `@babel/traverse` with the ESM-interop handled in one place. */
export function traverseAst(ast: File, visitor: TraverseOptions): void {
  traverse(ast, visitor)
}

export type { NodePath }
