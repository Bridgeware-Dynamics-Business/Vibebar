import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { envWithAgentPath } from './findAgentCli.js'
import type {
  AgentCompanionAskQuestionRequest,
  AgentCompanionMode,
  AgentCompanionPermissionRequest,
  AgentCompanionToolActivity
} from '@shared/agentCompanionApi.js'
import { classifyAgentToolKind } from '@shared/agentCompanionActivity.js'
import { APP_VERSION } from '@shared/appVersion.js'

export interface AcpSessionUpdate {
  sessionUpdate?: string
  content?: { text?: string; type?: string }
  toolCall?: { id?: string; name?: string; title?: string; status?: string; detail?: string }
  [key: string]: unknown
}

export interface AcpClientHandlers {
  onTextDelta: (chunk: string) => void
  onToolActivity: (tool: AgentCompanionToolActivity) => void
  onPermission: (request: AgentCompanionPermissionRequest) => void
  onAskQuestion: (request: AgentCompanionAskQuestionRequest) => void
  onRunComplete: () => void
  onError: (message: string) => void
  onLog: (line: string) => void
}

const CLIENT_INFO = { name: 'vibebar-agent-companion', version: APP_VERSION }
const REQUEST_TIMEOUT_MS = 120_000

const DEFAULT_PERMISSION_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'allow-once', label: 'Allow once' },
  { id: 'allow-always', label: 'Allow always' },
  { id: 'reject-once', label: 'Reject' }
]

function normalizePermissionOptions(raw: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PERMISSION_OPTIONS
  const normalized = raw
    .map((opt, index) => {
      if (!opt || typeof opt !== 'object') return null
      const o = opt as Record<string, unknown>
      const id =
        (typeof o.optionId === 'string' && o.optionId) ||
        (typeof o.id === 'string' && o.id) ||
        (typeof o.option_id === 'string' && o.option_id) ||
        ''
      const label =
        (typeof o.name === 'string' && o.name) ||
        (typeof o.label === 'string' && o.label) ||
        id ||
        `Option ${index + 1}`
      if (!id) return null
      return { id, label }
    })
    .filter((x): x is { id: string; label: string } => x != null)
  return normalized.length > 0 ? normalized : DEFAULT_PERMISSION_OPTIONS
}

/**
 * Thin JSON-RPC client over stdio for `agent acp`. One instance per spawned child process;
 * the controller owns lifecycle and maps ACP events into renderer-friendly state.
 */
export class AcpClient {
  private child: ChildProcess | null = null
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >()
  private rl: ReturnType<typeof createInterface> | null = null

  constructor(private readonly handlers: AcpClientHandlers) {}

  get running(): boolean {
    return Boolean(this.child && !this.child.killed)
  }

  spawn(agentPath: string, cwd: string, model?: string): void {
    this.disposeChild()
    const useShell =
      process.platform === 'win32' &&
      (agentPath.endsWith('.cmd') || agentPath.endsWith('.bat'))
    const args = model ? ['--model', model, 'acp'] : ['acp']
    this.child = spawn(agentPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: useShell,
      env: envWithAgentPath()
    })

    if (this.child.stderr) {
      this.child.stderr.setEncoding('utf8')
      this.child.stderr.on('data', (chunk: string) => {
        const line = chunk.trim()
        if (line) this.handlers.onLog(line)
      })
    }

    if (!this.child.stdout) {
      throw new Error('Agent Companion: ACP process has no stdout.')
    }

    this.rl = createInterface({ input: this.child.stdout })
    this.rl.on('line', (line) => this.handleLine(line))

