# Prompt Library

The Prompt Library is where most sessions start. Pick a template, copy it with your project context filled in, and paste it into Cursor.

## At a glance

| | |
|---|---|
| **Opens as** | Panel (detachable) |
| **Needs** | A selected project for stack-aware filtering |
| **Output** | Clipboard text (not sent to an API) |
| **Also writes to** | Session Hub timeline on copy |

## What you get

- **Built-in templates** across 12 categories, filtered by your detected stack
- **Custom prompts** you author and store locally
- **Favorites** and a **Recent** row (up to 8 chips from your last copies)
- **Harden prompts** toggle for guardrails and secret redaction

## Categories

Filter chips in the panel header:

**All**, then Security, Debugging, Context, Code Review, Refactor, Performance, Testing, Deploy, UI/UX, Docs, Database, Auth.

Prompts tagged for your framework and language sort to the top. The header shows a stack summary like `React · TypeScript · Vitest`.

## How to copy a prompt

1. Open **Prompt Library** from the toolbar or `Ctrl+Shift+P` → **Open Prompt Library**.
2. Search or pick a category.
3. Click **Copy** on a card (preview first if you prefer).
4. VibeBar fills template variables from your project profile.
5. Paste into Cursor.

::: info No direct AI send
VibeBar prepares the clipboard. You paste into Cursor or any chat. Quick Launch on the copy toast can open Cursor on your project.
:::

## Guardrails

When **Harden prompts** is on (default), templates can append rules like:

| Guardrail | Typical use |
|-----------|----------------|
| `no-secrets` | Strip detected secrets before copy |
| `no-innerHTML` | Security-sensitive templates |
| `parameterized-queries` | Database templates |
| `validate-input` | Auth and testing templates |
| `keep-context-isolation` | Context boundaries |
| `no-eval` | Unsafe execution patterns |

Toggle in the library header or globally in **Settings → Behavior**.

## Custom prompts

Click **New prompt**. The editor seeds a draft with categories, stack tags, guardrails, and variable placeholders.

Custom prompts save to your local app config. Built-in prompts cannot be edited, only copied.

## Prompt Library vs Security Audit

**Performance**, **Testing**, and similar categories are **prompt templates**, not automated scans. For repo-wide security scanning, use [Security Audit](./security-audit).

## Tips

- If the stack summary says **stack unknown**, select the project root with a recognizable `package.json` or config.
- Detach the panel to keep it visible while you code.
- Copied prompts appear in [Session Hub](./session-hub) for pinning and handoffs.

## Related

- [Context Packer](./context-packer) when you need raw file contents
- [Command palette](./command-palette)
- [Settings](../reference/settings)
