# Settings

Open **Settings** from the toolbar (gear icon) or `Ctrl+Shift+P` → **Open Settings**.

## Toolbar missing?

**Show toolbar** brings the bar back and resets dock position. The same recovery paths are listed in [Keyboard shortcuts](./hotkeys).

## Monitors

Choose which displays show the floating toolbar. Per-monitor checkboxes plus **Show on all** and **Primary only**.

An empty enabled-display list means **primary display only**.

The **Error Console** section uses the same pattern. It appears bottom-left on selected monitors and captures renderer errors (with redaction). Closing it on one monitor closes it on all.

## Dock position

**Left**, **Top**, or **Right**. There is no bottom dock.

Default is left.

## Behavior

| Setting | Default | Effect |
|---------|---------|--------|
| **Harden prompts by default** | On | Guardrails and secret redaction on copy |
| **Launch on startup** | Off | Start VibeBar with Windows |
| **Global hotkeys** | On | Register Ctrl+Shift+H / P / T |

The Prompt Library also shows a **Harden prompts** toggle tied to the same setting.

## Quick Launch

Built-in launchers: **Cursor** and **Codex**. For each app you can:

- Show or hide it on the toolbar
- Set the executable path (pencil icon)
- Remove it

**Add application** for custom editors or tools. Launch opens the app on your **current project path** when one is selected.

## Cursor Agent

Optional integrations for Cursor power users. See [MCP server](/features/mcp-server) for full setup.

| Setting | Default | Effect |
|---------|---------|--------|
| **Enable MCP server for Cursor** | Off | Runs read-only MCP on `127.0.0.1:17342` when VibeBar is open |
| **Paste clipboard after opening Cursor** | Off | One-shot paste after **Open Cursor** or Quick Launch when you recently copied from VibeBar |

When MCP is enabled, Settings shows **Running/Stopped**, port, and a **Copy mcp.json snippet** button for Cursor's MCP config.

## Footer

**Quit VibeBar** exits immediately. The toolbar **Power** button shows a confirmation dialog first.

## Not in Settings today

These are not configurable in the current release:

- Remapping global hotkeys
- Prompt length presets (minimal vs detailed)
- Direct AI API keys or send-to-model integration
- Privacy or cloud toggles (scanning is local)

## Related

- [Keyboard shortcuts](./hotkeys)
- [Prompt Library guardrails](/features/prompt-library#guardrails)
