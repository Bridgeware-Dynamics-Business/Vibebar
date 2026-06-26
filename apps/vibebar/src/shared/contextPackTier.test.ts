import { describe, expect, it } from 'vitest'
import {
  CONTEXT_PACK_TIER_BUDGETS,
  recommendContextPackTier,
  resolveContextPackBudget
} from './contextPackTier.js'

describe('resolveContextPackBudget', () => {
  it('maps tiers to fixed budgets', () => {
    expect(resolveContextPackBudget('micro')).toEqual({ tier: 'micro', budget: 8_000 })
    expect(resolveContextPackBudget('standard')).toEqual({ tier: 'standard', budget: 32_000 })
    expect(resolveContextPackBudget('full')).toEqual({ tier: 'full', budget: 100_000 })
  })

  it('derives tier from maxTokens when tier omitted', () => {
    const resolved = resolveContextPackBudget(undefined, 2000)
    expect(resolved.budget).toBe(8000)
    expect(resolved.tier).toBe('micro')
  })

  it('prefers explicit tier over maxTokens', () => {
    expect(resolveContextPackBudget('full', 100).budget).toBe(CONTEXT_PACK_TIER_BUDGETS.full)
  })
})

describe('recommendContextPackTier', () => {
  it('recommends micro for small packs', () => {
    expect(recommendContextPackTier(4000)).toBe('micro')
  })

  it('recommends full for large packs', () => {
    expect(recommendContextPackTier(90_000)).toBe('full')
  })
})
