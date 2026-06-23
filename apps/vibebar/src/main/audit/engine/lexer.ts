/**
 * Lexical helpers shared by every rule. These are intentionally parser-free: they operate on raw
 * source text so they work uniformly across JS/TS/Python and never throw on syntax the AST layer
 * cannot handle. The AST + taint layer (parse.ts / taint.ts) sits on top of these for JS/TS.
 */

/** Resolves a byte offset into a 1-based line/column. */
export function locate(content: string, index: number): { line: number; column: number } {
  let line = 1
  let column = 1
  const end = Math.min(index, content.length)
  for (let i = 0; i < end; i++) {
    if (content.charCodeAt(i) === 10) {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

/** A numbered code frame around the match, marking the offending line with '>'. */
export function codeFrame(content: string, index: number, radius = 3): string {
  const lines = content.split('\n')
  const { line } = locate(content, index)
  const start = Math.max(1, line - radius)
  const stop = Math.min(lines.length, line + radius)
  const width = String(stop).length
  const out: string[] = []
  for (let n = start; n <= stop; n++) {
    const raw = (lines[n - 1] ?? '').replace(/\s+$/, '')
    const marker = n === line ? '>' : ' '
    out.push(`${marker} ${String(n).padStart(width)} | ${raw}`)
  }
  return out.join('\n')
}

/** A short, whitespace-collapsed snippet of source around an offset, for evidence display. */
export function snippet(content: string, index: number, len = 120): string {
  const start = Math.max(0, index - 10)
  return content.slice(start, start + len).replace(/\s+/g, ' ').trim()
}

/**
 * Chars after which a `/` begins a regex literal rather than a division operator. Conservative on
 * purpose: anything that can *end* an expression (identifiers, digits, `)`, `]`, `}`, `.`, quotes)
 * is excluded, so we only ever mask a `/.../ ` we are confident is a regex. Mis-classifying a regex
 * as division just leaves it unmasked (status quo) — the safe direction — whereas the reverse would
 * over-mask real code and hide findings.
 */
const REGEX_PRECEDE = new Set(['(', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '/', '%', '<', '>', '^', '~', '[', '{'])

/**
 * Returns a copy of `src` with the *contents* of string literals (', ", `), comments (// line,
 * block, and # line comments in Python), and regex literals (/.../ ) replaced by spaces, preserving
 * length and newlines so byte offsets/line numbers are unchanged. Template-literal `${ }`
 * expressions are preserved as code (so real `query(`...${x}`)` interpolation still matches) while
 * the literal text around them is blanked (so a security keyword that only appears as documentation
 * text, inside an enclosing string, or inside a regex pattern never produces a finding — this is
 * what keeps the audit from flagging its own detector patterns). A small forward-scan state machine
 * — not a full parser — handling escapes, template-expression nesting, and regex/division
 * disambiguation reasonably.
 */
export function maskStringsAndComments(src: string, isPy = false): string {
  const n = src.length
  const out: string[] = new Array(n)
  type State = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tmpl' | 'regex'
  let state: State = 'code'
  const tmplStack: number[] = []
  let braceDepth = 0
  // Last significant (non-whitespace) char emitted in code state — drives regex-vs-division.
  let lastSig = ''
  // True while inside a regex character class `[...]`, where `/` does not terminate the regex.
  let regexInClass = false
  const keep = (k: number): void => {
    out[k] = src[k]
  }
  // Keep a code char and remember it as the last significant token (ignoring whitespace).
  const keepCode = (k: number): void => {
    out[k] = src[k]
    const ch = src[k]
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') lastSig = ch
  }
  const mask = (k: number): void => {
    const ch = src[k]
    out[k] = ch === '\n' || ch === '\r' ? ch : ' '
  }
  let i = 0
  while (i < n) {
    const c = src[i]
    const c2 = i + 1 < n ? src[i + 1] : ''
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        keep(i)
        keep(i + 1)
        state = 'line'
        i += 2
        continue
      }
      if (c === '/' && c2 === '*') {
        keep(i)
        keep(i + 1)
        state = 'block'
        i += 2
        continue
      }
      // A lone `/` starts a regex literal only when the previous token can't end an expression.
      if (!isPy && c === '/' && (lastSig === '' || REGEX_PRECEDE.has(lastSig))) {
        keep(i)
        state = 'regex'
        regexInClass = false
        i++
        continue
      }
      if (isPy && c === '#') {
        keep(i)
        state = 'line'
        i++
        continue
      }
      if (c === "'") {
        keep(i)
        state = 'sq'
        i++
        continue
      }
      if (c === '"') {
        keep(i)
        state = 'dq'
        i++
        continue
      }
      if (c === '`') {
        keep(i)
        state = 'tmpl'
        i++
        continue
      }
      if (c === '{') {
        braceDepth++
        keepCode(i)
        i++
        continue
      }
      if (c === '}') {
        if (tmplStack.length > 0 && braceDepth === tmplStack[tmplStack.length - 1]) {
          tmplStack.pop()
          braceDepth--
          keep(i)
          state = 'tmpl'
          i++
          continue
        }
        braceDepth--
        keepCode(i)
        i++
        continue
      }
      keepCode(i)
      i++
      continue
    }
    if (state === 'regex') {
      if (c === '\\') {
        mask(i)
        if (i + 1 < n) mask(i + 1)
        i += 2
        continue
      }
      if (c === '\n') {
        // Unterminated regex — bail back to code so we don't swallow the rest of the file.
        out[i] = '\n'
        state = 'code'
        lastSig = 'a'
        i++
        continue
      }
      if (c === '[') {
        regexInClass = true
        mask(i)
        i++
        continue
      }
      if (c === ']') {
        regexInClass = false
        mask(i)
        i++
        continue
      }
      if (c === '/' && !regexInClass) {
        keep(i)
        state = 'code'
        // The regex literal is a value, so a following `/` is division, not another regex.
        lastSig = 'a'
        i++
        continue
      }
      mask(i)
      i++
      continue
    }
    if (state === 'line') {
      if (c === '\n') {
        out[i] = '\n'
        state = 'code'
        i++
        continue
      }
      mask(i)
      i++
      continue
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') {
        mask(i)
        mask(i + 1)
        state = 'code'
        i += 2
        continue
      }
      mask(i)
      i++
      continue
    }
    if (state === 'sq' || state === 'dq') {
      const quote = state === 'sq' ? "'" : '"'
      if (c === '\\') {
        mask(i)
        if (i + 1 < n) mask(i + 1)
        i += 2
        continue
      }
      if (c === quote) {
        keep(i)
        state = 'code'
        // A closed string is a value, so a following `/` is division, not a regex.
        lastSig = 'a'
        i++
        continue
      }
      if (c === '\n') {
        // Unterminated string — bail back to code so we don't swallow the rest of the file.
        out[i] = '\n'
        state = 'code'
        i++
        continue
      }
      mask(i)
      i++
      continue
    }
    if (state === 'tmpl') {
      if (c === '\\') {
        mask(i)
        if (i + 1 < n) mask(i + 1)
        i += 2
        continue
      }
      if (c === '`') {
        keep(i)
        state = 'code'
        // A closed template literal is a value, so a following `/` is division, not a regex.
        lastSig = 'a'
        i++
        continue
      }
      if (c === '$' && c2 === '{') {
        keep(i)
        keep(i + 1)
        braceDepth++
        tmplStack.push(braceDepth)
        state = 'code'
        // A fresh expression begins, so a leading `/` here is a regex, not division.
        lastSig = '{'
        i += 2
        continue
      }
      mask(i)
      i++
      continue
    }
    keep(i)
    i++
  }
  return out.join('')
}

