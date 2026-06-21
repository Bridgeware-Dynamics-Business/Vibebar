import type { PromptTemplate } from '@vibebar/prompt-engine'

/** Electron-specific prompts with desktop security guardrails baked in. */
export const ELECTRON_PROMPTS: PromptTemplate[] = [
  {
    id: 'electron-harden-security',
    title: 'Harden Electron security',
    categories: ['Security'],
    stacks: ['electron'],
    description: 'Audits your main/preload setup against the official Electron security checklist.',
    variables: [],
    guardrails: ['keep-context-isolation', 'no-secrets'],
    builtIn: true,
    body: [
      'You are a desktop-security engineer auditing my Electron app ({{language}}) against the official Electron Security Checklist. Inspect the main process, every BrowserWindow/BrowserView creation, the preload script(s), and the renderer before reporting.',
      '',
      'Verify each item and report PASS/FAIL with the exact file and line:',
      '- `contextIsolation: true` on every window (this is the single most important control).',
      '- `nodeIntegration: false` and `nodeIntegrationInWorker: false` everywhere.',
      '- `sandbox: true` wherever feasible.',
      '- `webSecurity` is never disabled and `allowRunningInsecureContent` is never enabled.',
      '- The renderer reaches the main process only through a small, typed `contextBridge` preload API — never `ipcRenderer`, `require`, or Node globals exposed directly.',
      '- Every `ipcMain.handle`/`on` validates its sender and payload, and the channel list is an allowlist (unknown channels rejected).',
      '- `webContents.setWindowOpenHandler` / `will-navigate` restrict navigation and new windows to trusted origins; no untrusted remote content is loaded.',
      '- A Content-Security-Policy is set for packaged builds.',
      '- No secrets, tokens, or privileged file paths are embedded in renderer code.',
      '',
      'For every FAIL, show the before/after code, explain the concrete attack it enables (e.g. RCE via a compromised renderer), and rank fixes by severity. Do not introduce `eval`, `new Function`, or remote module loading, and do not weaken any control to simplify a fix.'
    ].join('\n')
  },
  {
    id: 'electron-ipc-bridge',
    title: 'Add a safe IPC channel',
    categories: ['Security', 'Refactor'],
    stacks: ['electron'],
    description: 'Adds a typed, validated main↔renderer IPC channel through the preload bridge.',
    variables: [
      { key: 'entryFile', source: 'entryFile', default: 'out/main/index.js', label: 'Main entry' }
    ],
    guardrails: ['keep-context-isolation', 'validate-input'],
    builtIn: true,
    body: [
      'Add a new IPC channel to my Electron app ({{language}}) the safe way. First read my existing preload and main-process IPC setup and match its conventions exactly rather than inventing a parallel pattern. My main entry is around {{entryFile}}.',
      '',
      'Implement it end to end:',
      '1. Define the channel name as a shared constant in one place so main and preload cannot drift.',
      '2. In the main process, register it with `ipcMain.handle` and validate the payload with a schema before using it; on invalid input, reject with a clear error and never act on partial data.',
      '3. Expose exactly one typed async method on the `contextBridge` preload API — do not expose `ipcRenderer`, `invoke`, or the raw channel to the renderer.',
      '4. Call it from the renderer only through that typed method, with the return type flowing through.',
      '',
      'Constraints: keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. Treat the renderer as untrusted — validate everything crossing the boundary in both directions. Show me every file you change with before/after, and explain why the boundary stays safe.'
    ].join('\n')
  },
  {
    id: 'electron-package',
    title: 'Package for Windows',
    categories: ['Deploy'],
    stacks: ['electron'],
    description: 'Sets up electron-builder for an unsigned Windows installer and portable build.',
    variables: [
      { key: 'entryFile', source: 'entryFile', default: 'out/main/index.js', label: 'Main entry' }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Help me package my Electron app for Windows with electron-builder. Read my current package.json, build scripts, and main entry ({{entryFile}}) first so the config matches what I already have.',
      '',
      'I want:',
      '- An NSIS installer and a portable .exe, unsigned for now (note clearly where signing config would later go).',
      '- Correct `files`/`asar` settings so my real entry point and assets are included and nothing dev-only is shipped.',
      '- App metadata (productName, appId, icon) wired up.',
      '',
      'Walk me through the electron-builder config block, the build/dist scripts to add, and how to test both outputs. Call out anything that will break on Windows: long-path limits, native module rebuilds, antivirus flags on unsigned binaries, and paths that assume a dev layout. Do not commit any signing certificates or secrets into the config.'
    ].join('\n')
  }
]
