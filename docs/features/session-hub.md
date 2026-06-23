# Session Hub

Your session memory — prompts you copied, git diffs, audit findings, and terminal issues in one timeline.

## Timeline entries

Session Hub records:

| Type | Source |
|------|--------|
| **Prompt** | Copied from Prompt Library |
| **Git diff** | Copied git diff prompt |
| **Audit finding** | Security Audit copy or scan events |
| **Terminal issue** | Smart Terminal failure detection |

The visible timeline caps at **100 entries** with **Show older** for the rest. Footer shows local **What's next?** heuristics based on recent activity.

## Pinning

Pin items that matter for your current task. The toolbar **Session Hub** badge shows your pin count.

Pinned items are included in handoffs. Unpin when done to keep handoffs focused.

## Copy actions

| Button | What you get |
|--------|--------------|
| **Copy handoff** | Markdown bundle of all pinned items + AGENTS.md excerpt when present |
| **Copy fix prompts** | Audit and terminal fix prompts only (no full handoff) |

Both respect secret redaction when guardrails are enabled.

**Palette shortcut:** **`Ctrl+Shift+P`** → **Copy session handoff**

## Filters

Filter the timeline by entry type to focus on audits, terminal issues, or prompts.

## Sync project context

**Sync / view AI docs** reads project assistant configuration:

- `AGENTS.md`
- `.cursor/rules/` (Cursor rules)
- `AI Context/README.md` when present

Use this before a handoff to ensure agent instructions are current. Same action is available from the command palette.

## Pack changed

From Session Hub, **Pack changed** bundles git-modified files into a clipboard prompt — same as Context Packer's changed-files preset, without opening the packer panel.

## Storage

Session data lives in **`.vibebar/session.json`** inside your project. This file is git-ignored by default. Full prompt text is stored when you copy (for accurate handoffs).

## Workflow tips

**End of day:** Pin open questions → Copy handoff → paste into a Cursor chat or save to [Notes](./notes).

**Mid-refactor:** Pin the git diff entry and key audit findings so your next prompt has full context.

**Team handoff:** Copy handoff includes structured markdown another developer (or agent) can paste directly.

## Related

- [Your first session](/guide/first-session)
- [Context Packer](./context-packer)
- [Security Audit](./security-audit)
