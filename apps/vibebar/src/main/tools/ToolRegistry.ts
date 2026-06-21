import { TOOL_DEFS, type ToolDef, type ToolId } from '@shared/tools.js'

/**
 * Read-only registry over the tool catalog. Invocation side effects (opening windows,
 * resizing panels) live in the IPC layer; the registry just answers structural questions
 * so adding a tool stays a single edit to TOOL_DEFS.
 */
export class ToolRegistry {
  private readonly byId: Map<ToolId, ToolDef>

  constructor(defs: ToolDef[] = TOOL_DEFS) {
    this.byId = new Map(defs.map((d) => [d.id, d]))
  }

  list(): ToolDef[] {
    return [...this.byId.values()]
  }

  get(id: ToolId): ToolDef | undefined {
    return this.byId.get(id)
  }

  isWindowTool(id: ToolId): boolean {
    return this.byId.get(id)?.kind === 'window'
  }

  isPanelTool(id: ToolId): boolean {
    return this.byId.get(id)?.kind === 'panel'
  }
}
