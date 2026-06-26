# MCP server (Cursor Agent)

Optional **localhost MCP server** so Cursor Agent can read VibeBar project state without copying prompts to the clipboard.

## What it does

When enabled in **Settings → Cursor Agent**, VibeBar runs a Streamable HTTP MCP server on `127.0.0.1:17342` (localhost only).

### Read-only resources

| URI | Content |
|-----|---------|
| `vibebar://session/pins` | Pinned Session Hub entries + truncated handoff excerpt |
| `vibebar://project/profile` | Project detector stack / profile |
| `vibebar://audit/summary` | Cached audit score, critical/high counts, truncated flag |
| `vibebar://git/status` | Branch, change count, changed file paths |
| `vibebar://ready-check/summary` | Ready Check v2 tri-state + key signals |

### Tool

| Tool | Args | Returns |
|------|------|---------|
| `pack_changed` | `{ maxTokens?: number }` | MVC/git-changed context bundle (char budget capped at 100k) |

## Cursor setup

1. Open VibeBar **Settings → Cursor Agent**.
2. Enable **Enable MCP server for Cursor** — status should show **Running** on port `17342`.
3. Click **Copy mcp.json snippet** and merge into your Cursor MCP config.

Example snippet:

```json
{
  "mcpServers": {
    "vibebar": {
      "url": "http://127.0.0.1:17342/mcp"
    }
  }
}
```

On Windows, Cursor reads MCP config from `%USERPROFILE%\.cursor\mcp.json` (or project-level `.cursor/mcp.json`).

4. Restart Cursor or reload MCP servers so Agent picks up VibeBar.

## Paste after open (Quick Launch bridge)

Separate from MCP: **Settings → Cursor Agent → Paste clipboard after opening Cursor** (default **off**).

When enabled **and** you explicitly open Cursor from:

- the **Open Cursor** button on the copy toast, or
- **Quick Launch → Cursor** within ~2 minutes of a VibeBar clipboard export,

VibeBar launches Cursor on your project path and attempts a one-shot paste (Windows: best-effort SendKeys). If paste cannot run safely, you see **Copied — paste in Cursor manually**.

## What it does NOT do

- No remote binding — never exposed outside localhost
- No arbitrary file read tools — only existing VibeBar services
- No API keys or cloud relay
- No chat UI inside VibeBar
- Does not auto-paste unless you enable the setting **and** take an explicit open action

## Security notes

- Binds `127.0.0.1` only with DNS rebinding protection via the MCP Express helper
- `pack_changed` validates `maxTokens` and enforces a 100k character cap
- Resources are read-only JSON snapshots of in-app state

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Status **Stopped** while enabled | Another process may own port `17342`, or startup failed — check the error line in Settings |
| Cursor cannot connect | Confirm VibeBar is running, project selected, and URL matches `http://127.0.0.1:17342/mcp` |
| Empty audit resource | Run Security Audit once so a cached report exists |
| Paste bridge does nothing | Enable the paste setting; copy from VibeBar first; focus may be required on Windows |

See also [Session Hub](./session-hub) and [Ready Check](./ready-check) for the data exposed through MCP.
