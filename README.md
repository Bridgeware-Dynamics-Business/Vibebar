# VibeBar

**[Wiki / documentation](https://bridgeware-dynamics-business.github.io/Vibebar/)** · [Releases](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases)

VibeBar is a floating Windows companion for **vibe coding** with AI assistants like Cursor. It sits at the edge of your screen and keeps your project context, prompts, security checks, and terminal workflow one click away.

## What it does

- **Recent projects** — switch between your last 10 project folders from the toolbar dropdown or command palette (`Switch project`)
- **First-run onboarding** — skippable wizard for project selection, Cursor setup, AI Context folder, and Session Hub intro
- **Prompt Library** — project-aware templates with guardrails and secret redaction on copy
- **Session Hub** — timeline of prompts, diffs, audit findings, and terminal issues; pin items and copy one structured handoff prompt (full text stored on copy); filter by type; pin count badge on toolbar; **Sync project context** reads AGENTS.md / Cursor rules
- **Context Packer** — bundle selected files into a paste-ready AI prompt; **Pack changed** for git-modified files with token estimate
- **Notes** — project Markdown notes with task lists; **Save to note** from audit findings and terminal issues
- **Git diff prompt** — copy staged + unstaged changes as an AI-ready prompt (right-click the GitHub badge when you have changes)
- **Security Audit** — read-only static scan with fix prompts, optional `npm audit` supply-chain advisories, and SARIF/Markdown export
- **Smart Terminal** — run commands, detect issues, re-run and dismiss findings
- **Code Sync** — continuous sync to an AI context folder
- **Quick Launch** — open Cursor (or other editors) on the active project

## Vibe coding workflow

1. **Select your project** from the toolbar folder button.
2. **Code with Cursor** (or your editor) as usual.
3. When you need AI help:
   - Copy a **prompt** from the library, or
   - **Pack context** / **copy git diff** for what changed, or
   - Run the **security audit** and copy fix prompts.
4. Paste into Cursor chat. Use **Open Cursor** on the copy toast to jump back quickly.
5. **Pin** important items in **Session Hub** (Sparkles icon — badge shows pin count) and **Copy handoff** to send one structured markdown bundle. Use **Copy fix prompts** for audit/terminal fixes only.
6. **Verify** in the Smart Terminal (`npm test`, etc.) — re-run the last command and mark issues resolved.

Session data is stored per project in `.vibebar/session.json` (git-ignored). Handoffs include an AGENTS.md excerpt when present. Audit baselines and rule toggles live in `.vibebar-audit.json`.

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

## Requirements

- Windows 10+
- Node.js 20+
- Git (for git status, diff, and change tracking)
- [Cursor](https://cursor.com) or another editor (optional, for Quick Launch)

## License

See [LICENSE](LICENSE).
