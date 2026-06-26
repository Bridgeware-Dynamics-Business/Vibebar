import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildContextHealthWarnings } from '@shared/contextHealth.js'
import type { IntentContract, VerifyPinStatus } from '@shared/types.js'
import { packMvcContext } from '../packer/mvcPacker.js'
import { buildReadyCheckBrief } from '../readyCheck/readyCheckLogic.js'
import { buildRegressionContext } from '../readyCheck/regressionContext.js'
import { buildFixWithContextBundle } from '../terminal/fixWithContext.js'
import { parseStructuredOutput } from '../terminal/terminalParsers.js'
import { MCP_MAX_PACK_CHARS, resolvePackTierAndBudget } from './constants.js'
import type { ContextPackTier } from '@shared/contextPackTier.js'
import type { McpServerController, McpServiceDeps } from './McpServerController.js'

const packChangedSchema = {
  tier: z.enum(['micro', 'standard', 'full']).optional().describe('Context pack size tier.'),
  maxTokens: z
    .number()
    .int()
    .min(1)
    .max(Math.floor(MCP_MAX_PACK_CHARS / 4))
    .optional()
    .describe('Approximate token budget; converted to chars (×4) with a 100k char cap.')
}

const setIntentSchema = {
  goal: z.string().max(2000),
  constraints: z.array(z.string().max(500)).max(32).optional(),
  filesInScope: z.array(z.string().max(512)).max(64).optional(),
  acceptanceCriteria: z.array(z.string().max(500)).max(32).optional(),
  verifyCommand: z.string().max(8000).nullable().optional()
}

const recordOutcomeSchema = {
  outcome: z.enum(['verified', 'still-broken', 'abandoned']),
  entryId: z.string().min(1).max(64).optional()
}

const regressionContextSchema = {
  maxTokens: z
    .number()
    .int()
    .min(1)
    .max(Math.floor(MCP_MAX_PACK_CHARS / 4))
    .optional()
}

/** Validates and clamps pack_changed char budget from optional maxTokens. */
export { resolvePackCharBudget } from './constants.js'

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError }
}

