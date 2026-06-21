# Code Sync

Small Electron app that **one-way mirrors** a **source folder** into a **sync folder** and keeps them aligned while you edit. Intended for keeping an “AI context” copy of a project next to another app without manual copying.

## Behavior

- On **Start**, the app runs an **initial full mirror**: files under the source are copied or updated in the sync folder; files (and empty directories) in the sync folder that are not in the source are **removed**, unless they match **ignore** patterns.
- While running, file changes under the source are picked up with **debouncing** (default 350 ms), then a full mirror pass runs again. Files are **skipped** when destination already matches (**size** and **mtime at second precision**, similar to a lightweight diff — avoids noisy re-copies on Windows and when two instances mirror into each other’s trees). Logs show **updated / unchanged / removed** counts.
- **Ignored paths** (defaults + your extra lines) are not copied and not deleted in the sync folder by the mirror logic for those paths.

### Default ignore globs

Includes `**/.git/**`, `**/node_modules/**`, Python (`__pycache__`, `.venv`, …), Rust `**/target/**`, `.cargo` registry/git caches, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/.turbo/**`, `**/coverage/**`, common cache files, and more.

Add more in **Extra ignore patterns** (one glob per line).

### Max file size

Default cap is **100 MB** per file (skipped with a log line). Set **Max file size** to **0** for no limit.

## Security

Renderer has **no Node integration**; only a small preload API is exposed (`contextIsolation` on).

With `"type": "module"` in `package.json`, electron-vite would otherwise emit **ESM preload** (`.mjs` with `import`), which Electron does not run correctly as a preload script. [`electron.vite.config.ts`](electron.vite.config.ts) forces **preload `rollupOptions.output.format: 'cjs'`** so `out/preload/index.js` uses `require("electron")` and `contextBridge` works.

Electron may log a **Content-Security-Policy** hint in development; tightening CSP for production builds is optional (often done when packaging).

## How to run

```bash
npm install
npm run dev
```

## How to build

```bash
npm run build
```

Output is under `out/` per electron-vite.

### Windows `.exe` (electron-builder, **unsigned**)

```bash
npm run dist
```

Produces `release/codesync-<version>-setup.exe` (NSIS installer), `release/codesync-<version>-portable.exe`, and `release/win-unpacked/CodeSync.exe`. **No code signing** — [`electron-builder.yml`](electron-builder.yml) sets `forceCodeSigning: false`, `win.signExts` with `!.exe` / `!.dll` so signtool is skipped, and the npm script sets `CSC_IDENTITY_AUTO_DISCOVERY=false`. For a retail build with a certificate, remove or adjust those settings and configure your signing identity per [electron.build/code-signing](https://www.electron.build/code-signing).

## Tests

```bash
npm test
```

## Windows long paths

If you hit `MAX_PATH` issues with very deep trees, enable long paths in Windows or keep projects under shorter paths. Extended-length `\\?\` prefix support can be added later if needed.
