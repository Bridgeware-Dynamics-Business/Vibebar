# Getting Started

You'll be up and running in a few minutes. VibeBar is a Windows desktop app — no server setup, no API keys required to start.

## Requirements

| Requirement | Notes |
|-------------|-------|
| **Windows 10+** | macOS and Linux are not supported yet |
| **Node.js 20+** | Only needed if building from source |
| **Git** | Recommended — powers git status, diff prompts, and change tracking |
| **[Cursor](https://cursor.com)** or another editor | Optional — Quick Launch opens your editor on the active project |

## Install

### Option A — Download a release (recommended)

1. Open the [releases page](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases).
2. Download the latest installer or portable executable.
3. Run the installer and launch VibeBar.

### Option B — Run from source

From the repo root:

```bash
npm install
npm run dev
```

Build a distributable:

```bash
npm run build
npm run dist
```

## First launch

When VibeBar starts:

1. A **floating toolbar** appears at the edge of your screen (dock position is configurable).
2. If no project is selected, the **onboarding wizard** opens automatically.

### Onboarding wizard (5 steps)

| Step | What you do |
|------|-------------|
| **Welcome** | Overview of Session Hub, pack/audit/terminal, and pinning |
| **Project** | Choose your project folder (or skip for now) |
| **Cursor** | Optionally set the Cursor executable for Quick Launch |
| **Context** | Optionally create an `AI Context/` folder in your project |
| **Session** | Learn about Session Hub and **Copy handoff** |

You can skip or dismiss the wizard at any time. **Don't show again** persists your choice.

## Pick a project

Everything in VibeBar is project-scoped:

- Click the **folder icon** on the toolbar to browse or pick a recent project.
- Or press **`Ctrl+Shift+P`** and choose **Switch project…** or a recent entry.

VibeBar remembers your last 10 projects and detects your stack silently (language, framework, test runner, monorepo, etc.).

## Optional: AI Context folder

Many teams keep assistant-readable docs in `<project>/AI Context/`. VibeBar can create this folder during onboarding, or you can create it anytime from the toolbar folder+ icon.

This folder receives:

- **Code Sync** mirrors (if configured)
- **Screenshot snips** from **Snip to AI Context**
- Any docs you add manually

## Recommended next steps

1. [Walk through your first session](/guide/first-session)
2. [Explore the feature map](/features/)
3. Skim [keyboard shortcuts](/reference/hotkeys) — three global hotkeys cover most power-user flows

## Troubleshooting install

See [Troubleshooting](/help/troubleshooting) if the toolbar doesn't appear, hotkeys conflict with your IDE, or project detection seems off.
