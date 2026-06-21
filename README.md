# VibeBar

A floating Windows overlay companion for vibe coders. VibeBar turns *"I don't know what to ask my AI"* into **click → get a project-aware, safety-hardened prompt → paste**. Every prompt is sculpted around your actual detected stack before it lands on the clipboard, and high-value safety tools (Secret Scanner, Context Packer, continuous Code Sync) sit one click away.

## What it does

- **Always-on-top toolbar** with circular, animated buttons that floats over any app like a second taskbar. Drag it to the left, right, or top edge; docking at the top flips it from vertical to horizontal automatically. It can appear on one, two, or three monitors.
- **Project-aware Prompt Library** — pick a folder and VibeBar reads its signal files (read-only) to detect the stack. Prompts adapt: an Electron project gets `contextIsolation` guardrails, a Next.js project gets CSP / `dangerouslySetInnerHTML` guidance, from the *same* prompt template.
- **Smart Terminal** — a frameless, always-on-top terminal that overlays your other windows and docks opposite the toolbar (draggable, resizable, toggled from the toolbar — hiding preserves scrollback). It runs your build/test/lint/git commands and acts as *the eyes on your project*: it watches each command's output and, the moment it detects an error (missing module, type error, failing test, port collision, stack trace, package-manager failure, …), it turns that error into a ready-to-paste, project-aware prompt that guides your AI to a correct, safe fix. It also hosts a **full Security Audit dock** — the same advanced, severity-grouped findings UI as the side panel (CWE/OWASP, file:line, code frames, copy fix/test, copy-all) plus its own **Run audit** button and **auto-scan** controls — so the audit can live right next to your build output. While the terminal is open, clicking **Security Audit** in the toolbar routes straight here instead of opening a second panel; close the terminal and the side panel reappears, so the audit is only ever shown in one place.
- **Security Audit** — addresses the #1 vibe-coding risk: the behavioral and structural vulnerabilities that static scanners miss. It inspects your project read-only (JS/TS/Vue/Svelte/Astro/Python) and flags client- and server-side hard-coded secrets (the Moltbook pattern), missing Row Level Security, BOLA/IDOR-prone endpoints, frontend-only validation, dangerous DOM/eval sinks, SQL & OS-command injection, insecure config (disabled TLS verification, permissive CORS, debug mode), Electron hardening regressions, weak randomness for security values, `.gitignore` gaps, and supply-chain drift (unpinned versions, missing lockfile). Findings appear in a dedicated panel grouped by severity, each mapped to its **CWE/OWASP** entry and pinpointed to the exact **file, line, and a code frame**. For every finding you get both a **fix prompt** and a **behavioral-test prompt** — each pre-loaded with that structured context so the LLM acts precisely — plus a one-click **"Copy all as one prompt"**. Turn on **auto-scan** (seconds or minutes per run) to keep the audit re-running live while you edit, and whenever the **Smart Terminal is open the findings mirror there automatically** so you can watch issues appear as you code. (The old standalone Secret Scanner is folded in: the repo audit catches committed keys, and a built-in paste box still redacts arbitrary text before you send it to an LLM.)
- **Context Packer** — pick files from a tree and get a clipboard-ready, secrets-stripped context block shaped for prompts.
- **Code Sync** — continuous one-way folder mirror for keeping an AI-context copy in sync, opened in its own window while the overlay stays visible.

The prompt library also ships a **behavioral-security pack** (generate a behavioral test suite, IDOR/BOLA tests, dynamic auth-flow tests, server-side validation, client-secret & RLS checks, dependency/supply-chain audit, and a "re-audit before I ship this change" prompt) because each AI iteration tends to compound risk, not hold it steady.

## Architecture

This is an npm-workspaces monorepo:

```
apps/vibebar              Electron app (main + preload + React renderers)
packages/codesync         One-way folder mirror engine + IPC registration
packages/project-detector Read-only stack detection → ProjectProfile
packages/prompt-engine    Template variables, conditionals, guardrail injection
packages/prompt-packs     Built-in starter prompts (Electron, Web, Python, cross-stack)
```

