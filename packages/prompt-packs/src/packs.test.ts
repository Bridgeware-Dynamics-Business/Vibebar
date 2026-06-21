import { describe, expect, it } from 'vitest'
import { getBuiltInPrompts } from './index.js'

describe('prompt packs', () => {
  const prompts = getBuiltInPrompts()

  it('ships a non-trivial library of built-in prompts', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(12)
  })

  it('gives every prompt a unique id', () => {
    const ids = prompts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('marks every starter prompt as built-in with at least one category and stack', () => {
    for (const p of prompts) {
      expect(p.builtIn).toBe(true)
      expect(p.categories.length).toBeGreaterThan(0)
      expect(p.stacks.length).toBeGreaterThan(0)
      expect(p.body.length).toBeGreaterThan(0)
    }
  })

  it('includes cross-stack prompts visible to any project', () => {
    expect(prompts.some((p) => p.stacks.includes('any'))).toBe(true)
  })
})
