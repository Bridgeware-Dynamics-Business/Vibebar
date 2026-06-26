# Fix With Context

**Fix with context** turns a failed terminal command into a complete AI-ready bundle in one click — failure output, git-changed files, stack frames, related tests, project stack, and a suggested verify command.

## When to use it

Use **Fix with context** when a command fails and you want Cursor (or another assistant) to see enough code to fix the issue without manually packing files.

Keep **Copy fix prompt** when you only need a short, guided prompt without file contents.

## What gets copied

The bundle includes:

| Section | Source |
|---|---|
| Command + exit code | Smart Terminal last run |
| Failure output | Structured parse (Vitest/Jest/tsc) or trimmed raw output |
| Project stack | Project detector (`language`, `framework`, test runner, package manager) |
| Nearest test file | Heuristic match from changed/stack paths |
| Suggested verify command | `package.json` scripts + detected stack |
| Context health warnings | Shared context-health helper (informational only) |
| Minimum viable context | Git-changed files + 1-hop imports + related tests (trimmed to ~32k chars) |
| Guardrails footer | Same safety constraints as fix prompts |

## Smart Terminal UI

When a command fails, each terminal issue card shows:

- **Copy fix prompt** — short guided prompt (existing behavior)
- **Fix with context** — full bundle with MVC pack

Both actions append to [Session Hub](./session-hub).

**Mark resolved** dismisses an issue by fingerprint; dismissed issues stay hidden across subsequent commands until you clear the terminal session.

## Structured parsers (Phase 3)

Stack-aware parsers run before regex fallbacks:

1. **Vitest / Jest** — file, test name, assertion lines
2. **tsc** — `file(line,col): error TS…`
3. **Stack frames** — `at file.ts:line:col` for Fix With Context file list
4. **Regex rules** — npm errors, ports, permissions, etc.

Parsers key off `ProjectProfile.testRunner` and `language` when available.

## Context packer honesty

Context Packer and MVC expansion share:

- **Code Sync ignore rules** from your sync settings (`ignoreText`)
- **32k char budget** with trim priority: changed → stack/import → tests → config

## Related

- [Smart Terminal](./smart-terminal)
- [Context Packer](./context-packer)
- [Session Hub](./session-hub)
