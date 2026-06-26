# Install & setup

VibeBar is a desktop app. No server, no API keys, no account. Install it, pick a project, and you are ready.

## Requirements

| Requirement | Notes |
|-------------|-------|
| **Windows 10+** | Required. macOS and Linux are not supported yet. |
| **Node.js 20+** | Only if you build from source. |
| **Git** | Needed for git status, diff prompts, and pack-changed. |
| **Cursor or another editor** | Optional. Quick Launch can open Cursor on your active project. |

## Install from a release

This is the easiest path.

1. Go to [Releases](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases).
2. Download the latest installer or portable `.exe`.
3. Run it and launch VibeBar.

## Build from source

From the repo root:

```bash
npm install
npm run dev
```

To produce a Windows installer:

```bash
npm run build
npm run dist
```

## First launch

When VibeBar opens:

1. A floating toolbar appears on the edge of your screen (left by default).
2. If no project is selected, the onboarding wizard opens.

### Onboarding (5 steps)

| Step | What happens |
|------|----------------|
| **Welcome** | Short overview of handoffs, packing, audits, and the terminal. |
| **Project** | Choose a project folder, or skip for now. |
| **Cursor** | Optionally point Quick Launch at your Cursor install. |
| **Context** | Optionally create an `AI Context/` folder in the project. |
| **Session** | Intro to Session Hub and **Copy handoff**. |

Use **Skip**, **Don't show again**, or finish with **Got it — start vibing**. Any of those dismisses the wizard for good.

## Select a project

Almost everything in VibeBar is scoped to one project folder.

- Click the **folder icon** on the toolbar to browse or pick a recent project.
- Or press `Ctrl+Shift+P` and choose **Switch project…** or a recent entry.

VibeBar remembers your last **10** projects. When you switch, it detects your stack in the background (language, framework, test runner, and similar signals).

## AI Context folder (optional)

Many teams keep assistant-readable material in `<project>/AI Context/`. VibeBar can create this folder during onboarding, or anytime from the **AI Context** button next to the project picker (folder icon with a plus).

That folder is where Code Sync mirrors land, screenshot snips save, and you can add your own docs.

## Connect Cursor Agent (optional)

For the tightest Cursor loop, open the **Cursor Agent** button (plug icon) on the toolbar and enable the MCP server. Cursor can then read your live session state — intent, Ready Check, git status, audit summary, and more — without you pasting anything.

1. Click **Cursor Agent** → **Enable MCP server for Cursor**. Status should read **Running** on `127.0.0.1:17342`.
2. Click **Copy mcp.json snippet** and merge it into `%USERPROFILE%\.cursor\mcp.json` (or a project-level `.cursor/mcp.json`).
3. Restart Cursor or reload MCP servers, then keep VibeBar open.

The toolbar button glows green while Cursor is actively connected. See [MCP server](/features/mcp-server) for the full resource and tool catalog.

## Dock and monitors

Open **Settings** to move the toolbar to the **left, top, or right** edge, or to choose which monitors show it. There is no bottom dock option.

## What to read next

1. [Your first session](/guide/first-session) for a hands-on walkthrough.
2. [Toolbar & tools](/features/) for the full tool list.
3. [Keyboard shortcuts](/reference/hotkeys) for the three global hotkeys.

::: tip Toolbar missing?
Press `Ctrl+Shift+H`, or use the system tray icon → **Show toolbar**. See [Troubleshooting](/help/troubleshooting) for more.
:::
