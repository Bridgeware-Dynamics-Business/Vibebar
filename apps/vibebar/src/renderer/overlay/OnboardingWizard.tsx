import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import type { OnboardingState, QuickLaunchApp } from '@shared/types.js'
import { Icon } from '../shared/icons'

const STEPS = ['welcome', 'project', 'cursor', 'context', 'session'] as const
type Step = (typeof STEPS)[number]

export function OnboardingWizard({
  open,
  onClose,
  onProjectSelected,
  onOpenSessionHub,
  quickLaunchApps
}: {
  open: boolean
  onClose: () => void
  onProjectSelected: () => void
  onOpenSessionHub?: () => void
  quickLaunchApps: QuickLaunchApp[]
}): JSX.Element | null {
  const [step, setStep] = useState<Step>('welcome')
  const cursorApp = quickLaunchApps.find((a) => a.id === 'cursor')

  useEffect(() => {
    if (open) setStep('welcome')
  }, [open])

  const skip = useCallback(async () => {
    await window.vibebar.app.completeOnboarding()
    onClose()
  }, [onClose])

  const finish = useCallback(async () => {
    await window.vibebar.app.completeOnboarding()
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="vibe-no-drag fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="vibe-glass is-solid w-full max-w-md rounded-2xl border border-vibe-border p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-vibe-text">Welcome to VibeBar</h2>
              <p className="mt-0.5 text-xs text-vibe-muted">
                Step {STEPS.indexOf(step) + 1} of {STEPS.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void skip()}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
            >
              Skip
            </button>
          </div>

          {step === 'welcome' && (
            <div className="space-y-3">
              <ul className="space-y-2 text-sm text-vibe-text">
                <li className="flex gap-2">
                  <Icon name="Sparkles" size={16} className="mt-0.5 shrink-0 text-vibe-accent-2" />
                  Bridge intent → context → handoff to your AI assistant
                </li>
                <li className="flex gap-2">
                  <Icon name="PackageOpen" size={16} className="mt-0.5 shrink-0 text-vibe-accent-2" />
                  Pack git changes, run audits, and verify in the Smart Terminal
                </li>
                <li className="flex gap-2">
                  <Icon name="Pin" size={16} className="mt-0.5 shrink-0 text-vibe-accent-2" />
                  Pin session items and copy one structured handoff bundle
                </li>
              </ul>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void skip()}
                  className="rounded-lg px-3 py-1.5 text-xs text-vibe-muted hover:text-vibe-text"
                >
                  Don&apos;t show again
                </button>
                <button
                  type="button"
                  onClick={() => setStep('project')}
                  className="rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white"
                >
                  Get started
                </button>
              </div>
            </div>
          )}

          {step === 'project' && (
            <div className="space-y-3">
              <p className="text-sm text-vibe-muted">
                Select the folder you code in. VibeBar uses it for prompts, git diff, audits, and
                session tracking.
              </p>
              <button
                type="button"
                onClick={async () => {
                  await window.vibebar.project.select()
                  onProjectSelected()
                  setStep('cursor')
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-vibe-accent bg-vibe-accent/15 px-3 py-2.5 text-sm font-medium text-vibe-text hover:bg-vibe-accent/25"
              >
                <Icon name="FolderOpen" size={16} />
                Choose project folder…
              </button>
              <div className="flex justify-between pt-1">
                <button type="button" onClick={() => setStep('welcome')} className="text-xs text-vibe-muted hover:text-vibe-text">
                  Back
                </button>
                <button type="button" onClick={() => setStep('cursor')} className="text-xs text-vibe-muted hover:text-vibe-text">
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 'cursor' && (
            <div className="space-y-3">
              <p className="text-sm text-vibe-muted">
                Quick Launch opens Cursor on your project. Optional — locate Cursor if it wasn&apos;t
                auto-detected.
              </p>
              <div className="rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-sm text-vibe-text">
                {cursorApp?.path ? (
                  <span className="flex items-center gap-2 text-emerald-300">
                    <Icon name="Check" size={14} />
                    Cursor found
                  </span>
                ) : (
                  <span className="text-vibe-muted">Cursor path not set yet</span>
                )}
              </div>
              {!cursorApp?.path && (
                <button
                  type="button"
                  onClick={() => void window.vibebar.quickLaunch.locate('cursor')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-vibe-text hover:bg-white/15"
                >
                  <Icon name="MousePointer2" size={16} />
                  Locate Cursor…
                </button>
              )}
              <div className="flex justify-between pt-1">
                <button type="button" onClick={() => setStep('project')} className="text-xs text-vibe-muted hover:text-vibe-text">
                  Back
                </button>
                <button type="button" onClick={() => setStep('context')} className="rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white">
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'context' && (
            <div className="space-y-3">
              <p className="text-sm text-vibe-muted">
                An AI Context folder gives assistants a place to read project docs and saved
                screenshots. Optional but recommended.
              </p>
              <button
                type="button"
                onClick={() => void window.vibebar.project.addContextFolder()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-vibe-text hover:bg-white/15"
              >
                <Icon name="FolderPlus" size={16} />
                Create AI Context folder
              </button>
              <div className="flex justify-between pt-1">
                <button type="button" onClick={() => setStep('cursor')} className="text-xs text-vibe-muted hover:text-vibe-text">
                  Back
                </button>
                <button type="button" onClick={() => setStep('session')} className="rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-medium text-white">
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'session' && (
            <div className="space-y-3">
              <p className="text-sm text-vibe-muted">
                Try the vibe loop: copy something from VibeBar, then open{' '}
                <strong className="font-medium text-vibe-text">Session Hub</strong> (Sparkles icon)
                to see it logged. Pin what matters, then use{' '}
                <strong className="font-medium text-vibe-text">Copy handoff</strong> for a structured
                bundle in Cursor.
              </p>
              {onOpenSessionHub && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSessionHub()
                    void finish()
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-vibe-accent bg-vibe-accent/15 px-3 py-2 text-sm font-medium text-vibe-text hover:bg-vibe-accent/25"
                >
                  <Icon name="Sparkles" size={16} />
                  Open Session Hub now
                </button>
              )}
              <button
                type="button"
                onClick={() => void finish()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-vibe-accent px-3 py-2.5 text-sm font-medium text-white"
              >
                <Icon name="Check" size={16} />
                Got it — start vibing
              </button>
              <div className="flex justify-start pt-1">
                <button type="button" onClick={() => setStep('context')} className="text-xs text-vibe-muted hover:text-vibe-text">
                  Back
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/** Loads onboarding state once on mount. */
export function useOnboarding(): {
  onboarding: OnboardingState | null
  dismiss: () => void
  refresh: () => void
  replay: () => void
} {
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)

  const refresh = useCallback(() => {
    void window.vibebar.app
      .getOnboardingState()
      .then(setOnboarding)
      .catch(() => setOnboarding({ show: false, complete: true }))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const dismiss = useCallback(() => {
    setOnboarding((prev) => (prev ? { ...prev, show: false, complete: true } : prev))
  }, [])

  const replay = useCallback(() => {
    void window.vibebar.app.showOnboardingAgain().then(setOnboarding)
  }, [])

  return { onboarding, dismiss, refresh, replay }
}
