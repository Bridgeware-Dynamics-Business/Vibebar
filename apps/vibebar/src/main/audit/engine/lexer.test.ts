import { describe, expect, it } from 'vitest'
import {
  isPlaceholderSecret,
  locate,
  maskStringsAndComments,
  redactSecret,
  shannonEntropy
} from './lexer.js'

describe('maskStringsAndComments', () => {
  it('preserves length and newlines so offsets stay valid', () => {
    const src = 'const a = "secret"\n// comment\nconst b = 1'
    const masked = maskStringsAndComments(src)
    expect(masked.length).toBe(src.length)
    expect(masked.split('\n').length).toBe(src.split('\n').length)
  })

  it('blanks the contents of string literals but keeps the quotes', () => {
    const masked = maskStringsAndComments('const x = "DROP TABLE users"')
    expect(masked).not.toContain('DROP TABLE')
    expect(masked).toContain('"')
  })

  it('blanks line and block comment contents', () => {
    const masked = maskStringsAndComments('a // eval(danger)\n/* innerHTML */ b')
    expect(masked).not.toContain('eval(danger)')
    expect(masked).not.toContain('innerHTML')
  })

  it('keeps template interpolation expressions as live code', () => {
    const masked = maskStringsAndComments('query(`SELECT * WHERE id=${userId}`)')
    expect(masked).toContain('${userId}')
    expect(masked).not.toContain('SELECT')
  })

  it('treats # as a comment only in Python mode', () => {
    expect(maskStringsAndComments('x = 1 # secret', true)).not.toContain('secret')
    expect(maskStringsAndComments('const a = b # secret', false)).toContain('secret')
  })

  it('blanks regex-literal contents so a keyword in a pattern is not matched as code', () => {
    const masked = maskStringsAndComments('const re = /createCipher\\s*\\(/')
    expect(masked).not.toContain('createCipher')
    expect(masked).toContain('/')
  })

  it('masks regex patterns in object/array positions (the rule-definition case)', () => {
    const masked = maskStringsAndComments("const checks = [{ re: /\\beval\\(/, what: 'x' }]")
    expect(masked).not.toContain('eval')
    // The descriptive string is still blanked too, but its quotes survive.
    expect(masked).toContain('what')
  })

  it('does not mistake division for a regex (keeps surrounding code intact)', () => {
    const masked = maskStringsAndComments('const ratio = total / count\nconst half = size/2')
    expect(masked).toBe('const ratio = total / count\nconst half = size/2')
  })

  it('treats a regex as a value so a following division is not masked', () => {
    const src = 'const ok = /a/.test(x)\nconst y = z / 2'
    const masked = maskStringsAndComments(src)
    expect(masked).toContain('.test(x)')
    expect(masked).toContain('z / 2')
  })

  it('preserves length when masking regex literals', () => {
    const src = 'if (/AKIA[0-9A-Z]{16}/.test(s)) {}'
    const masked = maskStringsAndComments(src)
    expect(masked.length).toBe(src.length)
    expect(masked).not.toContain('AKIA')
  })
})

describe('lexer helpers', () => {
  it('locate resolves 1-based line/column', () => {
    const src = 'ab\ncd'
    expect(locate(src, 0)).toEqual({ line: 1, column: 1 })
    expect(locate(src, 3)).toEqual({ line: 2, column: 1 })
  })

  it('shannonEntropy is higher for random strings', () => {
    expect(shannonEntropy('aaaaaaaa')).toBeLessThan(shannonEntropy('a8Fk2Lm9'))
  })

  it('recognizes placeholder secrets', () => {
    expect(isPlaceholderSecret('your-api-key-here')).toBe(true)
    expect(isPlaceholderSecret('process.env.SECRET')).toBe(true)
    expect(isPlaceholderSecret('sk_live_realLookingValue1234')).toBe(false)
  })

  it('redacts secrets while keeping a short prefix', () => {
    const r = redactSecret('sk_live_abcdefghijklmnop')
    expect(r.startsWith('sk_l')).toBe(true)
    expect(r).not.toContain('abcdefghijklmnop')
  })
})
