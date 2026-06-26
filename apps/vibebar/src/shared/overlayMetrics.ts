import type { DetachablePanelId } from './tools.js'
import { TOOL_DEFS } from './tools.js'
import type { DockSide } from './types.js'

/** Pixel height/width of the toolbar strip (must match Tailwind w-16 / h-16). */
export const TOOLBAR_THICKNESS = 64

/** Circle buttons (h-11 / w-11). */
export const TOOLBAR_BUTTON_PX = 44

/** Tailwind gap-2 between flex children. */
export const TOOLBAR_GAP_PX = 8

/** Tailwind p-2.5 — horizontal padding per side. */
export const TOOLBAR_PADDING_SIDE = 10

/** Empty strip reserved for the absolute power button (must match Toolbar POWER_RESERVE). */
export const POWER_BUTTON_RESERVE = 42

/** Extra slack for hover rings, badges, and display scaling. */
export const TOOLBAR_LENGTH_SLACK = 80

export interface ToolbarLayoutInput {
  quickLaunchCount: number
  hasProject: boolean
}

/** Counts flex children exactly like Toolbar.tsx (buttons, dividers, power reserve). */
export function toolbarFlexMetrics(input: ToolbarLayoutInput): {
  buttonCount: number
  dividerCount: number
  flexItems: number
} {
  const mainCount = TOOL_DEFS.filter((t) => !t.pinnedEnd).length
  const pinnedCount = TOOL_DEFS.filter((t) => t.pinnedEnd).length
  const buttonCount =
    1 + (input.hasProject ? 1 : 0) + mainCount + pinnedCount + input.quickLaunchCount
  const dividerCount = 2 + (input.quickLaunchCount > 0 ? 2 : 0)
  const flexItems = buttonCount + dividerCount + 1
  return { buttonCount, dividerCount, flexItems }
}

/**
 * Long-axis window size for the collapsed toolbar. Mirrors the Toolbar flex row/column layout.
 */
export function collapsedToolbarLength(input: ToolbarLayoutInput | number, hasProject = false): number {
  const normalized: ToolbarLayoutInput =
    typeof input === 'number' ? { quickLaunchCount: input, hasProject } : input
  const { buttonCount, dividerCount, flexItems } = toolbarFlexMetrics(normalized)
  const gapTotal = Math.max(0, flexItems - 1) * TOOLBAR_GAP_PX

  return (
    TOOLBAR_PADDING_SIDE * 2 +
    buttonCount * TOOLBAR_BUTTON_PX +
    dividerCount +
    gapTotal +
    POWER_BUTTON_RESERVE +
    TOOLBAR_LENGTH_SLACK
  )
}

/** Probe dimensions for edge detection — use target dock shape, not stale window bounds. */
export function toolbarProbeSize(
  dock: DockSide,
  barLength: number
): { width: number; height: number } {
  return dock === 'top'
    ? { width: barLength, height: TOOLBAR_THICKNESS }
    : { width: TOOLBAR_THICKNESS, height: barLength }
}

/** Orientation is fully determined by dock — never rely on a separately cached value in the renderer. */
export function orientationForDock(dock: DockSide): 'vertical' | 'horizontal' {
  return dock === 'top' ? 'horizontal' : 'vertical'
}

/** Default window size for each panel — shared by detached pop-outs and in-toolbar menus. */
export const PANEL_SIZES: Record<DetachablePanelId, { width: number; height: number }> = {
  'prompt-library': { width: 460, height: 720 },
  'security-audit': { width: 520, height: 720 },
  'session-hub': { width: 480, height: 720 },
  'context-packer': { width: 460, height: 680 },
  'ready-check': { width: 480, height: 640 },
  notes: { width: 460, height: 720 },
  'cursor-agent': { width: 420, height: 680 },
  settings: { width: 440, height: 640 }
}

export function inlinePanelDimensions(panelId: DetachablePanelId): { width: number; height: number } {
  return PANEL_SIZES[panelId]
}

/** Inward expansion on the overlay window when a panel is open (width for side dock, height for top). */
export function panelInwardExtent(panelId: DetachablePanelId, dock: DockSide): number {
  const size = PANEL_SIZES[panelId]
  return dock === 'top' ? size.height : size.width
}
