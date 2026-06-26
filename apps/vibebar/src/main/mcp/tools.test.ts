import { describe, expect, it } from 'vitest'
import { resolvePackCharBudget, resolvePackTierAndBudget } from './constants.js'

describe('mcp tools', () => {
  it('resolvePackCharBudget clamps token budget', () => {
    expect(resolvePackCharBudget(1000)).toBe(4000)
    expect(resolvePackCharBudget(undefined)).toBeGreaterThan(0)
  })

  it('resolvePackTierAndBudget honors tier', () => {
    expect(resolvePackTierAndBudget(undefined, 'micro')).toEqual({ tier: 'micro', budget: 8000 })
  })
})
