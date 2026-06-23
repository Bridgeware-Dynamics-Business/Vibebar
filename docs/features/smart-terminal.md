# Smart Terminal

An embedded terminal below your workflow — run commands, catch failures, and copy AI-ready fix prompts.

## What it is

Smart Terminal is a **built-in shell** (PowerShell, CMD, or Bash depending on environment), not a mirror of your IDE's terminal. It runs in your **project working directory**.

Open with the terminal icon or **`Ctrl+Shift+T`**.

## Core features

- **xterm.js terminal** — full shell interaction
- **Failure detection** — parses output for test failures, errors, non-zero exits
- **Fix prompts** — one-click copy with error context for Cursor
- **Project commands** — shortcuts parsed from `package.json` scripts and README
- **Audit dock** — mirrors Security Audit findings when audit panel has results
- **Re-run & dismiss** — re-run last command; dismiss resolved issues

## Debugging workflow

1. Run `npm test` (or your project's test command).
2. On failure, the dock highlights the issue.
3. Click **Copy fix prompt**.
4. Paste in Cursor — prompt includes error output and relevant context.
5. After fixing, re-run from the terminal.
6. **Dismiss** the issue when resolved (or let Session Hub track it).

Terminal issues appear on the [Session Hub](./session-hub) timeline.

## SARIF / Markdown export

When audit findings are mirrored in the dock, export options match the Security Audit panel.

## Window behavior

Smart Terminal is a floating window (not a detachable panel). It restores saved position and size between sessions.

## Tips

- Use **Project commands** for common scripts instead of typing paths.
- Pair with [Security Audit](./security-audit) — run audit, mirror to terminal, copy fixes without panel switching.
- If the terminal feels cramped, resize the window — bounds persist.

## What it is not

- Does not attach to Cursor's integrated terminal
- Does not auto-run commands on audit (you stay in control)

## Related

- [Session Hub](./session-hub)
- [Security Audit](./security-audit)
- [Real-world workflows](/workflows/real-world-workflows#debug-a-failing-test)