export function registerVibebarTools(server: McpServer, deps: McpServiceDeps, mcp?: McpServerController): void {
  server.registerTool(
    'pack_changed',
    {
      description:
        'Returns a Minimum Viable Context bundle for git-changed files (imports + related tests), redacted and trimmed to budget.',
      inputSchema: packChangedSchema
    },
    async (args) => {
      mcp?.recordAgentAccess()
      const profile = deps.projects.getProfile()
      if (!profile?.rootPath) {
        return textResult('No project selected in VibeBar.', true)
      }

      const argsTyped = args as { maxTokens?: number; tier?: ContextPackTier }
      const { tier, budget: charBudget } = resolvePackTierAndBudget(argsTyped.maxTokens, argsTyped.tier)
      const ignoreText = deps.store.getCodeSyncConfig().ignoreText
      const headerLabel = profile.folderName || 'project'

      const packed = await packMvcContext({
        rootPath: profile.rootPath,
        headerLabel,
        ignoreText,
        charBudget,
        tier
      })

      if (packed.fileCount === 0) {
        return textResult('No changed files to pack (working tree clean or paths ignored).')
      }

      const meta = [
        `Tier: ${packed.tier}`,
        `Files: ${packed.fileCount}`,
        packed.trimmedPaths.length > 0 ? `Trimmed: ${packed.trimmedPaths.length}` : null,
        `Char budget: ${packed.charBudget}`,
        `Used: ${packed.usedChars} chars`
      ]
        .filter(Boolean)
        .join(' · ')

      return textResult(`${meta}\n\n${packed.text}`)
    }
  )

  server.registerTool(
    'ready_check',
    {
      description: 'Fresh Ready Check aggregation: tri-state, signals, and brief excerpt.',
      inputSchema: {}
    },
    async () => {
      mcp?.recordAgentAccess()
      const result = await deps.readyCheck.evaluate()
      if (result.noProject) return textResult('No project selected in VibeBar.', true)
      const brief = result.brief ?? buildReadyCheckBrief(result.status, result.signals)
      const lines = [
        `Status: ${result.status}`,
        brief.summaryLine,
        '',
        'Top items:',
        ...brief.topItems.map(
          (item, i) => `${i + 1}. [${item.level}] ${item.label} — ${item.nextAction}`
        ),
        '',
        `Signals (${result.signals.length}):`,
        ...result.signals
          .filter((s) => s.level !== 'ok')
          .map((s) => `- [${s.level}] ${s.label}: ${s.detail}`)
      ]
      return textResult(lines.join('\n'))
    }
  )

  server.registerTool(
    'get_intent',
    {
      description: 'Read the active IntentContract for this project session.',
      inputSchema: {}
    },
    async () => {
      mcp?.recordAgentAccess()
      const intent = await deps.session.getIntent()
      return textResult(JSON.stringify({ intent }, null, 2))
    }
  )

  server.registerTool(
    'set_intent',
    {
      description: 'Update session IntentContract metadata (does not edit source files).',
      inputSchema: setIntentSchema
    },
    async (args) => {
      mcp?.recordAgentAccess()
      const profile = deps.projects.getProfile()
      if (!profile?.rootPath) return textResult('No project selected in VibeBar.', true)

      const a = args as {
        goal: string
        constraints?: string[]
        filesInScope?: string[]
        acceptanceCriteria?: string[]
        verifyCommand?: string | null
      }
      const patch: Omit<IntentContract, 'updatedAt'> = {
        goal: a.goal,
        constraints: a.constraints ?? [],
        filesInScope: a.filesInScope ?? [],
        acceptanceCriteria: a.acceptanceCriteria ?? [],
        verifyCommand: a.verifyCommand ?? null
      }
      await deps.session.setIntent(patch)
      return textResult('Intent contract updated.')
    }
  )

  server.registerTool(
    'get_last_green',
    {
      description: 'Last passing verify command and files changed since that run.',
      inputSchema: {}
    },
    async () => {
      mcp?.recordAgentAccess()
      const ext = await deps.session.readExtended()
      const lastGreen = ext.flight?.lastGreen ?? null
      if (!lastGreen) return textResult('No last-green verify recorded yet.')
      return textResult(
        JSON.stringify(
          {
            command: lastGreen.command,
            timestamp: lastGreen.timestamp,
            filesAtGreen: lastGreen.filesAtGreen,
            filesChangedSince: lastGreen.filesChangedSince
          },
          null,
          2
        )
      )
    }
  )

  server.registerTool(
    'get_context_health',
    {
      description: 'Aggregate context health warnings for the active project.',
      inputSchema: {}
    },
    async () => {
      mcp?.recordAgentAccess()
      const profile = deps.projects.getProfile()
      if (!profile) return textResult('No project selected in VibeBar.', true)

      const [aiDocs, changedPaths] = await Promise.all([
        deps.projects.getAiDocs(),
        deps.gitDiff.changedFiles()
      ])
      const warnings = buildContextHealthWarnings({
        profile,
        agentsMd: aiDocs.noProject ? undefined : aiDocs.agentsMd,
        changedPaths
      })
      if (warnings.length === 0) return textResult('No context health warnings.')
      return textResult(warnings.map((w) => `- [${w.id}] ${w.message}`).join('\n'))
    }
  )

  server.registerTool(
    'fix_last_terminal_failure',
    {
      description: 'Fix With Context bundle for the latest Smart Terminal failure (text only, no clipboard).',
      inputSchema: {}
    },
    async () => {
      mcp?.recordAgentAccess()
      const result = deps.terminal.getLastFailedResult()
      if (!result) {
        const failures = await deps.session.getFailures()
        const latest = failures[failures.length - 1]
        if (!latest) return textResult('No terminal failure on record.', true)
        return textResult(
          `Latest stored failure (${latest.kind}):\nCommand: ${latest.command}\n\n${latest.rawOutput.slice(0, 6000)}`
        )
      }

      const profile = deps.projects.getProfile()
      const agents = profile ? await deps.projects.getAiDocs() : null
      const intent = await deps.session.getIntent()
      const bundle = await buildFixWithContextBundle({
        result,
        profile: profile ?? null,
        ignoreText: deps.store.getCodeSyncConfig().ignoreText,
        agentsMd: agents?.agentsMd ?? null,
        intent
      })
      return textResult(bundle.text)
    }
  )

  server.registerTool(
    'get_regression_context',
    {
      description: 'MVC pack for files changed since last-green verify plus related tests.',
      inputSchema: regressionContextSchema
    },
    async (args) => {
      mcp?.recordAgentAccess()
      const profile = deps.projects.getProfile()
      if (!profile?.rootPath) return textResult('No project selected in VibeBar.', true)

      const ext = await deps.session.readExtended()
      const maxTokens = (args as { maxTokens?: number }).maxTokens
      const packed = await buildRegressionContext(
        {
          rootPath: profile.rootPath,
          profile,
          filesChangedSince: ext.flight?.lastGreen?.filesChangedSince ?? [],
          changedFiles: () => deps.gitDiff.changedFiles(),
          ignoreText: deps.store.getCodeSyncConfig().ignoreText,
          lastFailedResult: deps.terminal.getLastFailedResult()
        },
        maxTokens
      )

      if ('empty' in packed) return textResult(packed.message)

      return textResult(
        `Regression context (${packed.fileCount} files, ${packed.usedChars} chars)\n\n${packed.text}`
      )
    }
  )

  server.registerTool(
    'record_outcome',
    {
      description:
        'Record agent verify outcome on a pinned session entry (verified / still-broken / abandoned). Session metadata only.',
      inputSchema: recordOutcomeSchema
    },
    async (args) => {
      mcp?.recordAgentAccess()
      const a = args as { outcome: 'verified' | 'still-broken' | 'abandoned'; entryId?: string }
      const ext = await deps.session.readExtended()
      let entryId = a.entryId
      if (!entryId) {
        const awaiting = ext.entries.find(
          (e) =>
            e.pinned &&
            (e.type === 'terminal-issue' || e.type === 'audit-finding') &&
            e.verifyCommand &&
            e.verifyStatus !== 'verified'
        )
        entryId = awaiting?.id
      }
      if (!entryId) return textResult('No pinned verify entry found to update.', true)

      if (a.outcome === 'abandoned') {
        await deps.session.updateEntryVerify(entryId, { verifyStatus: null })
        return textResult(`Recorded abandoned for entry ${entryId}.`)
      }

      const status: VerifyPinStatus = a.outcome === 'verified' ? 'verified' : 'still-broken'
      await deps.session.updateEntryVerify(entryId, { verifyStatus: status })
      return textResult(`Recorded ${a.outcome} for entry ${entryId}.`)
    }
  )
}
