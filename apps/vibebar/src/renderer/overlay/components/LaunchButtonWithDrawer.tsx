import { motion } from 'framer-motion'
import { Icon } from '../../shared/icons'

/**
 * Cursor quick-launch control with an attached chat tab that toggles the Agent Companion drawer.
 * Main circle launches Cursor; the tab opens chat without adding toolbar buttons.
 */
export function LaunchButtonWithDrawer({
  label,
  drawerOpen,
  onLaunch,
  onToggleDrawer
}: {
  label: string
  drawerOpen: boolean
  onLaunch: () => void
  onToggleDrawer: () => void
}): JSX.Element {
  return (
    <div className="relative flex shrink-0 flex-col items-center">
      <motion.button
        type="button"
        title={label}
        aria-label={label}
        onClick={onLaunch}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="vibe-no-drag relative flex h-11 w-11 items-center justify-center rounded-full border border-vibe-accent-2/50 bg-vibe-accent-2/12 text-vibe-accent-2 shadow-[0_0_10px_-2px_var(--color-vibe-accent-2)] hover:border-vibe-accent-2 hover:bg-vibe-accent-2/20 hover:text-white"
      >
        <Icon name="MousePointer2" size={19} />
      </motion.button>
      <motion.button
        type="button"
        title={drawerOpen ? 'Hide Agent Companion' : 'Open Agent Companion chat'}
        aria-label={drawerOpen ? 'Hide Agent Companion' : 'Open Agent Companion chat'}
        aria-pressed={drawerOpen}
        onClick={(e) => {
          e.stopPropagation()
          onToggleDrawer()
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={`vibe-no-drag absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow ring-2 ring-vibe-bg ${
          drawerOpen
            ? 'border-vibe-accent bg-vibe-accent/30 text-white'
            : 'border-white/20 bg-vibe-bg/90 text-vibe-muted hover:border-vibe-accent-2 hover:text-vibe-accent-2'
        }`}
      >
        <Icon name="MessageSquare" size={11} />
      </motion.button>
    </div>
  )
}