    this.child.on('error', (err) => {
      this.handlers.onError(err.message)
    })
    this.child.on('exit', (code) => {
      if (code != null && code !== 0) {
        this.handlers.onError(`Agent process exited (${code}).`)
      }
    })
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false
      },
      clientInfo: CLIENT_INFO
    })
  }

  async authenticate(): Promise<void> {
    await this.request('authenticate', { methodId: 'cursor_login' })
  }

  async sessionNew(cwd: string, mode: AgentCompanionMode): Promise<string> {
    const result = (await this.request('session/new', { cwd, mode, mcpServers: [] })) as {
      sessionId?: string
    }
    if (!result.sessionId) throw new Error('ACP session/new did not return a sessionId.')
    return result.sessionId
  }

  async sessionPrompt(sessionId: string, text: string): Promise<void> {
    await this.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text }]
    })
  }

  async sessionCancel(sessionId: string): Promise<void> {
    try {
      await this.request('session/cancel', { sessionId })
    } catch {
      /* cancel is best-effort when the run already finished */
    }
  }

  respond(id: number | string, result: unknown): void {
    this.respondRpc(id, result)
  }

  private respondRpc(id: unknown, result: unknown): void {
    if (typeof id === 'number' || typeof id === 'string') {
      this.write({ jsonrpc: '2.0', id, result })
    }
  }

  private resolvePendingResponse(msg: Record<string, unknown>): boolean {
    if (msg.result == null && msg.error == null) return false
    const rawId = msg.id
    const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : NaN
    if (Number.isNaN(id)) return false
    const waiter = this.pending.get(id)
    if (!waiter) return false
    clearTimeout(waiter.timer)
    this.pending.delete(id)
    if (msg.error) {
      const errObj = msg.error as { message?: string }
      waiter.reject(new Error(errObj.message ?? 'ACP error'))
    } else {
      waiter.resolve(msg.result)
    }
    return true
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    this.write({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`ACP request timed out: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
    })
  }

  private write(payload: Record<string, unknown>): void {
    if (!this.child?.stdin || this.child.stdin.destroyed) {
      throw new Error('Agent Companion: ACP stdin is not available.')
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line) as Record<string, unknown>
    } catch {
      this.handlers.onLog(line)
      return
    }

    if (this.resolvePendingResponse(msg)) return

    const method = msg.method as string | undefined
    if (method === 'session/update') {
      this.handleSessionUpdate((msg.params as { update?: AcpSessionUpdate } | undefined)?.update)
      return
    }
    if (method === 'session/request_permission') {
      this.handlePermission(msg)
      return
    }
    if (method === 'cursor/ask_question') {
      this.handleAskQuestion(msg)
      return
    }
    if (method === 'cursor/create_plan') {
      this.respondRpc(msg.id, { outcome: { outcome: 'accepted' } })
    }
  }

  private handleSessionUpdate(update: AcpSessionUpdate | undefined): void {
    if (!update) return
    const kind = update.sessionUpdate
    if (kind === 'agent_message_chunk') {
      const text = update.content?.text
      if (text) this.handlers.onTextDelta(text)
      return
    }
    if (
      kind === 'tool_call' ||
      kind === 'tool_call_update' ||
      kind === 'tool_started' ||
      kind === 'tool_completed'
    ) {
      const tc = update.toolCall ?? (update as { tool?: AcpSessionUpdate['toolCall'] }).tool
      const name = tc?.name ?? ''
      const label = tc?.title || name || 'Tool'
      const statusRaw = tc?.status
      const status: AgentCompanionToolActivity['status'] =
        statusRaw === 'completed' || statusRaw === 'done' || kind === 'tool_completed'
          ? 'done'
          : statusRaw === 'failed' || statusRaw === 'error'
            ? 'failed'
            : 'running'
      this.handlers.onToolActivity({
        id: tc?.id ?? `${label}-${Date.now()}`,
        label,
        detail: tc?.detail,
        kind: classifyAgentToolKind(label, name, tc?.detail),
        status
      })
    }
    if (kind === 'run_completed' || kind === 'agent_turn_completed') {
      this.handlers.onRunComplete()
    }
  }

  private handlePermission(msg: Record<string, unknown>): void {
    const params = msg.params as {
      title?: string
      description?: string
      toolName?: string
      toolCall?: { title?: string; toolCallId?: string }
      options?: unknown
    }
    const rpcId = msg.id
    if (typeof rpcId !== 'number' && typeof rpcId !== 'string') {
      this.handlers.onLog('session/request_permission missing JSON-RPC id')
      return
    }
    this.handlers.onPermission({
      rpcId,
      title: params.title ?? params.toolCall?.title ?? params.toolName ?? 'Tool approval',
      detail: params.description ?? params.toolCall?.title ?? 'The agent wants to run a tool.',
      options: normalizePermissionOptions(params.options)
    })
  }

  private handleAskQuestion(msg: Record<string, unknown>): void {
    const params = msg.params as Omit<AgentCompanionAskQuestionRequest, 'rpcId'>
    this.handlers.onAskQuestion({
      rpcId: Number(msg.id),
      title: params.title,
      questions: params.questions ?? []
    })
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('ACP client disposed.'))
    }
    this.pending.clear()
    this.disposeChild()
  }

  private disposeChild(): void {
    this.rl?.close()
    this.rl = null
    if (this.child && !this.child.killed) {
      this.child.kill()
    }
    this.child = null
  }
}
