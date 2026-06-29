import { AnimatePresence, motion } from 'framer-motion'
import { Fragment, useRef } from 'react'
import { TOOL_DEFS, type DetachablePanelId, type ToolId } from '@shared/tools.js'
import type {
  DockSide,
  GitStatus,
  McpServerStatus,
  Orientation,
  ProjectProfile,
  QuickLaunchApp
} from '@shared/types.js'
import { Icon } from '../shared/icons'
import { LaunchButtonWithDrawer } from './components/LaunchButtonWithDrawer'

interface CircleButtonProps {
  icon: string
  label: string
  active?: boolean
  accent?: boolean
  /** Renders the button in a "done" green state with a check badge (e.g. folder already exists). */
  success?: boolean
  /** When > 0, renders a live count bubble (e.g. uncommitted changes). */
  badge?: number
  /** "launch" gives the quick-launch buttons a distinct cyan-accent treatment so they stand out. */
  tone?: 'default' | 'launch'
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

function CircleButton({
  icon,
  label,
  active,
  accent,
  success,
  badge,
  tone = 'default',
  onClick,
  onContextMenu
}: CircleButtonProps): JSX.Element {
  const stateClass = success
    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
    : active
      ? 'border-vibe-accent bg-vibe-accent/20 text-white'
      : tone === 'launch'
        ? 'border-vibe-accent-2/50 bg-vibe-accent-2/12 text-vibe-accent-2 shadow-[0_0_10px_-2px_var(--color-vibe-accent-2)] hover:border-vibe-accent-2 hover:bg-vibe-accent-2/20 hover:text-white'
        : 'border-white/10 bg-white/5 text-vibe-muted hover:border-white/20 hover:bg-white/10 hover:text-vibe-text'
  return (
    <motion.button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`vibe-no-drag relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${stateClass} ${accent ? 'ring-2 ring-vibe-accent-2/70' : ''}`}
    >
      <Icon name={icon} size={19} />
      {success && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-vibe-bg">
          <Icon name="Check" size={11} />
        </span>
      )}
      <AnimatePresence>
        {badge !== undefined && badge > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-vibe-accent-2 px-1 text-[10px] font-semibold leading-none text-white shadow ring-2 ring-vibe-bg"
          >
            {badge > 99 ? '99+' : badge}
          </motion.span>
        )}
      </AnimatePresence>
      {active && (
        <motion.span
          layoutId="active-indicator"
          className="absolute -inset-px rounded-full ring-2 ring-vibe-accent"
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        />
      )}
    </motion.button>
  )
}

/** Tooltip + green "connected" affordance for the Cursor Agent (MCP) button. */
function cursorAgentButtonInfo(
  status: McpServerStatus | null
): { label: string; success?: boolean } {
  if (!status || !status.enabled) return { label: 'Cursor Agent — MCP disabled' }
  if (status.error) return { label: `Cursor Agent — failed to start: ${status.error}` }
  if (!status.running) return { label: 'Cursor Agent — starting…' }
  const connected =
    status.lastAgentAccessAt != null && Date.now() - status.lastAgentAccessAt < 60_000
  return {
    label: connected ? 'Cursor Agent — connected' : `Cursor Agent — running on ${status.host}:${status.port}`,
    success: connected
  }
}

/** A descriptive tooltip + badge count for the GitHub Desktop button. */
function gitButtonInfo(gitStatus: GitStatus | null): { label: string; badge?: number } {
  if (!gitStatus || !gitStatus.isRepo) return { label: 'Open in GitHub Desktop' }
  const parts: string[] = []
  if (gitStatus.branch) parts.push(gitStatus.branch)
  parts.push(gitStatus.changeCount === 1 ? '1 change' : `${gitStatus.changeCount} changes`)
  if (gitStatus.ahead > 0) parts.push(`${gitStatus.ahead}↑`)
  if (gitStatus.behind > 0) parts.push(`${gitStatus.behind}↓`)
  return { label: `GitHub Desktop — ${parts.join(' · ')}`, badge: gitStatus.changeCount }
}

