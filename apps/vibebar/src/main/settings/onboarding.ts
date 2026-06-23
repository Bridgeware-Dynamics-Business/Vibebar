import type { OnboardingState } from '@shared/types.js'

/** Pure helper mirroring onboarding visibility logic in IPC. */
export function computeOnboardingState(
  hasProject: boolean,
  onboardingComplete: boolean
): OnboardingState {
  return {
    show: !hasProject && !onboardingComplete,
    complete: onboardingComplete
  }
}
