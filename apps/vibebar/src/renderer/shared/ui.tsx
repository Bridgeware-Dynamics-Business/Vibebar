import { motion } from 'framer-motion'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Icon } from './icons'

/**
 * Persisted Fill (solid vs. glass) preference for a window's chrome. Defaults to solid
 * so working surfaces stay readable; the choice survives restarts via localStorage.
 */
export function useFillToggle(storageKey: string): [boolean, () => void] {
  const [solid, setSolid] = useState<boolean>(
    () => window.localStorage.getItem(storageKey) !== 'false'
  )
  useEffect(() => {
    window.localStorage.setItem(storageKey, String(solid))
  }, [storageKey, solid])
  const toggle = useCallback(() => setSolid((v) => !v), [])
  return [solid, toggle]
}

export function Chip({
  active,
  onClick,
  children
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`vibe-no-drag rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-vibe-accent text-white'
          : 'bg-white/5 text-vibe-muted hover:bg-white/10 hover:text-vibe-text'
      }`}
    >
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`vibe-no-drag relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-vibe-accent' : 'bg-white/15'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/**
 * Fill toggle shared by every menu/window chrome: a checkbox that turns the surface
 * solid (opaque, easiest to read) when checked and translucent "glass" when unchecked —
 * matching the Code Sync behavior. Sits next to the close (X) button.
 */
export function FillToggle({
  solid,
  onToggle
}: {
  solid: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={solid}
      title={solid ? 'Solid background — click for glass' : 'Glass background — click for solid'}
      className="vibe-no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
          solid ? 'border-vibe-accent bg-vibe-accent text-white' : 'border-vibe-border'
        }`}
      >
        {solid && <Icon name="Check" size={10} />}
      </span>
      Fill
    </button>
  )
}

/**
 * Detach affordance shared by every detachable panel header: pops the panel out into its own
 * floating, always-on-top window. Sits just before the Fill toggle so the chrome reads the same
 * across the whole toolbar.
 */
export function DetachButton({
  onDetach,
  label
}: {
  onDetach: () => void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onDetach}
      title="Detach into a floating window"
      aria-label={label}
      className="vibe-no-drag rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
    >
      <Icon name="ExternalLink" size={16} />
    </button>
  )
}

export function PanelHeader({
  title,
  onClose,
  solid,
  onToggleSolid,
  children
}: {
  title: string
  onClose?: () => void
  solid?: boolean
  onToggleSolid?: () => void
  children?: ReactNode
}): JSX.Element {
  return (
    <div className="vibe-drag flex items-center justify-between gap-2 border-b border-vibe-border px-4 py-3">
      <h2 className="text-sm font-semibold tracking-wide text-vibe-text">{title}</h2>
      <div className="vibe-no-drag flex items-center gap-1">
        {children}
        {onToggleSolid && <FillToggle solid={solid ?? true} onToggle={onToggleSolid} />}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="X" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
