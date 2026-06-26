import { useCallback, useEffect, useState } from 'react'
import type { DetachablePanelId } from '@shared/tools.js'
import type { GitStatus, ProjectProfile } from '@shared/types.js'
import { ClipboardFallbackModal } from '../shared/ClipboardFallbackModal'
import { CopyHandoffToast, useCopyHandoff } from '../shared/copyHandoff'
import { useFillToggle } from '../shared/ui'
import { ContextPackerPanel } from '../overlay/panels/ContextPackerPanel'
import { CursorAgentPanel } from '../overlay/panels/CursorAgentPanel'
import { NotesPanel } from '../overlay/panels/NotesPanel'
import { PromptLibraryPanel } from '../overlay/panels/PromptLibraryPanel'
import { SecurityAuditPanel } from '../overlay/panels/SecurityAuditPanel'
import { SessionHubPanel } from '../overlay/panels/SessionHubPanel'
import { SettingsPanel } from '../overlay/panels/SettingsPanel'
import { ReadyCheckPanel } from '../overlay/panels/ReadyCheckPanel'
import { AgentCompanionDrawer } from '../overlay/drawers/AgentCompanionDrawer'
import type { AgentCompanionState } from '@shared/agentCompanionApi.js'

const PANEL_TITLES: Record<DetachablePanelId, string> = {
  'prompt-library': 'Prompt Library',
  'security-audit': 'Security Audit',
  'session-hub': 'Session Hub',
  'context-packer': 'Context Packer',
  'ready-check': 'Ready Check',
  notes: 'Notes',
  'cursor-agent': 'Cursor Agent',
  'agent-companion': 'Agent Companion',
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
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [solid, toggleSolid] = useFillToggle(`detached.${panelId}.solid`)
  const {
    onCopyOutcome,
    handoffNotice,
    dismissHandoff,
    fallback,
    closeFallback
  } = useCopyHandoff()

  useEffect(() => {
    document.title = `${PANEL_TITLES[panelId]} — VibeBar`
    void window.vibebar.project.get().then(setProfile)
    void window.vibebar.git.getStatus().then(setGitStatus)
    const offProject = window.vibebar.project.onChanged(setProfile)
    const offGit = window.vibebar.git.onStatusChanged(setGitStatus)
    return () => {
      offProject()
      offGit()
    }
  }, [panelId])

  const hide = useCallback(() => {
    void window.vibebar.panel.detach(panelId)
  }, [panelId])

  const handleCopyGitDiff = useCallback(async () => {
    const result = await window.vibebar.git.copyDiffPrompt()
    if (result.copied) onCopyOutcome(result.copied, result.text, result.findings.length)
  }, [onCopyOutcome])

  const handlePackChanged = useCallback(async () => {
    const preview = await window.vibebar.packer.previewChanged()
    if (preview.noProject || preview.noFiles || preview.paths.length === 0) return
    const result = await window.vibebar.packer.packChanged()
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }, [onCopyOutcome])

  const handlePrepareCursor = useCallback(async () => {
    const result = await window.vibebar.quickLaunch.prepareCursor()
    if (result.text) onCopyOutcome(true, result.text, 0)
  }, [onCopyOutcome])

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
      case 'session-hub':
        return (
          <SessionHubPanel
            profile={profile}
            gitStatus={gitStatus}
            onClose={hide}
            onCopyOutcome={onCopyOutcome}
            onPackChanged={() => void handlePackChanged()}
            onCopyGitDiff={() => void handleCopyGitDiff()}
            onOpenTerminal={() => void window.vibebar.terminal.toggle()}
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
            onPackChanged={() => void handlePackChanged()}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'ready-check':
        return (
          <ReadyCheckPanel
            onClose={hide}
            onCopyOutcome={onCopyOutcome}
            onOpenAudit={() => void window.vibebar.panel.detach('security-audit')}
            onOpenTerminal={() => void window.vibebar.terminal.toggle()}
            onCopyGitDiff={() => void handleCopyGitDiff()}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'notes':
        return (
          <NotesPanel
            profile={profile}
            onClose={hide}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'cursor-agent':
        return (
          <CursorAgentPanel
            profile={profile}
            onClose={hide}
            onPrepareCursor={() => void handlePrepareCursor()}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'agent-companion':
        return (
          <AgentCompanionDetachedHost
            solid={solid}
            onToggleSolid={toggleSolid}
            onClose={hide}
          />
        )
      case 'settings':
        return (
          <SettingsPanel
            onClose={hide}
            onOpenCursorAgent={() => void window.vibebar.panel.detach('cursor-agent')}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
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
    <div className={`relative flex h-full w-full flex-col ${shellClass}`}>
      {renderPanel()}
      <ClipboardFallbackModal open={fallback.open} text={fallback.text} onClose={closeFallback} />
      <CopyHandoffToast
        notice={handoffNotice}
        onDismiss={dismissHandoff}
        onOpenCursor={() => void window.vibebar.quickLaunch.run('cursor')}
      />
    </div>
  )
}

function AgentCompanionDetachedHost({
  solid,
  onToggleSolid,
  onClose
}: {
  solid: boolean
  onToggleSolid: () => void
  onClose: () => void
}): JSX.Element {
  const [state, setState] = useState<AgentCompanionState | null>(null)

  useEffect(() => {
    void window.vibebar.agentCompanion.getState().then(setState)
    return window.vibebar.agentCompanion.onState(setState)
  }, [])

  if (!state) {
    return <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
  }

  return (
    <AgentCompanionDrawer
      state={state}
      onClose={onClose}
      solid={solid}
      onToggleSolid={onToggleSolid}
      detached
    />
  )
}
