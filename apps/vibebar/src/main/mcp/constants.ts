/** Fixed localhost port for the VibeBar MCP server (Cursor Agent integration). */
export const MCP_PORT = 17_342

/** Bind address — localhost only; never expose on LAN. */
export const MCP_HOST = '127.0.0.1'

/** Hard cap for pack_changed char budget (also enforced in tool validation). */
export const MCP_MAX_PACK_CHARS = 100_000

/** Default char budget when maxTokens is omitted (~8k tokens). */
export const MCP_DEFAULT_PACK_CHARS = 32_000

export function mcpConnectionSnippet(port = MCP_PORT): string {
  return JSON.stringify(
    {
      mcpServers: {
        vibebar: {
          url: `http://${MCP_HOST}:${port}/mcp`
        }
      }
    },
    null,
    2
  )
}
