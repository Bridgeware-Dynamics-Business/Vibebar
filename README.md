# VibeBar

[![Documentation](https://img.shields.io/badge/docs-read%20online-6366f1?style=for-the-badge)](https://bridgeware-dynamics-business.github.io/Vibebar/)
[![Releases](https://img.shields.io/github/v/release/Bridgeware-Dynamics-Business/Vibebar?style=for-the-badge&label=download)](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases)
[![Windows](https://img.shields.io/badge/platform-Windows%2010%2B-0078d4?style=for-the-badge)](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases)

A floating Windows companion for **vibe coding** with AI assistants like Cursor. It docks to the edge of your screen and keeps your project context, prompts, security checks, terminal workflow, and Cursor Agent connection one click away — so you stay in flow instead of hunting for context to paste.

## Documentation

**Read the docs:** [bridgeware-dynamics-business.github.io/Vibebar](https://bridgeware-dynamics-business.github.io/Vibebar/)

| If you want to… | Start here |
|-----------------|------------|
| Install VibeBar | [Install & setup](https://bridgeware-dynamics-business.github.io/Vibebar/guide/getting-started) |
| Learn the workflow | [Your first session](https://bridgeware-dynamics-business.github.io/Vibebar/guide/first-session) |
| See every tool | [Toolbar & tools](https://bridgeware-dynamics-business.github.io/Vibebar/features/) |
| Connect Cursor Agent | [MCP server](https://bridgeware-dynamics-business.github.io/Vibebar/features/mcp-server) |
| Fix a problem | [Troubleshooting](https://bridgeware-dynamics-business.github.io/Vibebar/help/troubleshooting) |

New users: [What is VibeBar?](https://bridgeware-dynamics-business.github.io/Vibebar/guide/what-is-vibebar)

## Download

Get the latest Windows installer from **[Releases]([https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases/tag/1.1.0-pr))**. Then follow the [install guide](https://bridgeware-dynamics-business.github.io/Vibebar/guide/getting-started).

## The toolbar

VibeBar is a thin, always-on-top strip that snaps to the left, right, or top edge of any monitor. Every tool opens an inline glass panel beside the bar — and any panel can be **detached** into its own floating window. Hit `Ctrl+Shift+P` for the command palette to reach everything by keyboard.

## What it does

### Context & handoff
- **Recent projects** — switch between your last 10 project folders from the toolbar dropdown or command palette (`Switch project`).
- **Prompt Library** — project-aware templates with guardrails and secret redaction on copy.
- **Context Packer** — bundle selected files into a paste-ready AI prompt; **Pack changed** grabs git-modified files with a token estimate.
- **Session Hub** — a timeline of prompts, diffs, audit findings, and terminal issues. Pin items and copy one structured handoff prompt (full text stored on copy), filter by type, and watch the pin-count badge on the toolbar. **Sync project context** reads AGENTS.md / Cursor rules.
- **Git diff prompt** — copy staged + unstaged changes as an AI-ready prompt (right-click the GitHub badge when you have changes).
- **Snip to AI Context** — capture a screen region straight into your AI context folder.
- **Notes** — project Markdown notes with task lists; **Save to note** from audit findings and terminal issues.

### Quality & verification
- **Security Audit** — read-only static scan with fix prompts, optional `npm audit` supply-chain advisories, and SARIF/Markdown export.
- **Ready Check** — a pre-commit tri-state gate (Looks ready / Needs review / Blocked) that surfaces blockers and a copyable review brief.
- **Smart Terminal** — run commands, detect issues, re-run, and dismiss findings.

### Cursor Agent integration
- **Cursor Agent menu** — a dedicated toolbar button (plug icon) for everything MCP. Enable the local server, see live connection status, copy the `mcp.json` snippet, and tune Cursor automation toggles — all in one place. The button glows green while Cursor is actively connected.
- **MCP server** — an optional read-only [MCP server](https://bridgeware-dynamics-business.github.io/Vibebar/features/mcp-server) on `127.0.0.1:17342` that lets Cursor Agent read VibeBar session state (intent, Ready Check, git status, audit summary, and more) without copy-pasting. Localhost only — no API keys, no cloud relay, no chat UI.
- **Prepare Cursor** — copies an agent bootstrap (intent, verify recipe, Ready Check brief, MCP usage hint) and opens Cursor on your project.

### Launch & sync
- **Code Sync** — continuous sync to an AI context folder.
- **Quick Launch** — open Cursor (or other editors) on the active project.
- **First-run onboarding** — a skippable wizard for project selection, Cursor setup, AI Context folder, and Session Hub intro.

## Vibe coding workflow

1. **Select your project** from the toolbar folder button.
2. *(Optional, once)* Open the **Cursor Agent** button → enable the MCP server, copy the `mcp.json` snippet into Cursor, and restart Cursor. Now the agent can read your session state directly.
3. **Code with Cursor** (or your editor) as usual.
4. When you need AI help:
   - Copy a **prompt** from the library, or
   - **Pack context** / **copy git diff** for what changed, or
   - Run the **security audit** and copy fix prompts.
5. Paste into Cursor chat — or skip the paste entirely if MCP is connected. Use **Open Cursor** on the copy toast to jump back quickly.
6. **Pin** important items in **Session Hub** (Sparkles icon — badge shows pin count) and **Copy handoff** to send one structured markdown bundle. Use **Copy fix prompts** for audit/terminal fixes only.
7. Run **Ready Check** before you commit, then **Verify** in the Smart Terminal (`npm test`, etc.) — re-run the last command and mark issues resolved.

Session data is stored per project in `.vibebar/session.json` (git-ignored). Handoffs include an AGENTS.md excerpt when present. Audit baselines and rule toggles live in `.vibebar-audit.json`.

## Cursor Agent (MCP) at a glance

| | |
|---|---|
| **Endpoint** | `http://127.0.0.1:17342/mcp` (localhost only) |
| **Enable from** | **Cursor Agent** toolbar button → *Enable MCP server for Cursor* |
| **Config path** | `%USERPROFILE%\.cursor\mcp.json` (or a project-level `.cursor/mcp.json`) |
| **Exposes** | Read-only resources (session pins, intent, Ready Check, git status, audit summary, …) plus tools (`pack_changed`, `ready_check`, `get_intent`, …) |
| **Writes** | Session metadata only (`set_intent`, `record_outcome`) — never your source files |

See the full [MCP server guide](https://bridgeware-dynamics-business.github.io/Vibebar/features/mcp-server) for setup, the resource/tool catalog, and security notes.

## Performance notes

- **Audit scans** use an incremental per-file cache; auto-scans coalesce in-flight runs and mirror quietly to an open terminal.
- **Context Packer** lazy-loads directories with debounced expand and loading indicators.
- **Session Hub** caps the visible timeline at 100 entries (with “Show older”); footer shows local “What’s next?” heuristics.
- **Command palette** memoizes actions and debounces fuzzy search (150ms).
- **Detached panels and Smart Terminal** restore saved window bounds; position/size persists on move/resize.

## Global hotkeys (default on)

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+H` | Hide/show toolbar |
| `Ctrl+Shift+T` | Toggle Smart Terminal |

Toggle hotkeys in **Settings → Behavior**.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

Run tests:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Build the Electron app:

```bash
npm run build
npm run dist
```

Edit the docs site locally: `npm run docs:dev`

## Requirements

- Windows 10+
- Node.js 20+
- Git (for git status, diff, and change tracking)
- [Cursor](https://cursor.com) or another editor (optional, for Quick Launch and MCP)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributing guide](https://bridgeware-dynamics-business.github.io/Vibebar/contribute/contributing) on the docs site.

## License

See [LICENSE](LICENSE).