/** Shannon entropy (bits/char) of a string — low entropy implies a non-random placeholder. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0
  const freq: Record<string, number> = {}
  for (const ch of value) freq[ch] = (freq[ch] ?? 0) + 1
  let bits = 0
  for (const k in freq) {
    const p = freq[k] / value.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/** A literal value that is clearly a placeholder, not a real secret. */
export function isPlaceholderSecret(value: string): boolean {
  return /(your[_-]?|example|placeholder|changeme|change[_-]?this|xxxx|<.*>|\$\{|process\.env|os\.environ|dummy|sample|test[_-]?key|fake)/i.test(
    value
  )
}

/** Heuristic: a captured "secret" value that is obviously fake (example/sequential/low-entropy). */
export function looksLikeFakeSecret(value: string): boolean {
  if (/(example|sample|dummy|placeholder|changeme|xxxx|test|fake|notreal|redacted)/i.test(value)) return true
  if (/0123456789|123456789|abcdefgh|ABCDEFGH/.test(value)) return true
  const core = value.replace(/[^A-Za-z0-9]/g, '')
  if (core.length >= 16 && shannonEntropy(core) < 2.8) return true
  return false
}

/** Redacts a secret value: keep up to 4 leading characters, then mask the remainder. */
export function redactSecret(value: string): string {
  if (value.length <= 6) return '\u00ab redacted \u00bb'
  return `${value.slice(0, 4)}\u2026\u00abredacted\u00bb`
}

/** Replaces every occurrence of each value with its redaction inside a piece of finding text. */
export function redactAll(text: string, values: string[]): string {
  let out = text
  for (const v of values) {
    if (!v) continue
    out = out.split(v).join(redactSecret(v))
  }
  return out
}
