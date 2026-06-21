import { useCallback, useEffect, useState } from 'react'
import type { ProjectProfile } from '@shared/types.js'
import { ClipboardFallbackModal } from '../shared/ClipboardFallbackModal'
import { useFillToggle } from '../shared/ui'
import { PromptLibraryPanel } from '../overlay/panels/PromptLibraryPanel'

/**
 * Hosts the Prompt Library as a standalone, floating window (the "detached menu"). Reuses the
 * inline PromptLibraryPanel, but the header's close button hides this window back into the
 * toolbar rather than collapsing an inline panel.
 */
export function PromptLibraryWindowApp(): JSX.Element {
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [solid, toggleSolid] = useFillToggle('promptlibrary.solid')
  const [fallback, setFallback] = useState<{ open: boolean; text: string }>({
    open: false,
    text: ''
  })

  useEffect(() => {
    void window.vibebar.project.get().then(setProfile)
    const offProject = window.vibebar.project.onChanged(setProfile)
    return offProject
  }, [])

  const onCopyOutcome = useCallback((copied: boolean, text: string) => {
    if (!copied) setFallback({ open: true, text })
  }, [])

  const shellClass = solid
    ? 'bg-vibe-bg/95 backdrop-blur-xl backdrop-saturate-150'
    : 'bg-vibe-bg/55 backdrop-blur-xl backdrop-saturate-150'

  return (
    <div className="relative flex h-screen w-screen flex-col p-2 text-vibe-text">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-vibe-border shadow-2xl shadow-black/50 ring-1 ring-white/5 ${shellClass}`}
      >
        <PromptLibraryPanel
          profile={profile}
          onClose={() => void window.vibebar.promptLibrary.toggle()}
          onCopyOutcome={onCopyOutcome}
          solid={solid}
          onToggleSolid={toggleSolid}
        />
      </div>

      <ClipboardFallbackModal
        open={fallback.open}
        text={fallback.text}
        onClose={() => setFallback({ open: false, text: '' })}
      />
    </div>
  )
}
