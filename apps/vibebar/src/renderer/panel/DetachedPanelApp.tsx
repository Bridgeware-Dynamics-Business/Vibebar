import { useCallback, useEffect, useState } from 'react'
import type { DetachablePanelId } from '@shared/tools.js'
import type { ProjectProfile } from '@shared/types.js'
import { ClipboardFallbackModal } from '../shared/ClipboardFallbackModal'
import { useFillToggle } from '../shared/ui'
import { ContextPackerPanel } from '../overlay/panels/ContextPackerPanel'
import { PromptLibraryPanel } from '../overlay/panels/PromptLibraryPanel'
import { SecurityAuditPanel } from '../overlay/panels/SecurityAuditPanel'
import { SettingsPanel } from '../overlay/panels/SettingsPanel'

const PANEL_TITLES: Record<DetachablePanelId, string> = {
  'prompt-library': 'Prompt Library',
  'security-audit': 'Security Audit',
  'context-packer': 'Context Packer',
  settings: 'Settings'
}

/**
 * Hosts a single panel as a standalone, floating window (the "detached menu"). Reuses the inline
 * panels verbatim, but the header's close button hides this window back into the toolbar rather
 * than collapsing an inline panel. Which panel renders is chosen by the `panel` query param the
 * controller sets when creating the window.
 */
export function DetachedPanelApp({ panelId }: { panelId: DetachablePanelId }): JSX.Element {
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [solid, toggleSolid] = useFillToggle(`detached.${panelId}.solid`)
  const [fallback, setFallback] = useState<{ open: boolean; text: string }>({
    open: false,
    text: ''
  })

  useEffect(() => {
    document.title = `${PANEL_TITLES[panelId]} — VibeBar`
    void window.vibebar.project.get().then(setProfile)
    const offProject = window.vibebar.project.onChanged(setProfile)
    return offProject
  }, [panelId])

  const onCopyOutcome = useCallback((copied: boolean, text: string) => {
    if (!copied) setFallback({ open: true, text })
  }, [])

  // The window's close button hides it back into the toolbar (toggle off).
  const hide = useCallback(() => {
    void window.vibebar.panel.detach(panelId)
  }, [panelId])

  const shellClass = solid
    ? 'bg-vibe-bg/95 backdrop-blur-xl backdrop-saturate-150'
    : 'bg-vibe-bg/55 backdrop-blur-xl backdrop-saturate-150'

  function renderPanel(): JSX.Element {
    switch (panelId) {
      case 'security-audit':
        return (
          <SecurityAuditPanel
            onClose={hide}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'context-packer':
        return (
          <ContextPackerPanel
            profile={profile}
            onClose={hide}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'settings':
        return <SettingsPanel onClose={hide} solid={solid} onToggleSolid={toggleSolid} />
      case 'prompt-library':
      default:
        return (
          <PromptLibraryPanel
            profile={profile}
            onClose={hide}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
    }
  }

  return (
    <div className="relative flex h-screen w-screen flex-col p-2 text-vibe-text">
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-vibe-border shadow-2xl shadow-black/50 ring-1 ring-white/5 ${shellClass}`}
      >
        {renderPanel()}
      </div>

      <ClipboardFallbackModal
        open={fallback.open}
        text={fallback.text}
        onClose={() => setFallback({ open: false, text: '' })}
      />
    </div>
  )
}