The Electron app bundles the workspace packages from source via Vite aliases. The main process is the only place with filesystem access; renderers reach it through small, typed preload bridges.

### Security model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on every window.
- Every renderer call goes through an **IPC channel allowlist** with **Zod validation** (`src/main/security/validateIpc.ts`); unknown channels and malformed payloads are rejected.
- All project access is **read-only** except Code Sync's explicit mirror destinations.
- The Secret Scanner runs entirely locally and never transmits findings.
- A strict Content-Security-Policy is applied in packaged builds.
- Persistence is namespaced in a single `electron-store` instance.

## Requirements

- Node.js 20+ (developed on Node 22)
- Windows 10/11 for the overlay behavior and packaged builds

## How to run and verify

```bash
npm install          # install all workspaces
npm run dev          # launch VibeBar in development (electron-vite)
npm test             # run the full unit-test suite (Vitest)
npm run build        # type-check-free production bundle
npm run dist         # build an unsigned Windows installer + portable exe
```

### Manual acceptance checklist

1. The overlay appears on the left edge and can be dragged to the top or right; docking at the top switches it to a horizontal layout.
2. Click the folder button to select a project — the Prompt Library header shows the folder name, git branch, and detected stack.
3. Open the Prompt Library: categories and search filter the cards, and the visible prompts match the detected stack.
4. Expand a card to see the sculpted body with resolved variable chips, then Copy — the clipboard holds the sculpted text. Toggling **Harden prompts** appends the safety block.
5. Favorites and prompt history persist across a restart.
6. Click Code Sync — it opens in its own window while the overlay stays visible.
7. Click Smart Terminal — a terminal opens opposite the toolbar. Run a command that fails (e.g. `node missing.js`); the detected-issues panel fills with a project-aware fix prompt you can copy. Hit X to hide it, then click the toolbar button again to bring it back with scrollback intact.
8. Click Security Audit on a selected project — the panel auto-runs and lists findings by severity, each showing its CWE/OWASP mapping, file:line, and a code frame, with "Copy fix prompt", "Copy behavioral test", and "Copy all as one prompt" buttons. Toggle **Auto-scan** and set an interval to watch it re-run live as you edit.
9. With the Smart Terminal open, click **Security Audit** in the toolbar — the side panel does **not** open; instead the terminal's audit dock fills in (the panel collapses to save space). The terminal dock offers the same expandable findings, **Run audit**, **auto-scan**, and **copy-all**. Close the terminal (X) — the Security Audit side panel automatically reopens where you left it.
10. Expand "Scan pasted text for secrets" in the same panel, paste a fake API key — it is detected and a redacted copy is offered.
11. In the Context Packer, select files and pack them — the clipboard holds a prompt-shaped block with secrets stripped.
12. In Settings, toggle monitors, change the dock position, and quit VibeBar.

## Code signing and distribution

Released builds are **unsigned by default**. `npm run dist` produces an NSIS installer and a portable
executable with no Authenticode signature, so Windows SmartScreen shows an "unknown publisher" warning
on first run. This is expected for early-adopter and portable distribution; the portable `.exe` is the
lowest-friction artifact to share while signing is not yet set up.

To produce a **signed** build:

1. Obtain an OV or EV Authenticode certificate (`.pfx`). An EV certificate sidesteps SmartScreen's
   reputation warm-up period.
2. Provide it through environment variables (never commit the certificate or its password):
   - `CSC_LINK` — path to the `.pfx` file, or its base64-encoded contents
   - `CSC_KEY_PASSWORD` — the certificate password
3. In `apps/vibebar/electron-builder.yml`, set `signAndEditExecutable: true` and remove the
   `signExts` exclusion (both are flagged with inline comments).
4. Run `npm run dist:signed` (unlike `npm run dist`, it does not disable certificate discovery).

## Tooling

Electron 33 · electron-vite · TypeScript · React 19 · Tailwind CSS 4 · Framer Motion · xterm.js · Zod · Vitest · electron-store
