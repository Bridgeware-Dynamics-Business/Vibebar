export type ToolId =
  | 'prompt-library'
  | 'terminal'
  | 'security-audit'
  | 'code-sync'
  | 'context-packer'
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
  { id: 'prompt-library', label: 'Prompt Library', icon: 'Sparkles', kind: 'panel' },
  { id: 'terminal', label: 'Smart Terminal', icon: 'SquareTerminal', kind: 'window' },
  { id: 'security-audit', label: 'Security Audit', icon: 'ScanSearch', kind: 'panel' },
  { id: 'code-sync', label: 'Code Sync', icon: 'FolderSync', kind: 'window' },
  { id: 'context-packer', label: 'Context Packer', icon: 'PackageOpen', kind: 'panel' },
  { id: 'github', label: 'Open in GitHub Desktop', icon: 'Github', kind: 'action', pinnedEnd: true },
  { id: 'settings', label: 'Settings', icon: 'Settings', kind: 'panel', pinnedEnd: true }
]

export const PANEL_TOOL_IDS = TOOL_DEFS.filter((t) => t.kind === 'panel').map((t) => t.id)
