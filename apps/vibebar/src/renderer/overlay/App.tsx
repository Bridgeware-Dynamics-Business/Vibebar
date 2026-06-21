import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToolId } from '@shared/tools.js'
import type { GitStatus, OverlayLayout, ProjectProfile } from '@shared/types.js'
import { ClipboardFallbackModal } from '../shared/ClipboardFallbackModal'
import { useFillToggle } from '../shared/ui'
import { Toolbar } from './Toolbar'
import { ContextPackerPanel } from './panels/ContextPackerPanel'
import { PromptLibraryPanel } from './panels/PromptLibraryPanel'
import { SecurityAuditPanel } from './panels/SecurityAuditPanel'
import { SettingsPanel } from './panels/SettingsPanel'

const DEFAULT_LAYOUT: OverlayLayout = { dock: 'left', orientation: 'vertical' }

export function App(): JSX.Element {
  const [layout, setLayout] = useState<OverlayLayout>(DEFAULT_LAYOUT)
  const [profile, setProfile] = useState<ProjectProfile | null>(null)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [activePanel, setActivePanel] = useState<ToolId | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [solid, toggleSolid] = useFillToggle('overlay.solid')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cross-window coordination for the audit: it lives in the side panel, but when the Smart
  // Terminal is open it is directed there instead; closing the terminal brings the panel back.
  const terminalOpenRef = useRef(false)
  const auditDirectedRef = useRef(false)
  const activePanelRef = useRef<ToolId | null>(null)
  const [fallback, setFallback] = useState<{ open: boolean; text: string }>({
    open: false,
    text: ''
  })

  useEffect(() => {
    void window.vibebar.overlay.getState().then((state) => {
      setLayout(state.layout)
      setProfile(state.profile)
    })
    void window.vibebar.git.getStatus().then(setGitStatus)
    void window.vibebar.terminal.isOpen().then(({ open }) => {
      terminalOpenRef.current = open
    })
    const offLayout = window.vibebar.overlay.onLayout(setLayout)
    const offProject = window.vibebar.project.onChanged(setProfile)
    const offGit = window.vibebar.git.onStatusChanged(setGitStatus)
    const offTerminal = window.vibebar.terminal.onVisibility(({ visible }) => {
      terminalOpenRef.current = visible
      if (visible) {
        // The terminal is now the home for the audit. Collapse the side panel to save space and
        // hand the scan off so the terminal's audit dock fills in immediately.
        if (activePanelRef.current === 'security-audit') {
          auditDirectedRef.current = true
          setActivePanel(null)
          void window.vibebar.audit.scan()
        }
      } else if (auditDirectedRef.current) {
        // Terminal closed while it held the audit — bring the side panel back.
        auditDirectedRef.current = false
        setActivePanel('security-audit')
        void window.vibebar.overlay.setPanel(true)
      }
    })
    return () => {
      offLayout()
      offProject()
      offGit()
      offTerminal()
    }
  }, [])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  // Collapse only the React state here; the OS window stays expanded until the panel's exit
  // animation finishes (see AnimatePresence onExitComplete) so the content never gets clipped
  // mid-animation — which is what used to flash a scrollbar.
  const closePanel = useCallback(() => {
    setActivePanel(null)
  }, [])

  useEffect(() => {
    activePanelRef.current = activePanel
  }, [activePanel])

  const handleSelectProject = useCallback(async () => {
    setProfile(await window.vibebar.project.select())
  }, [])

  const handleAddContextFolder = useCallback(async () => {
    setProfile(await window.vibebar.project.addContextFolder())
  }, [])

  const handleOpenContextFolder = useCallback(async () => {
    const result = await window.vibebar.project.openContextFolder()
    if (!result.ok && result.error) showNotice(result.error)
  }, [showNotice])

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
      // When the Smart Terminal is open, the audit lives there: focus it and run a scan rather
      // than opening the (redundant) side panel. Closing the terminal reopens the panel.
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
      setActivePanel(id)
      void window.vibebar.overlay.setPanel(true)
    },
    [activePanel, closePanel, showNotice]
  )

  const onCopyOutcome = useCallback((copied: boolean, text: string) => {
    if (!copied) setFallback({ open: true, text })
  }, [])

  // Pop the Prompt Library out into a floating window (like Code Sync) and collapse the
  // inline panel so the two presentations don't overlap.
  const detachPromptLibrary = useCallback(() => {
    closePanel()
    void window.vibebar.promptLibrary.toggle()
  }, [closePanel])

  const isVertical = layout.orientation === 'vertical'
  const toolbarOrderClass =
    layout.dock === 'right' ? 'order-2' : 'order-1'
  const panelOrderClass = layout.dock === 'right' ? 'order-1' : 'order-2'

  // Anchor the panel's open/close animation to the toolbar edge so it reads as growing out of
  // the bar (rather than popping from its own center), with a small directional slide.
  const panelTransformOrigin =
    layout.dock === 'right' ? 'right center' : layout.dock === 'top' ? 'center top' : 'left center'
  const panelEnterOffset =
    layout.dock === 'right'
      ? { x: 10, y: 0 }
      : layout.dock === 'top'
        ? { x: 0, y: -10 }
        : { x: -10, y: 0 }

  function renderPanel(): JSX.Element | null {
    switch (activePanel) {
      case 'prompt-library':
        return (
          <PromptLibraryPanel
            profile={profile}
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
            onDetach={detachPromptLibrary}
          />
        )
      case 'context-packer':
        return (
          <ContextPackerPanel
            profile={profile}
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'security-audit':
        return (
          <SecurityAuditPanel
            onClose={closePanel}
            onCopyOutcome={onCopyOutcome}
            solid={solid}
            onToggleSolid={toggleSolid}
          />
        )
      case 'settings':
        return <SettingsPanel onClose={closePanel} solid={solid} onToggleSolid={toggleSolid} />
      default:
        return null
    }
  }

  return (
    <div className={`relative flex h-full w-full gap-2 ${isVertical ? 'flex-row' : 'flex-col'}`}>
      <div
        className={`${toolbarOrderClass} ${isVertical ? 'h-full w-16' : 'h-16 w-full'} shrink-0`}
      >
        <Toolbar
          orientation={layout.orientation}
          dock={layout.dock}
          profile={profile}
          activePanel={activePanel}
          gitStatus={gitStatus}
          onSelectProject={() => void handleSelectProject()}
          onAddContextFolder={() => void handleAddContextFolder()}
          onOpenContextFolder={() => void handleOpenContextFolder()}
          onTool={handleTool}
        />
      </div>

      <AnimatePresence
        mode="wait"
        onExitComplete={() => {
          // Only collapse the window once nothing is on screen — if a different panel is now
          // active (a switch, not a close) we keep the window expanded for it.
          if (!activePanelRef.current) void window.vibebar.overlay.setPanel(false)
        }}
      >
        {activePanel && (
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, scale: 0.97, x: panelEnterOffset.x, y: panelEnterOffset.y }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, x: panelEnterOffset.x, y: panelEnterOffset.y }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }}
            style={{ transformOrigin: panelTransformOrigin }}
            className={`${panelOrderClass} vibe-glass ${solid ? 'is-solid' : ''} min-h-0 flex-1 overflow-hidden rounded-2xl`}
          >
            {renderPanel()}
          </motion.div>
        )}
      </AnimatePresence>

      <ClipboardFallbackModal
        open={fallback.open}
        text={fallback.text}
        onClose={() => setFallback({ open: false, text: '' })}
      />

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="vibe-glass vibe-no-drag pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-xl px-3 py-2 text-xs text-vibe-text shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
