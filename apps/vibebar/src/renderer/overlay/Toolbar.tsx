import { AnimatePresence, motion } from 'framer-motion'
import { TOOL_DEFS, type ToolId } from '@shared/tools.js'
import type { DockSide, GitStatus, Orientation, ProjectProfile } from '@shared/types.js'
import { Icon } from '../shared/icons'

interface CircleButtonProps {
  icon: string
  label: string
  active?: boolean
  accent?: boolean
  /** Renders the button in a "done" green state with a check badge (e.g. folder already exists). */
  success?: boolean
  /** When > 0, renders a live count bubble (e.g. uncommitted changes). */
  badge?: number
  onClick: () => void
}

function CircleButton({
  icon,
  label,
  active,
  accent,
  success,
  badge,
  onClick
}: CircleButtonProps): JSX.Element {
  const stateClass = success
    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
    : active
      ? 'border-vibe-accent bg-vibe-accent/20 text-white'
      : 'border-white/10 bg-white/5 text-vibe-muted hover:border-white/20 hover:bg-white/10 hover:text-vibe-text'
  return (
    <motion.button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`vibe-no-drag relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${stateClass} ${accent ? 'ring-2 ring-vibe-accent-2/70' : ''}`}
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

export function Toolbar({
  orientation,
  dock,
  profile,
  activePanel,
  gitStatus,
  onSelectProject,
  onAddContextFolder,
  onOpenContextFolder,
  onTool
}: {
  orientation: Orientation
  dock: DockSide
  profile: ProjectProfile | null
  activePanel: ToolId | null
  gitStatus: GitStatus | null
  onSelectProject: () => void
  onAddContextFolder: () => void
  onOpenContextFolder: () => void
  onTool: (id: ToolId) => void
}): JSX.Element {
  const isVertical = orientation === 'vertical'
  const tools = TOOL_DEFS.filter((t) => !t.pinnedEnd)
  const pinned = TOOL_DEFS.filter((t) => t.pinnedEnd)

  return (
    <div
      className={`vibe-glass vibe-drag flex h-full w-full items-center gap-2 p-2.5 ${OUTWARD_CORNERS[dock]} ${
        isVertical ? 'flex-col' : 'flex-row'
      }`}
    >
      <CircleButton
        icon="FolderOpen"
        label={profile ? `Project: ${profile.folderName}` : 'Select a project'}
        accent={Boolean(profile)}
        onClick={onSelectProject}
      />
      {profile && (
        <CircleButton
          icon={profile.hasContextFolder ? 'FolderCheck' : 'FolderPlus'}
          label={
            profile.hasContextFolder
              ? 'Open AI context folder in file explorer'
              : 'Add AI context folder'
          }
          success={profile.hasContextFolder}
          onClick={() => {
            if (profile.hasContextFolder) onOpenContextFolder()
            else onAddContextFolder()
          }}
        />
      )}
      <div className={isVertical ? 'h-px w-7 bg-vibe-border' : 'h-7 w-px bg-vibe-border'} />
      {tools.map((tool) => (
        <CircleButton
          key={tool.id}
          icon={tool.icon}
          label={tool.label}
          active={activePanel === tool.id}
          onClick={() => onTool(tool.id)}
        />
      ))}
      <div className="flex-1" />
      {pinned.map((tool) => {
        const git = tool.id === 'github' ? gitButtonInfo(gitStatus) : null
        return (
          <CircleButton
            key={tool.id}
            icon={tool.icon}
            label={git?.label ?? tool.label}
            active={activePanel === tool.id}
            badge={git?.badge}
            onClick={() => onTool(tool.id)}
          />
        )
      })}
    </div>
  )
}
