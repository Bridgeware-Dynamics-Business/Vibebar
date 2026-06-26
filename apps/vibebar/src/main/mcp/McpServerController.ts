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
import type { TerminalController } from '../terminal/TerminalController.js'
import type { AppStore } from '../settings/store.js'
import { buildVerificationRecipe } from '../verify/verificationRecipes.js'
import { buildReadyCheckBrief } from '../readyCheck/readyCheckLogic.js'
import { MCP_HOST, MCP_PORT, mcpConnectionSnippet } from './constants.js'
import {
  buildAuditSummaryResource,
  buildGitStatusResource,
  buildProjectMemoryDiffResource,
  buildProjectProfileResource,
  buildReadyCheckBriefResource,
  buildReadyCheckSummaryResource,
  buildSessionFailuresResource,
  buildSessionFlightLogResource,
  buildSessionIntentResource,
  buildSessionMistakesResource,
  buildSessionPinsResource,
  buildVerifyRecipeResource
} from './resources.js'
import { registerVibebarTools } from './tools.js'
import { APP_VERSION } from '@shared/appVersion.js'

export interface McpServiceDeps {
  projects: ProjectService
  session: SessionService
  audit: AuditService
  readyCheck: ReadyCheckService
  gitDiff: GitDiffService
  gitStatus: GitStatusService
  store: AppStore
  terminal: TerminalController
}

/**
 * Optional localhost MCP server so Cursor Agent can read VibeBar state without clipboard paste.
 * Streamable HTTP on 127.0.0.1 only; read-only resources + agent supervision tools.
 */
export class McpServerController {
  private httpServer: Server | null = null
  private readonly transports: Record<string, StreamableHTTPServerTransport> = {}
  private running = false
  private lastError: string | null = null
  private lastAgentAccessAt: number | null = null
  private onAgentAccess: (() => void) | null = null

  constructor(private readonly deps: McpServiceDeps) {}

  /** Called from registerIpc so Settings can refresh when Agent reads resources/tools. */
  setActivityListener(listener: (() => void) | null): void {
    this.onAgentAccess = listener
  }

  private touchAgentAccess(): void {
    this.lastAgentAccessAt = Date.now()
    this.onAgentAccess?.()
  }

  /** Records MCP tool invocations (resources call touchAgentAccess directly). */
  recordAgentAccess(): void {
    this.touchAgentAccess()
  }

  getStatus(): McpServerStatus {
    const enabled = this.deps.store.getSettings().mcpServerEnabled ?? false
    return {
      enabled,
      running: this.running,
      port: MCP_PORT,
      host: MCP_HOST,
      connectionSnippet: mcpConnectionSnippet(MCP_PORT),
      error: this.lastError,
      lastAgentAccessAt: this.lastAgentAccessAt
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

  private registerJsonResource(
    server: McpServer,
    name: string,
    uri: string,
    title: string,
    description: string,
    build: () => Promise<Record<string, unknown>>
  ): void {
    server.registerResource(
      name,
      uri,
      { title, description, mimeType: 'application/json' },
      async () => {
        this.touchAgentAccess()
        const payload = await build()
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }]
        }
      }
    )
  }

  private createServer(): McpServer {
    const server = new McpServer(
      { name: 'vibebar', version: APP_VERSION },
      {
        instructions:
          'VibeBar Agent Command Center on localhost. Read resources for intent, flight log, failures, Ready Check brief, and verify recipe. Tools: pack_changed, ready_check, get/set_intent, get_last_green, get_context_health, fix_last_terminal_failure, get_regression_context, record_outcome. Session writes only — never edit source files directly.'
      }
    )

    this.registerJsonResource(
      server,
      'session-pins',
      'vibebar://session/pins',
      'Session pins',
      'Pinned Session Hub entries and a formatted handoff excerpt.',
      async () => {
        const profile = this.deps.projects.getProfile()
        const state = await this.deps.session.getState()
        const handoff = await this.deps.session.buildHandoffText(false)
        return buildSessionPinsResource({
          projectName: profile?.folderName ?? null,
          pinned: state.entries.filter((e) => e.pinned),
          handoffExcerpt: handoff.text.slice(0, 12_000)
        })
      }
    )

    this.registerJsonResource(
      server,
      'session-intent',
      'vibebar://session/intent',
      'Session intent',
      'Full IntentContract for the active project session.',
      async () => buildSessionIntentResource(await this.deps.session.getIntent())
    )

    this.registerJsonResource(
      server,
      'session-flight-log',
      'vibebar://session/flight-log',
      'Session flight log',
      'Terminal commands, audit runs, and last-green verify state.',
      async () => {
        const ext = await this.deps.session.readExtended()
        return buildSessionFlightLogResource(ext.flight)
      }
    )

    this.registerJsonResource(
      server,
      'session-failures',
      'vibebar://session/failures',
      'Terminal failure black box',
      'Structured Smart Terminal failures (command, kind, fingerprint, stack).',
      async () => buildSessionFailuresResource(await this.deps.session.getFailures())
    )

    this.registerJsonResource(
      server,
      'session-mistakes',
      'vibebar://session/mistakes',
      'Agent mistake ledger',
      'Session-local agent mistake patterns detected from git snapshots.',
      async () => buildSessionMistakesResource(await this.deps.session.getMistakes())
    )

    this.registerJsonResource(
      server,
      'project-memory-diff',
      'vibebar://project/memory-diff',
      'Project memory diff',
      'Drift between AI docs (AGENTS.md, rules) and live repo signals.',
      async () => buildProjectMemoryDiffResource(await this.deps.projects.getMemoryDiff())
    )

    this.registerJsonResource(
      server,
      'project-profile',
      'vibebar://project/profile',
      'Project profile',
      'Stack detection / ProjectProfile for the active VibeBar project.',
      async () => buildProjectProfileResource(this.deps.projects.getProfile())
    )

    this.registerJsonResource(
      server,
      'project-verify-recipe',
      'vibebar://project/verify-recipe',
      'Verify recipe',
      'Ordered verify plan from package.json scripts.',
      async () => buildVerifyRecipeResource(buildVerificationRecipe(this.deps.projects.getProfile()))
    )

    this.registerJsonResource(
      server,
      'audit-summary',
      'vibebar://audit/summary',
      'Audit summary',
      'Cached security audit score, severity counts, and truncation flag.',
      async () =>
        buildAuditSummaryResource({ report: this.deps.audit.getCachedReport() })
    )

    this.registerJsonResource(
      server,
      'git-status',
      'vibebar://git/status',
      'Git status',
      'Branch, change count, and changed file paths for the active repo.',
      async () => {
        const status = this.deps.gitStatus.getStatus()
        const changedPaths = await this.deps.gitDiff.changedFiles()
        return buildGitStatusResource({ status, changedPaths })
      }
    )

    this.registerJsonResource(
      server,
      'ready-check-summary',
      'vibebar://ready-check/summary',
      'Ready Check summary',
      'Ready Check v2 tri-state and key signals. See vibebar://ready-check/brief for top actions.',
      async () => buildReadyCheckSummaryResource(await this.deps.readyCheck.evaluate())
    )

    this.registerJsonResource(
      server,
      'ready-check-brief',
      'vibebar://ready-check/brief',
      'Ready Check brief',
      'Top 3 blockers with explicit next actions.',
      async () => {
        const result = await this.deps.readyCheck.evaluate()
        const brief = result.brief ?? buildReadyCheckBrief(result.status, result.signals)
        return buildReadyCheckBriefResource(brief)
      }
    )

    registerVibebarTools(server, this.deps, this)
    return server
  }
}
