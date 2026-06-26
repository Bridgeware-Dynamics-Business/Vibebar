import type { DetachablePanelId } from './tools.js'
import { TOOL_DEFS } from './tools.js'
import type { DockSide } from './types.js'

/** Pixel height/width of the toolbar strip (must match Tailwind w-16 / h-16). */
export const TOOLBAR_THICKNESS = 64

/** Per-button slot including gap (h-11 + gap-2). */
const SLOT_PX = 52

/** Padding (p-2.5), power-button reserve, divider slack. */
const CHROME_PX = 70

/**
 * Long-axis size for the collapsed toolbar window. Sized to actual button count — no flex spacer.
 */
export function collapsedToolbarLength(quickLaunchCount = 2): number {
  const mainCount = TOOL_DEFS.filter((t) => !t.pinnedEnd).length
  const pinnedCount = TOOL_DEFS.filter((t) => t.pinnedEnd).length
  // project + context folder + main tools + divider + pinned + quick-launch slots
  const slots = 1 + 1 + mainCount + 1 + pinnedCount + quickLaunchCount
  return slots * SLOT_PX + CHROME_PX
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