// Round only the corners on the edge facing away from the monitor; the docked edge stays square
// so the bar reads as flush against the screen border.
const OUTWARD_CORNERS: Record<DockSide, string> = {
  left: 'rounded-r-2xl',
  right: 'rounded-l-2xl',
  top: 'rounded-b-2xl'
}

// Sits just past the Settings button at the bar's far end, centred on the cross-axis so it lines up
// with the Settings button's centre. Centring uses a translate on the wrapper (not the button),
// because framer-motion owns the button's transform for the hover scale.
const POWER_POSITION: Record<DockSide, string> = {
  left: 'bottom-2.5 left-1/2 -translate-x-1/2',
  right: 'bottom-2.5 left-1/2 -translate-x-1/2',
  top: 'right-2.5 top-1/2 -translate-y-1/2'
}

// Empty space reserved at the Settings end of the bar so the power button has its own spot and the
// two never overlap.
const POWER_RESERVE = 42

/** A small, red-tinted circular power button that opens the "Close Vibe Bar" confirmation. */
function PowerButton({ dock, onClick }: { dock: DockSide; onClick: () => void }): JSX.Element {
  return (
    <div className={`absolute z-10 ${POWER_POSITION[dock]}`}>
      <motion.button
        type="button"
        title="Close VibeBar"
        aria-label="Close VibeBar"
        onClick={onClick}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="vibe-no-drag flex h-6 w-6 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-400 shadow transition-colors hover:border-red-500/70 hover:bg-red-500/25 hover:text-red-300"
      >
        <Icon name="Power" size={13} />
      </motion.button>
    </div>
  )
}

function ProjectSwitcher({
  profile,
  onBrowse,
  onShowMenu
}: {
  profile: ProjectProfile | null
  onBrowse: () => void
  onShowMenu: () => void
}): JSX.Element {
  return (
    <CircleButton
      icon="FolderOpen"
      label={
        profile
          ? `Project: ${profile.folderName} (right-click for recent projects)`
          : 'Select a project folder'
      }
      accent={Boolean(profile)}
      onClick={onBrowse}
      onContextMenu={(e) => {
        e.preventDefault()
        onShowMenu()
      }}
    />
  )
}

function useToolbarWindowDrag(): { onDragPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void } {
  const draggingRef = useRef(false)

  const onDragPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.vibe-no-drag')) return
    if (draggingRef.current) return
    draggingRef.current = true
    void window.vibebar.overlay.dragBegin()

    const finish = (ev: PointerEvent): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      void window.vibebar.overlay.dragEnd({ x: ev.screenX, y: ev.screenY })
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  return { onDragPointerDown }
}

