import { describe, expect, it, vi } from 'vitest'
import { AcpClient } from './AcpClient.js'

type HandlerMocks = {
  onTextDelta: ReturnType<typeof vi.fn>
  onToolActivity: ReturnType<typeof vi.fn>
  onPermission: ReturnType<typeof vi.fn>
  onAskQuestion: ReturnType<typeof vi.fn>
  onRunComplete: ReturnType<typeof vi.fn>
  onError: ReturnType<typeof vi.fn>
  onLog: ReturnType<typeof vi.fn>
}

function createClient(): { client: AcpClient; handlers: HandlerMocks } {
  const handlers: HandlerMocks = {
    onTextDelta: vi.fn(),
    onToolActivity: vi.fn(),
    onPermission: vi.fn(),
    onAskQuestion: vi.fn(),
    onRunComplete: vi.fn(),
    onError: vi.fn(),
    onLog: vi.fn()
  }
  const client = new AcpClient(handlers)
  ;(client as unknown as { child: { stdin: { destroyed: boolean; write: () => void }; killed: boolean } }).child = {
    stdin: { destroyed: false, write: vi.fn() },
    killed: false
  }
  return { client, handlers }
}

/** Test helper — exercises private NDJSON line handler without spawning a child process. */
function handleLine(client: AcpClient, line: string): void {
  ;(client as unknown as { handleLine: (l: string) => void }).handleLine(line)
}

describe('AcpClient line framing', () => {
  it('resolves pending requests by numeric id', async () => {
    const { client } = createClient()
    const pending = (
      client as unknown as { request: (m: string, p?: unknown) => Promise<unknown> }
    ).request.bind(client)
    const promise = pending('session/new', { cwd: '/tmp' })
    handleLine(client, JSON.stringify({ jsonrpc: '2.0', id: 1, result: { sessionId: 'abc' } }))
    await expect(promise).resolves.toEqual({ sessionId: 'abc' })
  })

  it('rejects pending requests on JSON-RPC error', async () => {
    const { client } = createClient()
    const pending = (
      client as unknown as { request: (m: string, p?: unknown) => Promise<unknown> }
    ).request.bind(client)
    const promise = pending('authenticate', {})
    handleLine(
      client,
      JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Not logged in' } })
    )
    await expect(promise).rejects.toThrow('Not logged in')
  })

  it('streams agent_message_chunk updates as text deltas', () => {
    const { client, handlers } = createClient()
    handleLine(
      client,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello' }
          }
        }
      })
    )
    expect(handlers.onTextDelta).toHaveBeenCalledWith('Hello')
  })

  it('maps tool_call updates to tool activity', () => {
    const { client, handlers } = createClient()
    handleLine(
      client,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCall: { id: 't1', name: 'read', title: 'Read file', status: 'running' }
          }
        }
      })
    )
    expect(handlers.onToolActivity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', label: 'Read file', status: 'running' })
    )
  })

  it('fires onRunComplete for run_completed session updates', () => {
    const { client, handlers } = createClient()
    handleLine(
      client,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'run_completed' } }
      })
    )
    expect(handlers.onRunComplete).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed lines and forwards them to onLog', () => {
    const { client, handlers } = createClient()
    handleLine(client, 'not-json')
    expect(handlers.onLog).toHaveBeenCalledWith('not-json')
  })

  it('maps session/request_permission options from ACP optionId/name fields', () => {
    const { client, handlers } = createClient()
    handleLine(
      client,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'session/request_permission',
        params: {
          toolCall: { title: 'Run shell command' },
          options: [
            { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }
          ]
        }
      })
    )
    expect(handlers.onPermission).toHaveBeenCalledWith({
      rpcId: 5,
      title: 'Run shell command',
      detail: 'Run shell command',
      options: [
        { id: 'allow-once', label: 'Allow once' },
        { id: 'reject-once', label: 'Reject' }
      ]
    })
  })

  it('responds to permission clicks with selected optionId over JSON-RPC', () => {
    const { client, handlers } = createClient()
    const write = vi.fn()
    ;(
      client as unknown as { child: { stdin: { destroyed: boolean; write: typeof write }; killed: boolean } }
    ).child = {
      stdin: { destroyed: false, write },
      killed: false
    }
    handleLine(
      client,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'perm-1',
        method: 'session/request_permission',
        params: {
          options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }]
        }
      })
    )
    expect(handlers.onPermission).toHaveBeenCalledWith(
      expect.objectContaining({ rpcId: 'perm-1', options: [{ id: 'allow-once', label: 'Allow once' }] })
    )
    client.respond('perm-1', { outcome: { outcome: 'selected', optionId: 'allow-once' } })
    expect(write).toHaveBeenCalledWith(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 'perm-1',
        result: { outcome: { outcome: 'selected', optionId: 'allow-once' } }
      })}\n`
    )
  })
})
