/** Context pack size tiers for MVC bundles and Context Packer. */
export type ContextPackTier = 'micro' | 'standard' | 'full'

export const CONTEXT_PACK_TIER_BUDGETS: Record<ContextPackTier, number> = {
  micro: 8_000,
  standard: 32_000,
  full: 100_000
}

/** Default tier when callers omit an explicit choice. */
export const DEFAULT_CONTEXT_PACK_TIER: ContextPackTier = 'standard'

/** Resolves char budget from tier, optional legacy maxTokens (×4), or standard default. */
export function resolveContextPackBudget(
  tier?: ContextPackTier | null,
  maxTokens?: number
): { tier: ContextPackTier; budget: number } {
  if (tier && tier in CONTEXT_PACK_TIER_BUDGETS) {
    return { tier, budget: CONTEXT_PACK_TIER_BUDGETS[tier] }
  }
  if (maxTokens != null && Number.isFinite(maxTokens) && maxTokens > 0) {
    const budget = Math.min(Math.max(1, Math.floor(maxTokens * 4)), CONTEXT_PACK_TIER_BUDGETS.full)
    const resolved: ContextPackTier =
      budget <= CONTEXT_PACK_TIER_BUDGETS.micro
        ? 'micro'
        : budget <= CONTEXT_PACK_TIER_BUDGETS.standard
          ? 'standard'
          : 'full'
    return { tier: resolved, budget }
  }
  return { tier: DEFAULT_CONTEXT_PACK_TIER, budget: CONTEXT_PACK_TIER_BUDGETS.standard }
}

/** Recommends a tier from estimated pack size (chars). */
export function recommendContextPackTier(charCount: number): ContextPackTier {
  if (charCount <= CONTEXT_PACK_TIER_BUDGETS.micro) return 'micro'
  if (charCount <= CONTEXT_PACK_TIER_BUDGETS.standard) return 'standard'
  return 'full'
}
