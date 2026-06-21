# VibeBar

A little floating toolbar that sits on top of everything and helps you talk to your AI.

You know that feeling when you're deep in a project, you know something is wrong or something needs doing, but you just can't figure out how to phrase the prompt? VibeBar is built for exactly that moment. You click a button, and it hands you a prompt that already knows what your project is, what stack you're running, and what could go wrong. Then you paste it into your AI and keep moving.

That's the whole idea. Less staring at a blinking cursor wondering what to type. More clicking, getting a smart prompt, and shipping.

## Why I built it

Vibe coding is fun until it isn't. You move fast, the AI writes a chunk of code, it mostly works, and then three iterations later you've quietly shipped a hard-coded secret, a wide-open endpoint, or validation that only lives in the frontend. The scary part is that each AI pass tends to add risk rather than hold it steady, and the usual static scanners miss the behavioral stuff entirely.

So VibeBar does two things at once. It makes good prompts effortless, and it keeps a quiet eye on the safety side so the speed doesn't come back to bite you later.

## What it actually does

### A toolbar that floats over everything

VibeBar lives as an always-on-top bar with round, animated buttons, almost like a second taskbar that follows you around. You can drag it to the left edge, the right edge, or the top. Drop it at the top and it flips itself from a vertical layout to a horizontal one without you doing anything. If you run multiple displays, you can have it show up on one, two, or three monitors at the same time.

### Prompts that know your project

Point VibeBar at a folder and it quietly reads the signal files (read-only, it never writes anything) to figure out what you're working with. From there the prompt library adapts to you. The exact same prompt template behaves differently depending on the stack: an Electron project picks up `contextIsolation` guardrails, a Next.js project gets guidance around CSP and `dangerouslySetInnerHTML`. You're not picking from a hundred near-identical prompts. You're getting one prompt that reshapes itself around what you actually have.

### A terminal that watches your back

The Smart Terminal is a frameless, always-on-top terminal that floats over your other windows and docks on the opposite side from the toolbar. It opens at a comfortable default size, you drag it around by its title bar, and you can resize it from any edge or corner — because the window is frameless and transparent, those resize grips are drawn by VibeBar itself rather than the OS, so dragging to resize works the same in a packaged build as it does in development. Toggle it from the bar, and hiding it keeps your scrollback put for when you bring it back.

It runs all your usual build, test, lint, and git commands, but the real trick is that it reads the output. The moment it spots an error (a missing module, a type error, a failing test, a port collision, a stack trace, a package manager blowing up, any of it), it turns that error into a ready-to-paste, project-aware prompt that points your AI straight at a correct and safe fix. Think of it as the eyes on your project while you work.

It also carries a full Security Audit dock right inside it: the same severity-grouped findings you'd see in the side panel (CWE and OWASP mapping, file and line, code frames, copy the fix, copy the test, copy everything at once), plus its own Run audit button and auto-scan controls. So your audit can live right next to your build output. One nice detail: while the terminal is open, clicking Security Audit in the toolbar routes straight into the terminal dock instead of popping a second panel. Close the terminal and the side panel comes back. The audit only ever shows up in one place, so you're never staring at two copies of it.

### Security Audit for the stuff scanners miss

This is the piece I care about most. It tackles the number one vibe-coding risk: the behavioral and structural holes that static scanners walk right past.

It inspects your project read-only across JS, TS, Vue, Svelte, Astro, and Python, and flags things like:

- Hard-coded secrets on both the client and the server (the classic Moltbook pattern)
- Missing Row Level Security
- Endpoints that are prone to BOLA and IDOR
- Validation that only exists in the frontend
- Dangerous DOM and eval sinks
- SQL and OS command injection
- Insecure config such as disabled TLS verification, permissive CORS, and debug mode left on
- Electron hardening that's regressed
- Weak randomness used for security-sensitive values
- Gaps in your `.gitignore`
- Supply-chain drift like unpinned versions and a missing lockfile

Findings land in a dedicated panel, grouped by severity, each one mapped to its CWE or OWASP entry and pinned to the exact file, line, and a little code frame so you can see it in context. For every finding you get two prompts: a fix prompt and a behavioral-test prompt, both already loaded with the structured context so your LLM acts precisely instead of guessing. There's also a one-click "Copy all as one prompt" when you want to hand over everything at once.

Flip on auto-scan (you set the interval in seconds or minutes) and the audit keeps re-running live while you edit. And when the Smart Terminal is open, the findings mirror into it automatically, so you can literally watch issues appear as you type.

If you're wondering where the old standalone Secret Scanner went, it got folded in here. The repo audit catches committed keys, and there's still a built-in paste box that redacts arbitrary text before you send it off to an LLM.

### Context Packer

Pick files from a tree and get a clipboard-ready context block, shaped for prompts and with secrets stripped out. Great for when you want to hand your AI a few specific files without copy-pasting them one at a time.

### Code Sync

A continuous, one-way folder mirror for keeping an AI-context copy in sync with your real project. It opens in its own window so the overlay stays visible while it runs.

### A behavioral-security prompt pack

The prompt library also ships a dedicated behavioral-security pack: generate a behavioral test suite, IDOR and BOLA tests, dynamic auth-flow tests, server-side validation, client-secret and RLS checks, a dependency and supply-chain audit, and a "re-audit before I ship this change" prompt. It's there because, again, every AI iteration tends to compound risk rather than keep it flat, so it helps to check in often.

## How it's put together

VibeBar is an npm-workspaces monorepo:

