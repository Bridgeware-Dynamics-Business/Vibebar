# MCP server (Cursor Agent)

Optional **localhost MCP server** so Cursor Agent can read VibeBar project state without copying prompts to the clipboard.

## What it does

When enabled from the **Cursor Agent** toolbar button (plug icon), VibeBar runs a Streamable HTTP MCP server on `127.0.0.1:17342` (localhost only).

### Read-only resources

| URI | Content |
|-----|---------|
| `vibebar://session/pins` | Pinned Session Hub entries + truncated handoff excerpt |
| `vibebar://session/intent` | Full IntentContract for the active project |
| `vibebar://session/flight-log` | Terminal commands, audit runs, last-green verify |
| `vibebar://session/failures` | Failure black box (parsed terminal failures) |
| `vibebar://session/mistakes` | Agent mistake ledger (pattern + file fingerprints) |
| `vibebar://project/memory-diff` | AGENTS.md / rules drift vs live repo |
| `vibebar://project/profile` | Project detector stack / profile |
| `vibebar://project/verify-recipe` | Ordered verify plan from `package.json` scripts |
| `vibebar://audit/summary` | Cached audit score, critical/high counts, truncated flag |
| `vibebar://git/status` | Branch, change count, changed file paths |
| `vibebar://ready-check/summary` | Ready Check v2 tri-state + signals (+ link to brief) |
| `vibebar://ready-check/brief` | Top 3 blockers with explicit next actions |

### Tools

| Tool | Args | Returns |
|------|------|---------|
| `pack_changed` | `{ tier?: 'micro' \| 'standard' \| 'full', maxTokens?: number }` | MVC/git-changed context bundle |
| `ready_check` | — | Fresh tri-state + signals + brief excerpt |
| `get_intent` | — | Current IntentContract JSON |
| `set_intent` | Intent fields (`goal`, `constraints`, …) | Updates session intent (metadata only) |
| `get_last_green` | — | Last passing verify + `filesChangedSince` |
| `get_context_health` | — | Context health warnings |
| `fix_last_terminal_failure` | — | Fix With Context bundle text (no clipboard) |
| `get_regression_context` | `{ maxTokens?: number }` | MVC pack for files changed since last green |
| `record_outcome` | `{ outcome, entryId? }` | Updates pinned verify status (`verified` / `still-broken` / `abandoned`) |

All resources and tools update the **last agent access** time shown in the Cursor Agent menu.

## Cursor setup

1. Open the **Cursor Agent** button (plug icon) on the VibeBar toolbar.
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

## Prepare Cursor (Quick Launch)

**Session Hub → Prepare Cursor** or **Command Palette → Prepare Cursor** builds an ~8k-char bootstrap (intent, verify recipe, Ready Check brief, MCP usage hint), copies it to the clipboard, and opens Cursor on the project path.

When **Paste clipboard after opening Cursor** is enabled in the Cursor Agent menu, VibeBar also attempts a one-shot paste (Windows: best-effort SendKeys).

## Paste after open (Quick Launch bridge)

Separate from MCP: **Cursor Agent menu → Paste clipboard after opening Cursor** (default **off**).

When enabled **and** you explicitly open Cursor from:

- the **Open Cursor** button on the copy toast,
- **Quick Launch → Cursor** or **Prepare Cursor** within ~2 minutes of a VibeBar clipboard export,

VibeBar launches Cursor on your project path and attempts a one-shot paste (Windows: best-effort SendKeys). If paste cannot run safely, you see **Copied — paste in Cursor manually**.

## What it does NOT do

- No remote binding — never exposed outside localhost
- No arbitrary file read tools — only existing VibeBar services
- No API keys or cloud relay
- No chat UI inside VibeBar
- MCP `set_intent` / `record_outcome` write **session metadata only** — never source files
- Does not auto-paste unless you enable the setting **and** take an explicit open action

## Security notes

- Binds `127.0.0.1` only with DNS rebinding protection via the MCP Express helper
- `pack_changed` and `get_regression_context` validate `maxTokens` and enforce a 100k character cap
- Resources are read-only JSON snapshots of in-app state (except session metadata tools above)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Status **Stopped** while enabled | Another process may own port `17342`, or startup failed — check the error line in the Cursor Agent menu |
| Cursor cannot connect | Confirm VibeBar is running, project selected, and URL matches `http://127.0.0.1:17342/mcp` |
| Empty audit resource | Run Security Audit once so a cached report exists |
| Empty failures resource | Run a failing command in Smart Terminal with parseable output |
| Paste bridge does nothing | Enable the paste setting; copy from VibeBar first; focus may be required on Windows |

See also [Session Hub](./session-hub) and [Ready Check](./ready-check) for the data exposed through MCP.
