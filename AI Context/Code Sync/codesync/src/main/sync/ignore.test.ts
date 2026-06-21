import { describe, expect, it } from 'vitest'
import { compileIgnoreMatchers, getIgnoreGlobList, isIgnoredRel, parseUserIgnoreLines } from './ignore.js'

describe('ignore', () => {
  it('parses user lines', () => {
    expect(parseUserIgnoreLines('a\nb, c')).toEqual(['a', 'b', 'c'])
  })

  it('matches node_modules via glob', () => {
    const m = compileIgnoreMatchers([])
    expect(isIgnoredRel('node_modules/foo/index.js', m)).toBe(true)
    expect(isIgnoredRel('src/index.ts', m)).toBe(false)
  })

  it('respects extra patterns', () => {
    const m = compileIgnoreMatchers(['**/vendor/**'])
    expect(isIgnoredRel('vendor/x', m)).toBe(true)
  })

  it('getIgnoreGlobList includes defaults and extras', () => {
    const g = getIgnoreGlobList(['*.log'])
    expect(g.some((x) => x.includes('node_modules'))).toBe(true)
    expect(g).toContain('*.log')
  })
})
