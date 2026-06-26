# Settings

Open **Settings** from the toolbar (gear icon) or `Ctrl+Shift+P` → **Open Settings**.

## Toolbar missing?

**Show toolbar** brings the bar back and resets dock position. The same recovery paths are listed in [Keyboard shortcuts](./hotkeys).

## Monitors

Choose which displays show the floating toolbar. Per-monitor checkboxes plus **Show on all** and **Primary only**.

An empty enabled-display list means **primary display only**.

The **Error Console** section uses the same pattern. It appears bottom-left on selected monitors and captures renderer errors (with redaction). Closing it on one monitor closes it on all.

## System resource usage

Turn on **Show system resource usage** to float small, always-on-top widgets above every window. By default they form an **L-shaped stack** beside the toolbar (under the power button on left/right docks) and **follow the bar** when you move it.

- **Sync with toolbar** (default on): widgets move with the toolbar until you drag one away — detached widgets stay where you put them while the rest keep the L layout.
- **Below toolbar (L)** / **Above toolbar (reverse L)**: synced widgets form a **horizontal row** directly under or above the toolbar edge (not beside it along the side). Toggle sync off and on to reset widgets you dragged away.
- Pick which metrics to show: **RAM usage**, **CPU load**, **Disk free space**, and **VibeBar memory**.
- Pick which monitors show the widgets with the same **Show on all** / **Primary only** / per-display controls used elsewhere. None selected shows the primary display only.

Widgets tint amber, then red, as a metric approaches a concerning level (for example, high memory pressure or low free disk space). Disk space reflects the active project's drive when a project is open, otherwise the system drive.

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

**Prepare Cursor** (Session Hub or Command Palette) copies a micro bootstrap for Cursor Agent — intent, verify recipe, Ready Check status, and MCP resource hints — then opens Cursor on the project. Respects **Paste clipboard after opening Cursor** when enabled.

## Cursor Agent

These settings now live in their own toolbar menu — open the **Cursor Agent** button (plug icon) on the toolbar, not Settings. The Settings panel keeps a shortcut card that opens it. See [MCP server](/features/mcp-server) for full setup.

| Setting | Default | Effect |
|---------|---------|--------|
| **Enable MCP server for Cursor** | Off | Runs read-only MCP on `127.0.0.1:17342` when VibeBar is open |
| **Paste clipboard after opening Cursor** | Off | One-shot paste after **Open Cursor** or Quick Launch when you recently copied from VibeBar |
| **Pre-paste safety gate** | On (when paste enabled) | Scan clipboard for secrets, oversized prompts (>32k warning), and risky shell patterns before paste |
| **Auto-pin Fix with Context** | Off | Pins the Session Hub entry when **Fix with Context** copies to clipboard |
| **Auto-run verify after Fix with Context** | Off | Queues suggested verify in Smart Terminal after fix copy |

The Cursor Agent menu shows the connection status (**Running/Stopped/Failed**), the full endpoint URL, **last agent access** time, a setup checklist, and a **Copy mcp.json snippet** button for Cursor's MCP config. The toolbar button turns green while Cursor is actively connected.

## Stack detection override

When auto-detection reports **language** and **framework** as unknown, a **Stack detection** section appears:

- Override **language**, **framework**, and **test runner** (optional)
- **Save overrides** merges them into the effective profile for prompts, terminal parsers, and verify recipes
- **Clear overrides** removes manual values for the active project

Overrides are stored per project path in VibeBar settings (not in the repo).

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
