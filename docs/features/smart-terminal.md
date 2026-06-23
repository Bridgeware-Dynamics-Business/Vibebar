# Smart Terminal

Smart Terminal is a floating shell window rooted in your project directory. Run commands, catch failures, and copy fix prompts without switching to a separate terminal app.

## At a glance

| | |
|---|---|
| **Opens as** | Floating window (not a toolbar panel) |
| **Shell** | PowerShell, cmd, or bash depending on your environment |
| **Working directory** | Current project folder |
| **Hotkey** | `Ctrl+Shift+T` |

It is a built-in terminal. It does not mirror Cursor's integrated terminal.

## Main features

- Full interactive shell via xterm.js
- **Failure detection** on non-zero exits and common test output patterns
- **Copy fix prompt** and **Copy test** on issues
- **Re-run last command** and **Mark resolved** (dismiss)
- **Project commands** menu: scripts from `package.json`, detected commands, README hints
- **Audit dock** when Security Audit results are presented in the terminal

Window position and size persist between sessions.

## Debug workflow

1. Open Smart Terminal (`Ctrl+Shift+T` or palette → **Open Smart Terminal**).
2. Run your test or build command (try **Project commands** for shortcuts).
3. On failure, the dock highlights the issue.
4. **Copy fix prompt**, paste in Cursor, implement.
5. Re-run in the terminal.
6. **Mark resolved** when green.

Fix copies append to [Session Hub](./session-hub).

## Security Audit in the terminal

When audit results show in the terminal dock, you get the same export options as the audit panel (SARIF, Markdown) and can copy fix prompts without switching views.

If Smart Terminal is already open, clicking **Security Audit** on the toolbar routes new scans to this dock.

## Tips

- cwd follows the selected project. Switch projects if paths look wrong.
- Shell type is not configurable as an IDE profile would be; it follows your Windows environment.
- Some tools exit 0 even when output looks wrong. Prefer test runners that fail non-zero, or copy output manually.

## Related

- [Security Audit](./security-audit)
- [Session Hub](./session-hub)
- [Everyday patterns](/workflows/real-world-workflows)
