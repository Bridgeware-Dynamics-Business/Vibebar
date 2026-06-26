export type ToolId =
  | 'prompt-library'
  | 'terminal'
  | 'security-audit'
  | 'session-hub'
  | 'code-sync'
  | 'context-packer'
  | 'notes'
  | 'snip'
  | 'ready-check'
  | 'github'
  | 'settings'

/** `action` tools fire a one-shot side effect (no panel, no toggled window). */
export type ToolKind = 'panel' | 'window' | 'action'

export interface ToolDef {
  id: ToolId
  label: string
  /** lucide-react icon name, resolved in the renderer. */
  icon: string
  kind: ToolKind
  /** Pinned tools render at the far end of the toolbar (after a divider). */
  pinnedEnd?: boolean
}

/**
 * Ordered tool catalog rendered as circular buttons. Adding a tool is a one-line change
 * here plus a handler; the toolbar and registry both read from this list.
 */
export const TOOL_DEFS: ToolDef[] = [
  { id: 'prompt-library', label: 'Prompt Library', icon: 'Library', kind: 'panel' },
  { id: 'terminal', label: 'Smart Terminal', icon: 'SquareTerminal', kind: 'window' },
  { id: 'security-audit', label: 'Security Audit', icon: 'ScanSearch', kind: 'panel' },
  { id: 'session-hub', label: 'Session Hub', icon: 'Sparkles', kind: 'panel' },
  { id: 'code-sync', label: 'Code Sync', icon: 'FolderSync', kind: 'window' },
  { id: 'context-packer', label: 'Context Packer', icon: 'PackageOpen', kind: 'panel' },
  { id: 'ready-check', label: 'Ready Check', icon: 'ShieldCheck', kind: 'panel' },
  { id: 'notes', label: 'Notes', icon: 'StickyNote', kind: 'panel' },
  { id: 'snip', label: 'Snip to AI Context', icon: 'Crop', kind: 'action' },
  { id: 'github', label: 'Open in GitHub Desktop', icon: 'Github', kind: 'action', pinnedEnd: true },
  { id: 'settings', label: 'Settings', icon: 'Settings', kind: 'panel', pinnedEnd: true }
]

export const PANEL_TOOL_IDS = TOOL_DEFS.filter((t) => t.kind === 'panel').map((t) => t.id)

/**
 * Panels that can be "detached" into their own floating, always-on-top window (mirroring the
 * Prompt Library). Every `panel` tool is detachable, so the detach affordance is consistent
 * across the toolbar. Kept as an explicit tuple so it can also seed a Zod enum in the main
 * process without a runtime `as const` cast on a filtered array.
 */
export const DETACHABLE_PANEL_IDS = [
  'prompt-library',
  'security-audit',
  'session-hub',
  'context-packer',
  'ready-check',
  'notes',
  'settings'
] as const

export type DetachablePanelId = (typeof DETACHABLE_PANEL_IDS)[number]

export function isDetachablePanel(id: ToolId): id is DetachablePanelId {
  return (DETACHABLE_PANEL_IDS as readonly string[]).includes(id)
}
