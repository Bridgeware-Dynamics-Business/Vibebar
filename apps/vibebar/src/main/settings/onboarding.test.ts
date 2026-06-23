import { describe, expect, it } from 'vitest'
import { computeOnboardingState } from './onboarding.js'

describe('computeOnboardingState', () => {
  it('shows wizard when no project and not complete', () => {
    expect(computeOnboardingState(false, false)).toEqual({ show: true, complete: false })
  })

  it('hides wizard when project is selected', () => {
    expect(computeOnboardingState(true, false)).toEqual({ show: false, complete: false })
  })

  it('hides wizard when onboarding was dismissed', () => {
    expect(computeOnboardingState(false, true)).toEqual({ show: false, complete: true })
  })
})
