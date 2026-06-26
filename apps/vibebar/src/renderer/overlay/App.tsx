import { AnimatePresence, motion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type { DetachablePanelId, ToolId } from '@shared/tools.js'
import { isDetachablePanel, isDetachablePanelId } from '@shared/tools.js'
import { inlinePanelDimensions, orientationForDock } from '@shared/overlayMetrics.js'
import type { AgentCompanionState } from '@shared/agentCompanionApi.js'
import type {
  GitStatus,
  McpServerStatus,
  OverlayLayout,
  ProjectProfile,
  QuickLaunchApp,
  RecentProject
} from '@shared/types.js'
import { ClipboardFallbackModal } from '../shared/ClipboardFallbackModal'
import { CopyHandoffToast, useCopyHandoff } from '../shared/copyHandoff'
import { useFillToggle } from '../shared/ui'
import { buildPaletteActions, CommandPalette } from './CommandPalette'
import { OnboardingWizard, useOnboarding } from './OnboardingWizard'
import { Toolbar } from './Toolbar'
import { ContextPackerPanel } from './panels/ContextPackerPanel'
import { CursorAgentPanel } from './panels/CursorAgentPanel'
import { NotesPanel } from './panels/NotesPanel'
import { PromptLibraryPanel } from './panels/PromptLibraryPanel'
import { SessionHubPanel } from './panels/SessionHubPanel'
import { SecurityAuditPanel } from './panels/SecurityAuditPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { ReadyCheckPanel } from './panels/ReadyCheckPanel'
import { AgentCompanionDrawer } from './drawers/AgentCompanionDrawer'

const DEFAULT_LAYOUT: OverlayLayout = { dock: 'left', orientation: 'vertical' }

export function App(): JSX.Element {
  const [layout, setLayout] = useState<OverlayLayout>(DEFAULT_LAYOUT)
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [quickLaunchApps, setQuickLaunchApps] = useState<QuickLaunchApp[]>([])
  const [sessionPinCount, setSessionPinCount] = useState(0)
  const [intentEditorOpen, setIntentEditorOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<DetachablePanelId | null>(null)
  const [agentCompanion, setAgentCompanion] = useState<AgentCompanionState | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [solid, toggleSolid] = useFillToggle('overlay.solid')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const terminalOpenRef = useRef(false)
  const auditDirectedRef = useRef(false)
  const activePanelRef = useRef<DetachablePanelId | null>(null)
  const {
    onCopyOutcome,
    handoffNotice,
    dismissHandoff,
    fallback,
    closeFallback
  } = useCopyHandoff()
  const { onboarding, dismiss: dismissOnboarding, refresh: refreshOnboarding, replay: replayOnboarding } = useOnboarding()

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false)
  }, [])

  const onCommandPaletteClosed = useCallback(() => {
    void window.vibebar.overlay.setCommandPalette(false)
  }, [])

  const openCommandPalette = useCallback(async () => {
    await window.vibebar.overlay.setCommandPalette(true)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    setCommandPaletteOpen(true)
  }, [])

  const refreshRecents = useCallback(() => {
    void window.vibebar.project.listRecents().then(setRecentProjects)
  }, [])

  useEffect(() => {
    // Sync renderer with main: collapse any stale expanded shell from a prior session.
    void window.vibebar.overlay.collapsePanel()
    void window.vibebar.overlay.setPanel(false)
    void window.vibebar.overlay.getState().then((state) => {
      setLayout(state.layout)
      setProfile(state.profile)
    })
    refreshRecents()
    void window.vibebar.git.getStatus().then(setGitStatus)
    void window.vibebar.mcp.getStatus().then(setMcpStatus)
    void window.vibebar.quickLaunch.list().then(setQuickLaunchApps)
    void window.vibebar.session.getState().then((s) => setSessionPinCount(s.pinnedCount))
    void window.vibebar.terminal.isOpen().then(({ open }) => {
      terminalOpenRef.current = open
    })
    void window.vibebar.agentCompanion.getState().then(setAgentCompanion)
    const offAgent = window.vibebar.agentCompanion.onState(setAgentCompanion)
    const offLayout = window.vibebar.overlay.onLayout(setLayout)
    const offProject = window.vibebar.project.onChanged((p) => {
      setProfile(p)
      refreshRecents()
      refreshOnboarding()
    })
    const offGit = window.vibebar.git.onStatusChanged(setGitStatus)
    const offMcp = window.vibebar.mcp.onChanged(setMcpStatus)
    const offQuickLaunch = window.vibebar.quickLaunch.onChanged(setQuickLaunchApps)
    const offSession = window.vibebar.session.onChanged((s) => setSessionPinCount(s.pinnedCount))
    const offPalette = window.vibebar.overlay.onCommandPalette(({ open }) => {
      if (open) void openCommandPalette()
      else setCommandPaletteOpen(false)
    })
    const offTerminal = window.vibebar.terminal.onVisibility(({ visible }) => {
      terminalOpenRef.current = visible
      if (visible) {
        if (activePanelRef.current === 'security-audit') {
          auditDirectedRef.current = true
          setActivePanel(null)
          void window.vibebar.audit.scan()
        }
      } else if (auditDirectedRef.current) {
        auditDirectedRef.current = false
        setActivePanel('security-audit')
      }
    })
    return () => {
      offLayout()
      offProject()
      offGit()
      offMcp()
      offQuickLaunch()
      offSession()
      offPalette()
      offTerminal()
      offAgent()
    }
  }, [openCommandPalette, refreshOnboarding, refreshRecents])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  const closePanel = useCallback(() => {
    setActivePanel(null)
  }, [])

  useEffect(() => {
    activePanelRef.current = activePanel
  }, [activePanel])

  const toggleAgentCompanion = useCallback(() => {
    if (activePanel === 'agent-companion') {
      closePanel()
      return
    }
    setActivePanel('agent-companion')
  }, [activePanel, closePanel])

  const handleSelectProject = useCallback(async () => {
    setProfile(await window.vibebar.project.select())
    refreshRecents()
    refreshOnboarding()
  }, [refreshRecents, refreshOnboarding])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      setProfile(await window.vibebar.project.openRecent(path))
      refreshRecents()
      refreshOnboarding()
    },
    [refreshRecents, refreshOnboarding]
  )

  const handleAddContextFolder = useCallback(async () => {
    setProfile(await window.vibebar.project.addContextFolder())
  }, [])

  const handleOpenContextFolder = useCallback(async () => {
    const result = await window.vibebar.project.openContextFolder()
    if (!result.ok && result.error) showNotice(result.error)
  }, [showNotice])

  const handleQuickLaunch = useCallback(
    async (id: string) => {
      const result = await window.vibebar.quickLaunch.run(id, {
        pasteAfterOpen: id === 'cursor'
      })
      if (!result.ok && result.error) {
        showNotice(result.error)
        return
      }
      if (result.pasteNotice) showNotice(result.pasteNotice)
    },
    [showNotice]
  )

  const handleOpenCursorFromCopy = useCallback(async () => {
    const result = await window.vibebar.quickLaunch.run('cursor', {
      pasteAfterOpen: true,
      fromCopyToast: true
    })
    if (!result.ok && result.error) {
      showNotice(result.error)
      return
    }
    if (result.pasteNotice) showNotice(result.pasteNotice)
  }, [showNotice])

  const handlePrepareCursor = useCallback(async () => {
    const result = await window.vibebar.quickLaunch.prepareCursor()
    if (result.noProject) {
      showNotice('Select a project first.')
      return
    }
    if (!result.ok && result.error) {
      showNotice(result.error)
      return
    }
    if (result.text) {
      onCopyOutcome(true, result.text, 0)
    }
    if (result.pasteNotice) showNotice(result.pasteNotice)
    else if (result.ok) showNotice('Cursor bootstrap copied — opening Cursor.')
  }, [onCopyOutcome, showNotice])

  const handleCopyGitDiff = useCallback(async () => {
    const result = await window.vibebar.git.copyDiffPrompt()
    if (result.noProject) {
      showNotice('Select a project first.')
      return
    }
    if (result.notRepo) {
      showNotice('This folder is not a git repository.')
      return
    }
    if (result.noChanges) {
      showNotice('No changes to copy.')
      return
    }
    if (result.gitError && !result.copied) {
      showNotice(`Git error: ${result.gitError}`)
      return
    }
    if (result.untrackedOnly && result.untrackedCount) {
      showNotice(
        `${result.untrackedCount} untracked file(s) — diff copied with file list. Use Pack changed for full contents.`
      )
    } else if (result.gitError) {
      showNotice(`Git warning: ${result.gitError}`)
    }
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }, [onCopyOutcome, showNotice])

  const handlePackChanged = useCallback(async () => {
    const preview = await window.vibebar.packer.previewChanged()
    if (preview.noProject) {
      showNotice('Select a project first.')
      return
    }
    if (preview.noFiles || preview.paths.length === 0) {
      showNotice('No changed files to pack.')
      return
    }
    const result = await window.vibebar.packer.packChanged()
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }, [onCopyOutcome, showNotice])

  const handleCopySessionHandoff = useCallback(async () => {
    const state = await window.vibebar.session.getState()
    if (state.noProject) {
      showNotice('Select a project first.')
      return
    }
    if (state.entries.length === 0) {
      showNotice('Copy a prompt or diff first — Session Hub tracks clipboard exports.')
      return
    }
    const pinRecent =
      state.pinnedCount === 0 && state.entries.length > 0 ? 3 : undefined
    const result = await window.vibebar.session.copyHandoff(true, pinRecent)
    onCopyOutcome(result.copied, result.text, result.findings.length)
  }, [onCopyOutcome, showNotice])

  const handleTool = useCallback(
    (id: ToolId) => {
      if (id === 'code-sync') {
        void window.vibebar.codesync.toggle()
        return
      }
      if (id === 'terminal') {
        void window.vibebar.terminal.toggle()
        return
      }
      if (id === 'github') {
        void window.vibebar.github.open().then((result) => {
          if (!result.ok && result.error) showNotice(result.error)
        })
        return
      }
      if (id === 'snip') {
        void window.vibebar.snip.start().then((result) => {
          if (!result.ok && result.error) showNotice(result.error)
        })
        return
      }
      if (id === 'security-audit' && terminalOpenRef.current) {
        auditDirectedRef.current = true
        if (activePanel === 'security-audit') closePanel()
        void window.vibebar.audit.scan()
        return
      }
      if (activePanel === id) {
        closePanel()
        return
      }
      if (!isDetachablePanel(id)) return
      setActivePanel(id)
    },
    [activePanel, closePanel, showNotice]
  )

  const handleSetCurrentTask = useCallback(() => {
    setIntentEditorOpen(true)
    setActivePanel('session-hub')
  }, [])

  const paletteActions = useMemo(
    () =>
      buildPaletteActions({
        onTool: handleTool,
        onSelectProject: () => void handleSelectProject(),
        onCopyGitDiff: () => void handleCopyGitDiff(),
        onPackChanged: () => void handlePackChanged(),
        onCopySessionHandoff: () => void handleCopySessionHandoff(),
        onViewAiDocs: () => handleTool('session-hub'),
        onAuditConfig: () => handleTool('security-audit'),
        onSnip: () => handleTool('snip'),
        onSetCurrentTask: handleSetCurrentTask,
        onPrepareCursor: () => void handlePrepareCursor(),
        onToggleAgentDrawer: () => toggleAgentCompanion(),
        recents: recentProjects,
        onOpenRecent: (path) => void handleOpenRecent(path)
      }),
    [
      handleTool,
      handleSelectProject,
      handleCopyGitDiff,
      handlePackChanged,
      handleCopySessionHandoff,
      handleSetCurrentTask,
      handlePrepareCursor,
      toggleAgentCompanion,
      recentProjects,
      handleOpenRecent
    ]
  )

  const detachPanel = useCallback(
    (id: DetachablePanelId) => {
      closePanel()
      void window.vibebar.panel.detach(id)
    },
    [closePanel]
  )

  const detachAgentCompanion = useCallback(() => {
    closePanel()
    void window.vibebar.panel.detach('agent-companion')
  }, [closePanel])

  const isVertical = layout.dock !== 'top'
  const toolbarOrientation = orientationForDock(layout.dock)
  const toolbarOrderClass = layout.dock === 'right' ? 'order-2' : 'order-1'
  const panelOrderClass = layout.dock === 'right' ? 'order-1' : 'order-2'

  const panelTransformOrigin =
    layout.dock === 'right' ? 'right center' : layout.dock === 'top' ? 'center top' : 'left center'
  const panelEnterOffset =
    layout.dock === 'right'
      ? { x: 10, y: 0 }
      : layout.dock === 'top'
        ? { x: 0, y: -10 }
        : { x: -10, y: 0 }

  const agentDrawerOpen = activePanel === 'agent-companion'

  function renderPanel(): JSX.Element | null {
    if (activePanel === 'agent-companion') {
      if (!agentCompanion) return null
      return (
        <AgentCompanionDrawer
          state={agentCompanion}
          onClose={closePanel}
          onDetach={detachAgentCompanion}
          solid={solid}
          onToggleSolid={toggleSolid}
        />
      )
    }
    switch (activePanel) {
      case 'prompt-library':
        return (
          <PromptLibraryPanel
            profile={profile}
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('prompt-library')}
          />
        )
      case 'context-packer':
        return (
          <ContextPackerPanel
            profile={profile}
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            onPackChanged={() => void handlePackChanged()}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('context-packer')}
          />
        )
      case 'ready-check':
        return (
          <ReadyCheckPanel
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            onOpenAudit={() => handleTool('security-audit')}
            onOpenTerminal={() => handleTool('terminal')}
            onCopyGitDiff={() => void handleCopyGitDiff()}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('ready-check')}
          />
        )
      case 'security-audit':
        return (
          <SecurityAuditPanel
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('security-audit')}
          />
        )
      case 'session-hub':
        return (
          <SessionHubPanel
            profile={profile}
            gitStatus={gitStatus}
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            onPackChanged={() => void handlePackChanged()}
            onPrepareCursor={() => void handlePrepareCursor()}
            onCopyGitDiff={() => void handleCopyGitDiff()}
            onOpenTerminal={() => handleTool('terminal')}
            onOpenPromptLibrary={() => handleTool('prompt-library')}
            intentEditorOpen={intentEditorOpen}
            onIntentEditorConsumed={() => setIntentEditorOpen(false)}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('session-hub')}
          />
        )
      case 'notes':
        return (
          <NotesPanel
            profile={profile}
            onClose={closePanel}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('notes')}
          />
        )
      case 'cursor-agent':
        return (
          <CursorAgentPanel
            profile={profile}
            onClose={closePanel}
            onPrepareCursor={() => void handlePrepareCursor()}
            onOpenAgentCompanion={toggleAgentCompanion}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('cursor-agent')}
          />
        )
      case 'settings':
        return (
          <SettingsPanel
            onClose={closePanel}
            onShowOnboardingAgain={replayOnboarding}
            onOpenCursorAgent={() => handleTool('cursor-agent')}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={() => detachPanel('settings')}
          />
        )
      default:
        return null
    }
  }

  const panelShellStyle: CSSProperties = useMemo(() => {
    if (!isDetachablePanelId(activePanel)) return {}
    const size = inlinePanelDimensions(activePanel)
    return isVertical
      ? {
          width: size.width,
          minWidth: size.width,
          height: size.height,
          minHeight: size.height,
          maxHeight: size.height
        }
      : { height: size.height, minHeight: size.height, width: '100%' }
  }, [activePanel, isVertical])

  /** Reserve flex space before main resizes the overlay window — keeps the toolbar from reflowing. */
  const clusterReserveStyle: CSSProperties = useMemo(() => {
    if (!isDetachablePanelId(activePanel)) return {}
    const size = inlinePanelDimensions(activePanel)
    const gap = 8
    return isVertical
      ? { minWidth: 64 + gap + size.width }
      : { minHeight: 64 + gap + size.height }
  }, [activePanel, isVertical])

  /** Main already positions the tight overlay window at anchor — cluster stays flush in-window. */
  const toolbarClusterStyle: CSSProperties = useMemo(() => {
    const transition = 'top 220ms cubic-bezier(0.4, 0, 0.2, 1), left 220ms cubic-bezier(0.4, 0, 0.2, 1), right 220ms cubic-bezier(0.4, 0, 0.2, 1)'
    if (layout.dock === 'top') {
      return { top: 0, left: 0, transition }
    }
    if (layout.dock === 'right') {
      return { top: 0, right: 0, transition }
    }
    return { top: 0, left: 0, transition }
  }, [layout.dock])

  /** Tell main it is safe to resize after React paints the new dock orientation. */
  useEffect(() => {
    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) void window.vibebar.overlay.layoutReady()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [layout.dock, layout.orientation, layout.anchorOffset])

  /**
   * Panel state → main immediately; bounds resize only after one paint (layoutReady).
   * Fire-and-forget setPanel so IPC does not block the post-paint ack.
   */
  useLayoutEffect(() => {
    if (!activePanel) return
    void window.vibebar.overlay.setPanel(true, activePanel)
    let cancelled = false
    const id = requestAnimationFrame(() => {
      if (!cancelled && activePanelRef.current === activePanel) {
        void window.vibebar.overlay.layoutReady()
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [activePanel])

  const clusterClass = `absolute flex gap-2 ${isVertical ? 'flex-row items-start' : 'flex-col items-stretch'}`

  return (
    <div className="fixed inset-0">
      <div
        className={clusterClass}
        style={{ ...toolbarClusterStyle, ...clusterReserveStyle }}
        onPointerDown={() => void window.vibebar.overlay.setActive()}
      >
        <div
          className={`${toolbarOrderClass} shrink-0 ${isVertical ? 'h-fit w-16' : 'h-16 w-fit'}`}
        >
          <Toolbar
          orientation={toolbarOrientation}
          dock={layout.dock}
          profile={profile}
          recentProjects={recentProjects}
          activePanel={activePanel}
          gitStatus={gitStatus}
          mcpStatus={mcpStatus}
          quickLaunchApps={quickLaunchApps}
          onSelectProject={() => void handleSelectProject()}
          onOpenRecent={(path) => void handleOpenRecent(path)}
          onAddContextFolder={() => void handleAddContextFolder()}
          onOpenContextFolder={() => void handleOpenContextFolder()}
          onTool={handleTool}
          onQuickLaunch={(id) => void handleQuickLaunch(id)}
          agentDrawerOpen={agentDrawerOpen}
          onToggleAgentDrawer={toggleAgentCompanion}
          sessionPinCount={sessionPinCount}
          onPower={() => void window.vibebar.app.confirmQuit()}
        />
        </div>

        <AnimatePresence
          mode="wait"
          onExitComplete={() => {
            if (!activePanelRef.current) void window.vibebar.overlay.setPanel(false)
          }}
        >
          {activePanel && (
            <motion.div
              key={activePanel}
              initial={{ opacity: 0, x: panelEnterOffset.x, y: panelEnterOffset.y }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: panelEnterOffset.x, y: panelEnterOffset.y }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: panelTransformOrigin, ...panelShellStyle }}
              className={`${panelOrderClass} vibe-glass ${solid ? 'is-solid' : ''} flex min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl`}
            >
              {renderPanel()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={closeCommandPalette}
        onClosed={onCommandPaletteClosed}
        actions={paletteActions}
      />

      <OnboardingWizard
        open={Boolean(onboarding?.show)}
        onClose={dismissOnboarding}
        onProjectSelected={() => {
          refreshRecents()
          refreshOnboarding()
        }}
        onOpenSessionHub={() => handleTool('session-hub')}
        quickLaunchApps={quickLaunchApps}
      />

      <ClipboardFallbackModal
        open={fallback.open}
        text={fallback.text}
        onClose={closeFallback}
      />

      <CopyHandoffToast
        notice={handoffNotice}
        onDismiss={dismissHandoff}
        onOpenCursor={() => void handleOpenCursorFromCopy()}
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="vibe-glass vibe-no-drag pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-xl px-3 py-2 text-xs text-vibe-text shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
