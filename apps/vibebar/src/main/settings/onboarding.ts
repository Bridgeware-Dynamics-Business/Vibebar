import type { OnboardingState } from '@shared/types.js'

/** Pure helper mirroring onboarding visibility logic in IPC. */
export function computeOnboardingState(
  hasProject: boolean,
  onboardingComplete: boolean,
  replayRequested = false
): OnboardingState {
  return {
    show: replayRequested || (!hasProject && !onboardingComplete),
    complete: onboardingComplete
  }
}
