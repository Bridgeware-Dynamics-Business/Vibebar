# Troubleshooting

Common issues and fixes for VibeBar on Windows.

## Toolbar not visible

1. Press **`Ctrl+Shift+H`** to toggle visibility.
2. Check the **system tray** → right-click VibeBar → **Show toolbar**.
3. Open **Settings** (tray menu) → **Show toolbar** — also resets dock position.
4. Confirm the toolbar isn't on a monitor you've disabled in **Settings → Monitors**.

## Hotkeys don't work

1. **Settings → Behavior** — ensure **Global hotkeys** is on.
2. Another app (often Cursor) may capture the same combos — disable VibeBar hotkeys and use the palette from the toolbar click path, or adjust the other app.
3. Restart VibeBar after changing hotkey settings.

## Project not detected / wrong stack

1. Select the **project root** (folder with `package.json` or primary config), not a subfolder — unless you intentionally work at package scope in a monorepo.
2. Switch project via folder picker; recents can point to stale paths.
3. Prompt Library stack summary should show framework/language — if "unknown", the detector couldn't read configs.

## Prompts don't feel tailored

1. Confirm a project is selected.
2. Check Prompt Library header for stack summary.
3. Use **Context Packer** or **Pack changed** to attach file content prompts can't infer.
4. Add `AGENTS.md` or Cursor rules; use **Sync / view AI docs** in Session Hub.

## Security Audit shows no findings / too many

- **No findings:** rules may be toggled off in `.vibebar-audit.json` — open **Audit config** from palette.
- **Too many / noise:** baseline accepted risks; tune rule toggles; commit team-agreed config.
- **npm audit empty:** ensure npm is installed and `package-lock.json` exists.

## Smart Terminal issues

- **Wrong directory:** terminal cwd follows selected project — switch project if needed.
- **Shell choice:** depends on environment (PowerShell/CMD/Bash); not configurable as IDE terminal profile.
- **No failure detected:** some tools exit 0 with errors in output — copy output manually or use test runners that fail non-zero.

## Session Hub empty or missing handoff

- Timeline fills when you **copy** prompts, diffs, audit fixes, or terminal issues — browsing alone doesn't add entries.
- **Copy handoff** only includes **pinned** items — pin first.
- Session file: `.vibebar/session.json` — delete only if corrupt (loses local session).

## Code Sync not updating

- Sync is one-way; edit **source** files, not destination.
- Confirm sync instance is running and paths are correct.
- Large deletes may need destination cleanup manually.

## Snip saves to wrong place

- Select the correct **project** before snipping.
- Ensure `AI Context/` exists or create via toolbar folder+ icon.

## Build from source fails

- Node **20+** required; use `npm ci` for clean installs.
- Windows required for Electron overlay dev experience.
- Run `npm run typecheck` and `npm test` for specific failures.

## Still stuck?

Open a [bug report](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) with:

- Windows version
- VibeBar version (release or commit)
- Steps to reproduce
- Relevant logs from Error Console if enabled

Security issues: use GitHub **Report a vulnerability**, not public issues.

## Related

- [Getting started](/guide/getting-started)
- [Settings](/reference/settings)
- [Contributing](/contribute/contributing)
