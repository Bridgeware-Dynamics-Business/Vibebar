import { createHash } from 'node:crypto'
import { parse as babelParse, type ParserOptions } from '@babel/parser'
import type { File } from '@babel/types'

/**
 * Parses JS/TS/JSX/TSX into a Babel AST, with a small content-hash-keyed cache so the same file is
 * only parsed once per scan even when several rules ask for its tree. Parsing is best-effort: on any
 * syntax error we return null and the caller falls back to the lexer/regex layer, so a single
 * un-parseable file never breaks the scan.
 */

const PARSE_OPTIONS: ParserOptions = {
  sourceType: 'unambiguous',
  errorRecovery: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  allowSuperOutsideMethod: true,
  plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes', 'explicitResourceManagement']
}

const cache = new Map<string, File | null>()
/** Bounds the cache so a long-running session scanning many projects cannot grow without limit. */
const MAX_CACHE = 2000

function key(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

export function parseToAst(content: string): File | null {
  const k = key(content)
  const cached = cache.get(k)
  if (cached !== undefined) return cached
  let ast: File | null = null
  try {
    ast = babelParse(content, PARSE_OPTIONS)
  } catch {
    ast = null
  }
  if (cache.size >= MAX_CACHE) cache.clear()
  cache.set(k, ast)
  return ast
}

/** Clears the parse cache (used in tests and when scan config changes). */
export function clearParseCache(): void {
  cache.clear()
}
