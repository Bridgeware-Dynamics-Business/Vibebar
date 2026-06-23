import { describe, expect, it } from 'vitest'
import { parseToAst } from './parse.js'
import { createTaintAnalyzer, type NodePath, traverseAst } from './taint.js'

/** Parses `code`, finds the first call to `SINK(...)`, and reports whether its 1st arg is tainted. */
function taintOfSinkArg(code: string): boolean {
  const ast = parseToAst(code)
  if (!ast) throw new Error('parse failed')
  const taint = createTaintAnalyzer()
  let result = false
  let found = false
  traverseAst(ast, {
    CallExpression(path) {
      if (found) return
      const callee = path.get('callee')
      if (callee.isIdentifier() && callee.node.name === 'SINK') {
        found = true
        const arg = (path.get('arguments')[0] as NodePath | undefined) ?? null
        result = taint.isTainted(arg)
      }
    }
  })
  if (!found) throw new Error('no SINK call found')
  return result
}

describe('taint analysis', () => {
  it('marks request members as tainted', () => {
    expect(taintOfSinkArg('function h(req, res){ SINK(req.body.x) }')).toBe(true)
    expect(taintOfSinkArg('function h(req, res){ SINK(req.query.id) }')).toBe(true)
    expect(taintOfSinkArg('function h(req, res){ SINK(req.params.slug) }')).toBe(true)
  })

  it('propagates taint through a local variable', () => {
    expect(taintOfSinkArg('function h(req, res){ const y = req.query.id; SINK(y) }')).toBe(true)
  })

  it('propagates taint through a template literal', () => {
    expect(taintOfSinkArg('function h(req, res){ SINK(`/u/${req.params.id}`) }')).toBe(true)
  })

  it('propagates taint through string concatenation and passthrough methods', () => {
    expect(taintOfSinkArg('function h(req, res){ SINK("x=" + req.query.q) }')).toBe(true)
    expect(taintOfSinkArg('function h(req, res){ SINK(req.query.q.trim().toLowerCase()) }')).toBe(true)
  })

  it('treats sanitized input as clean', () => {
    expect(taintOfSinkArg('function h(req, res){ SINK(parseInt(req.query.id)) }')).toBe(false)
    expect(taintOfSinkArg('function h(req, res){ SINK(Number(req.query.n)) }')).toBe(false)
  })

  it('treats constants and unrelated locals as clean', () => {
    expect(taintOfSinkArg('const y = "static"; SINK(y)')).toBe(false)
    expect(taintOfSinkArg('function h(req, res){ const y = 42; SINK(y) }')).toBe(false)
  })

  it('treats a free (undeclared) variable as not provably tainted', () => {
    expect(taintOfSinkArg('SINK(userInput)')).toBe(false)
  })

  it('marks Electron ipcMain handler args (after event) as tainted', () => {
    expect(taintOfSinkArg("ipcMain.handle('c', (event, arg) => { SINK(arg) })")).toBe(true)
  })

  it('marks browser location as tainted', () => {
    expect(taintOfSinkArg('SINK(location.hash)')).toBe(true)
    expect(taintOfSinkArg('SINK(window.location.search)')).toBe(true)
  })
})