export function Toolbar({
  orientation,
  dock,
  profile,
  activePanel,
  gitStatus,
  mcpStatus,
  quickLaunchApps,
  onSelectProject,
  onShowProjectMenu,
  onAddContextFolder,
  onOpenContextFolder,
  onCopyContextFolderPath,
  onTool,
  onQuickLaunch,
  agentDrawerOpen = false,
  onToggleAgentDrawer,
  sessionPinCount = 0,
  onPower
}: {
  orientation: Orientation
  dock: DockSide
  profile: ProjectProfile | null
  activePanel: DetachablePanelId | null
  gitStatus: GitStatus | null
  mcpStatus: McpServerStatus | null
  quickLaunchApps: QuickLaunchApp[]
  onSelectProject: () => void
  onShowProjectMenu: () => void
  onAddContextFolder: () => void
  onOpenContextFolder: () => void
  onCopyContextFolderPath: () => void
  onTool: (id: ToolId) => void
  onQuickLaunch: (id: string) => void
  agentDrawerOpen?: boolean
  onToggleAgentDrawer?: () => void
  /** Pin count for Session Hub toolbar badge. */
  sessionPinCount?: number
  onPower: () => void
}): JSX.Element {
  const isVertical = orientation === 'vertical'
  const visibleQuickLaunch = quickLaunchApps.filter((app) => app.visible !== false)
  const tools = TOOL_DEFS.filter((t) => !t.pinnedEnd)
  const pinned = TOOL_DEFS.filter((t) => t.pinnedEnd)
  const dividerClass = isVertical
    ? 'h-px w-7 shrink-0 bg-vibe-border'
    : 'h-7 w-px shrink-0 bg-vibe-border'
  const { onDragPointerDown } = useToolbarWindowDrag()

  return (
    <div
      className={`vibe-glass is-solid vibe-drag relative flex min-h-0 shrink-0 items-center gap-2 p-2.5 ${OUTWARD_CORNERS[dock]} ${
        isVertical ? 'h-fit w-full flex-col' : 'h-full w-fit flex-row'
      }`}
      onPointerDown={onDragPointerDown}
    >
      <PowerButton dock={dock} onClick={onPower} />
      <ProjectSwitcher
        profile={profile}
        onBrowse={onSelectProject}
        onShowMenu={onShowProjectMenu}
      />
      {profile && (
        <CircleButton
          icon={profile.hasContextFolder ? 'FolderCheck' : 'FolderPlus'}
          label={
            profile.hasContextFolder
              ? 'Open AI context folder in file explorer (right-click to copy path)'
              : 'Add AI context folder (right-click to copy path)'
          }
          success={profile.hasContextFolder}
          onClick={() => {
            if (profile.hasContextFolder) onOpenContextFolder()
            else onAddContextFolder()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            onCopyContextFolderPath()
          }}
        />
      )}
      <div className={dividerClass} />
      {tools.map((tool) => (
        <CircleButton
          key={tool.id}
          icon={tool.icon}
          label={tool.label}
          active={activePanel === tool.id}
          badge={tool.id === 'session-hub' ? sessionPinCount : undefined}
          onClick={() => onTool(tool.id)}
        />
      ))}
      <div className={dividerClass} />
      {pinned.map((tool) => {
        const git = tool.id === 'github' ? gitButtonInfo(gitStatus) : null
        const cursorAgent = tool.id === 'cursor-agent' ? cursorAgentButtonInfo(mcpStatus) : null
        return (
          <Fragment key={tool.id}>
            <CircleButton
              icon={tool.icon}
              label={git?.label ?? cursorAgent?.label ?? tool.label}
              active={activePanel === tool.id}
              badge={git?.badge}
              success={cursorAgent?.success}
              onClick={() => onTool(tool.id)}
            />
            {tool.id === 'github' && visibleQuickLaunch.length > 0 && (
              <>
                <div className={dividerClass} />
                {visibleQuickLaunch.map((app) =>
                  app.id === 'cursor' && onToggleAgentDrawer ? (
                    <LaunchButtonWithDrawer
                      key={app.id}
                      label={
                        app.path
                          ? `Launch ${app.name}${profile ? ` on ${profile.folderName}` : ''}`
                          : `${app.name} — set its path in Settings`
                      }
                      drawerOpen={agentDrawerOpen}
                      onLaunch={() => onQuickLaunch(app.id)}
                      onToggleDrawer={onToggleAgentDrawer}
                    />
                  ) : (
                    <CircleButton
                      key={app.id}
                      icon={app.icon}
                      label={
                        app.path
                          ? `Launch ${app.name}${profile ? ` on ${profile.folderName}` : ''}`
                          : `${app.name} — set its path in Settings`
                      }
                      tone="launch"
                      onClick={() => onQuickLaunch(app.id)}
                    />
                  )
                )}
                <div className={dividerClass} />
              </>
            )}
          </Fragment>
        )
      })}
      <div
        aria-hidden
        className="shrink-0"
        style={isVertical ? { height: POWER_RESERVE } : { width: POWER_RESERVE }}
      />
    </div>
  )
}
