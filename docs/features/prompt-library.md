# Prompt Library

Your starting point for almost every AI interaction. Pick a template, preview variables filled from your project, copy to clipboard, paste in Cursor.

## What it does

- **Built-in prompts** — curated templates with guardrails per category
- **Custom prompts** — create, edit, and delete your own
- **Stack filtering** — prompts tagged for your detected framework and language rise to the top
- **Favorites & history** — star templates and revisit recent copies
- **Harden prompts** — optional guardrails and secret redaction on every copy

## Categories

Built-in prompts are organized into:

Security · Debugging · Context · Code Review · Refactor · Performance · Testing · Deploy · UI/UX · Docs · Database · Auth

Filter by category in the panel header. **All** shows everything matching your stack tags.

## How copy works

1. Open **Prompt Library** from the toolbar or palette.
2. Search or filter by category.
3. Click a prompt card → **Copy** (or preview first).
4. VibeBar fills template variables from your [project profile](/features/#how-features-connect) — framework, language, paths, etc.
5. If **Harden prompts** is enabled, guardrails append and secrets are redacted.
6. Paste into Cursor chat.

There is **no direct send-to-AI API** — the workflow is copy → paste → implement.

## Guardrails

Category-aware guardrails include:

- `no-secrets` — strip detected secrets before copy
- `no-innerHTML` — security-focused templates
- `parameterized-queries` — database templates
- `validate-input` — auth and testing templates

Toggle **Harden prompts** in the library header or globally in [Settings](/reference/settings).

## Custom prompts

Click **New prompt** to open the editor. A stack-aware draft seeds:

- Title and description
- Categories and stack tags
- Starter guardrails
- Variable placeholders wired to project context

Save custom prompts to your local store. Built-in prompts cannot be edited, only copied.

## Tips

- Check the stack summary under the panel header — if it says "stack unknown", select a project with a recognizable `package.json` or config.
- Use **Performance** or **Testing** category prompts when you want focused advice — these are templates, not automated scans (see [Security Audit](./security-audit) for automated scanning).
- Detach the panel (pop-out button) to keep prompts visible while coding.

## Related

- [Command palette](./command-palette) — `Open Prompt Library`
- [Session Hub](./session-hub) — copied prompts appear on the timeline
- [Context Packer](./context-packer) — when you need raw file content, not a template
