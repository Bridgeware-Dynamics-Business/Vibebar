import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { packMvcContext } from '../packer/mvcPacker.js'
import { MCP_DEFAULT_PACK_CHARS, MCP_MAX_PACK_CHARS } from './constants.js'
import type { McpServiceDeps } from './McpServerController.js'

const packChangedSchema = {
  maxTokens: z
    .number()
    .int()
    .min(1)
    .max(Math.floor(MCP_MAX_PACK_CHARS / 4))
    .optional()
    .describe('Approximate token budget; converted to chars (×4) with a 100k char cap.')
}

/** Validates and clamps pack_changed char budget from optional maxTokens. */
export function resolvePackCharBudget(maxTokens?: number): number {
  const fromTokens = maxTokens != null ? maxTokens * 4 : MCP_DEFAULT_PACK_CHARS
  return Math.min(Math.max(1, fromTokens), MCP_MAX_PACK_CHARS)
}

export function registerVibebarTools(server: McpServer, deps: McpServiceDeps): void {
  server.registerTool(
    'pack_changed',
    {
      description:
        'Returns a Minimum Viable Context bundle for git-changed files (imports + related tests), redacted and trimmed to budget.',
      inputSchema: packChangedSchema
    },
    async (args) => {
      const profile = deps.projects.getProfile()
      if (!profile?.rootPath) {
        return {
          content: [{ type: 'text' as const, text: 'No project selected in VibeBar.' }],
          isError: true
        }
      }

      const maxTokens = (args as { maxTokens?: number }).maxTokens
      const charBudget = resolvePackCharBudget(maxTokens)
      const ignoreText = deps.store.getCodeSyncConfig().ignoreText
      const headerLabel = profile.folderName || 'project'

      const packed = await packMvcContext({
        rootPath: profile.rootPath,
        headerLabel,
        ignoreText,
        charBudget
      })

      if (packed.fileCount === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No changed files to pack (working tree clean or paths ignored).'
            }
          ]
        }
      }

      const meta = [
        `Files: ${packed.fileCount}`,
        packed.trimmedPaths.length > 0 ? `Trimmed: ${packed.trimmedPaths.length}` : null,
        `Char budget: ${charBudget}`
      ]
        .filter(Boolean)
        .join(' · ')

      return {
        content: [{ type: 'text' as const, text: `${meta}\n\n${packed.text}` }]
      }
    }
  )
}