```
apps/vibebar              Electron app (main + preload + React renderers)
packages/codesync         One-way folder mirror engine + IPC registration
packages/project-detector Read-only stack detection that produces a ProjectProfile
packages/prompt-engine    Template variables, conditionals, guardrail injection
packages/prompt-packs     Built-in starter prompts (Electron, Web, Python, cross-stack)
```

The Electron app pulls in the workspace packages straight from source through Vite aliases. The main process is the only place that can touch the filesystem, and the renderers reach it through small, typed preload bridges.

### The security model

I wanted the tool itself to practice what it preaches, so:

- Every window runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Every call from a renderer goes through an IPC channel allowlist with Zod validation (`src/main/security/validateIpc.ts`). Unknown channels and malformed payloads get rejected outright.
- All project access is read-only, with the only exception being Code Sync's explicit mirror destinations.
- The secret scanning runs entirely on your machine and never transmits a single finding.
- A strict Content-Security-Policy is applied in packaged builds.
- Persistence is namespaced inside a single `electron-store` instance.

## What you'll need

- Node.js 20 or newer (I develop on Node 22)
- Windows 10 or 11 for the overlay behavior and packaged builds

## Getting it running

```bash
npm install          # install all workspaces
npm run dev          # launch VibeBar in development (electron-vite)
npm test             # run the full unit-test suite (Vitest)
npm run build        # production bundle
npm run dist         # build an unsigned Windows installer plus a portable exe
```

### Want to verify it works? Run through this

1. The overlay shows up on the left edge. Drag it to the top or the right, and notice that docking at the top switches it to a horizontal layout.
2. Click the folder button and pick a project. The Prompt Library header should show the folder name, the git branch, and the detected stack.
3. Open the Prompt Library. Categories and search filter the cards, and the prompts you see should match the stack it detected.
4. Expand a card to see the sculpted body with the resolved variable chips, then hit Copy. The clipboard should hold the sculpted text. Toggle "Harden prompts" and the safety block gets appended.
5. Favorites and prompt history should survive a full restart.
6. Click Code Sync. It opens in its own window while the overlay stays put.
7. Click Smart Terminal. A terminal opens opposite the toolbar at a comfortable default size. Drag any edge or corner to resize it (this works in a packaged `.exe`, not just in dev). Run something that fails, like `node missing.js`, and the detected-issues panel should fill with a project-aware fix prompt you can copy. Hit X to hide it, then click the toolbar button again to bring it back with the scrollback still intact.
8. Click Security Audit on a selected project. The panel auto-runs and lists findings by severity, each one showing its CWE or OWASP mapping, the file and line, and a code frame, with "Copy fix prompt", "Copy behavioral test", and "Copy all as one prompt" buttons. Toggle Auto-scan, set an interval, and watch it re-run live as you edit.
9. With the Smart Terminal open, click Security Audit in the toolbar. The side panel should not open. Instead the terminal's audit dock fills in (and the panel collapses to save space). That dock offers the same expandable findings, Run audit, auto-scan, and copy-all. Close the terminal with X and the Security Audit side panel reopens right where you left it.
10. Expand "Scan pasted text for secrets" in the same panel and paste a fake API key. It should get detected and a redacted copy should be offered back to you.
11. In the Context Packer, select some files and pack them. The clipboard should hold a prompt-shaped block with secrets stripped out.
12. In Settings, toggle your monitors, change the dock position, and quit VibeBar.

## A note on the app icon, code signing, and distribution

The VibeBar logo (`apps/vibebar/build/icon.ico`) is embedded directly into `VibeBar.exe` during packaging, so the executable shows the real icon in Windows Explorer — not just the shortcuts. This relies on `signAndEditExecutable: true` in `apps/vibebar/electron-builder.yml`: that flag gates electron-builder's rcedit pass, which is what writes the icon and version metadata into the binary. **Leave it on.** Turning it off ships the stock Electron executable untouched, and Explorer falls back to the generic Electron icon even though the `.ico` is correct. Enabling it does not force signing — editing the binary and signing it are independent, and signing is skipped automatically when no certificate is configured. (Windows aggressively caches exe icons, so if an old icon lingers after a rebuild it's the icon cache, not the build.)

Released builds are unsigned by default. `npm run dist` gives you an NSIS installer and a portable executable with no Authenticode signature, which means Windows SmartScreen will throw an "unknown publisher" warning the first time you run it. That's expected for early-adopter and portable sharing, and honestly the portable `.exe` is the lowest-friction way to pass it around while signing isn't set up yet.

If you want to produce a signed build:

1. Get yourself an OV or EV Authenticode certificate (a `.pfx` file). An EV certificate skips SmartScreen's reputation warm-up period.
2. Feed it in through environment variables, and never commit the certificate or its password:
   - `CSC_LINK` is the path to the `.pfx` file, or its base64-encoded contents
   - `CSC_KEY_PASSWORD` is the certificate password
3. Run `npm run dist:signed`. Unlike `npm run dist`, it doesn't disable certificate discovery, so electron-builder picks up the cert from the environment and signs the binary (the icon is already embedded by the same `signAndEditExecutable` step, signed or not).

## Under the hood

Electron 33, electron-vite, TypeScript, React 19, Tailwind CSS 4, Framer Motion, xterm.js, Zod, Vitest, and electron-store.

## License

VibeBar is **source-available, not open source**. It's released under the
[PolyForm Internal Use License 1.0.0](LICENSE).

In short: you're free to read the code, use VibeBar for personal and internal
business purposes, and contribute improvements back to this project. You may
**not** distribute it, sell it, or release your own version or fork. If you'd
like to sell or distribute VibeBar, please reach out for written permission
first. Contributions are always welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
