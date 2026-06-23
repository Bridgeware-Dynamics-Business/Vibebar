# Troubleshooting

Fixes for common VibeBar issues on Windows.

## Toolbar not visible

1. Press `Ctrl+Shift+H`.
2. System tray → right-click VibeBar → **Show toolbar**.
3. **Settings → Show toolbar** (resets dock position too).
4. Check **Settings → Monitors**. The bar may be on a display you disabled.

## Hotkeys do not work

1. **Settings → Behavior** → turn **Global hotkeys** on.
2. Cursor or another app may own the same combos. Disable VibeBar hotkeys and use the toolbar, or change the other app's bindings.
3. Restart VibeBar after changing hotkey settings.

## Wrong project or stack

1. Open the **project root** (folder with `package.json` or main config), not a random subfolder, unless you intentionally work at package scope in a monorepo.
2. Recents can point to moved folders. Use **Switch project…** to browse again.
3. Prompt Library should show a stack summary. **stack unknown** means detection could not read configs.

## Prompts feel generic

1. Confirm a project is selected.
2. Check the stack line under the Prompt Library header.
3. Use **Context Packer** or **Pack changed** to attach file contents templates cannot infer.
4. Add `AGENTS.md` or Cursor rules. Session Hub → **Sync project context**.

## Security Audit: no findings or too many

| Symptom | Try |
|---------|-----|
| Nothing reported | Rules may be off in `.vibebar-audit.json`. Palette → **Audit config**. |
| Too much noise | **Accept risk** on known items. Tune rule toggles. |
| npm audit empty | Install npm. Ensure `package-lock.json` exists. |

## Smart Terminal

| Symptom | Try |
|---------|-----|
| Wrong folder | cwd follows selected project. Switch project. |
| Wrong shell | PowerShell, cmd, or bash follows your environment. Not IDE-configurable. |
| Failure not detected | Some tools exit 0 with errors in output. Use runners that fail non-zero or copy output manually. |

## Session Hub empty or handoff missing

- Entries appear when you **copy** prompts, diffs, audit fixes, or terminal fixes. Browsing alone does not add rows.
- **Copy handoff** needs **pinned** items. Pin first.
- Corrupt session file? Delete `.vibebar/session.json` (loses local timeline).

## Code Sync stale files

- Sync is one-way. Edit sources, not the mirror.
- Confirm the sync pair is running and paths are correct.
- After big deletes, clean the destination manually if needed.

## Snip saved in the wrong place

- Select the correct project before snipping.
- Create **AI Context** from the toolbar if the folder is missing.

## Build from source fails

- Node **20+** required.
- Windows needed for full overlay development.
- Run `npm ci`, then `npm run typecheck` and `npm test` for specific errors.

## Still stuck?

Open a [bug report](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) with:

- Windows version
- VibeBar version (release tag or commit)
- Steps to reproduce
- Error Console output if you have it enabled

For security issues, use GitHub **Report a vulnerability**. Do not file public issues for vulnerabilities.

## Related

- [Install & setup](/guide/getting-started)
- [Settings](/reference/settings)
- [Contributing](/contribute/contributing)
