import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Express, Request, Response } from 'express'
import type { McpServerStatus } from '@shared/types.js'
import type { AuditService } from '../audit/AuditService.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import type { GitStatusService } from '../git/GitStatusService.js'
import type { ProjectService } from '../project/ProjectService.js'
import type { ReadyCheckService } from '../readyCheck/ReadyCheckService.js'
import type { SessionService } from '../session/SessionService.js'
import type { AppStore } from '../settings/store.js'
import { MCP_HOST, MCP_PORT, mcpConnectionSnippet } from './constants.js'
import {
  buildAuditSummaryResource,
  buildGitStatusResource,
  buildProjectProfileResource,
  buildReadyCheckSummaryResource,
  buildSessionPinsResource
} from './resources.js'
import { registerVibebarTools } from './tools.js'

export interface McpServiceDeps {
  projects: ProjectService
  session: SessionService
  audit: AuditService
  readyCheck: ReadyCheckService
  gitDiff: GitDiffService
  gitStatus: GitStatusService
  store: AppStore
}

/**
 * Optional localhost MCP server so Cursor Agent can read VibeBar state without clipboard paste.
 * Streamable HTTP on 127.0.0.1 only; read-only resources + pack_changed tool.
 */
export class McpServerController {
  private httpServer: Server | null = null
  private readonly transports: Record<string, StreamableHTTPServerTransport> = {}
  private running = false
  private lastError: string | null = null

  constructor(private readonly deps: McpServiceDeps) {}

  getStatus(): McpServerStatus {
    const enabled = this.deps.store.getSettings().mcpServerEnabled ?? false
    return {
      enabled,
      running: this.running,
      port: MCP_PORT,
      host: MCP_HOST,
      connectionSnippet: mcpConnectionSnippet(MCP_PORT),
      error: this.lastError
    }
  }

  async syncFromSettings(): Promise<McpServerStatus> {
    const enabled = this.deps.store.getSettings().mcpServerEnabled ?? false
    if (enabled) await this.start()
    else await this.stop()
    return this.getStatus()
  }

  async start(): Promise<void> {
    if (this.running) return

    try {
      this.lastError = null
      const app = createMcpExpressApp({ host: MCP_HOST })
      this.mountMcpRoutes(app)

      await new Promise<void>((resolve, reject) => {
        const server = app.listen(MCP_PORT, MCP_HOST, () => resolve())
        server.on('error', reject)
        this.httpServer = server
      })

      this.running = true
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.running = false
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    for (const transport of Object.values(this.transports)) {
      try {
        await transport.close()
      } catch {
        /* ignore */
      }
    }
    for (const key of Object.keys(this.transports)) {
      delete this.transports[key]
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve())
      })
      this.httpServer = null
    }

    this.running = false
  }

  private mountMcpRoutes(app: Express): void {
    const postHandler = async (req: Request, res: Response): Promise<void> => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      let transport = sessionId ? this.transports[sessionId] : undefined

      if (!transport && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            this.transports[id] = transport!
          }
        })
        transport.onclose = () => {
          const sid = transport?.sessionId
          if (sid) delete this.transports[sid]
        }
        const server = this.createServer()
        await server.connect(transport)
      } else if (!transport) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: invalid or missing session' },
          id: null
        })
        return
      }

      await transport.handleRequest(req, res, req.body)
    }

    const getHandler = async (req: Request, res: Response): Promise<void> => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      const transport = sessionId ? this.transports[sessionId] : undefined
      if (!transport) {
        res.status(400).send('Invalid or missing session ID')
        return
      }
      await transport.handleRequest(req, res)
    }

    app.post('/mcp', (req, res) => {
      void postHandler(req, res)
    })
    app.get('/mcp', (req, res) => {
      void getHandler(req, res)
    })
  }

  private createServer(): McpServer {
    const server = new McpServer(
      { name: 'vibebar', version: '1.0.0' },
      {
        instructions:
          'Read-only VibeBar project context for Cursor Agent. Use resources for session pins, audit posture, git status, and Ready Check. Call pack_changed to fetch an MVC context bundle for changed files.'
      }
    )

    server.registerResource(
      'session-pins',
      'vibebar://session/pins',
      {
        title: 'Session pins',
        description: 'Pinned Session Hub entries and a formatted handoff excerpt.',
        mimeType: 'application/json'
      },
      async () => {
        const profile = this.deps.projects.getProfile()
        const state = await this.deps.session.getState()
        const handoff = await this.deps.session.buildHandoffPrompt(false)
        const payload = buildSessionPinsResource({
          projectName: profile?.folderName ?? null,
          pinned: state.entries.filter((e) => e.pinned),
          handoffExcerpt: handoff.text.slice(0, 12_000)
        })
        return {
          contents: [
            {
              uri: 'vibebar://session/pins',
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      }
    )

    server.registerResource(
      'project-profile',
      'vibebar://project/profile',
      {
        title: 'Project profile',
        description: 'Stack detection / ProjectProfile for the active VibeBar project.',
        mimeType: 'application/json'
      },
      async () => {
        const payload = buildProjectProfileResource(this.deps.projects.getProfile())
        return {
          contents: [
            {
              uri: 'vibebar://project/profile',
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      }
    )

    server.registerResource(
      'audit-summary',
      'vibebar://audit/summary',
      {
        title: 'Audit summary',
        description: 'Cached security audit score, severity counts, and truncation flag.',
        mimeType: 'application/json'
      },
      async () => {
        const payload = buildAuditSummaryResource({
          report: this.deps.audit.getCachedReport()
        })
        return {
          contents: [
            {
              uri: 'vibebar://audit/summary',
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      }
    )

    server.registerResource(
      'git-status',
      'vibebar://git/status',
      {
        title: 'Git status',
        description: 'Branch, change count, and changed file paths for the active repo.',
        mimeType: 'application/json'
      },
      async () => {
        const status = this.deps.gitStatus.getStatus()
        const changedPaths = await this.deps.gitDiff.changedFiles()
        const payload = buildGitStatusResource({ status, changedPaths })
        return {
          contents: [
            {
              uri: 'vibebar://git/status',
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      }
    )

    server.registerResource(
      'ready-check-summary',
      'vibebar://ready-check/summary',
      {
        title: 'Ready Check summary',
        description: 'Ready Check v2 tri-state and key signals.',
        mimeType: 'application/json'
      },
      async () => {
        const result = await this.deps.readyCheck.evaluate()
        const payload = buildReadyCheckSummaryResource(result)
        return {
          contents: [
            {
              uri: 'vibebar://ready-check/summary',
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      }
    )

    registerVibebarTools(server, this.deps)
    return server
  }
}
