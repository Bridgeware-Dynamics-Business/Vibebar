# Session Hub

Session Hub is your working memory for the day. It collects prompts you copied, git diffs, audit fix copies, and terminal issues in one timeline.

## At a glance

| | |
|---|---|
| **Opens as** | Panel (detachable) |
| **Badge on toolbar** | Pinned item count |
| **Timeline cap** | 100 visible entries, then **Show N older entries** |
| **Storage** | `<project>/.vibebar/session.json` (git-ignored) |

## What appears on the timeline

| Type | Added when you… |
|------|-----------------|
| **Prompt** | Copy from Prompt Library |
| **Git diff** | Copy git diff prompt (title: "Git diff copied") |
| **Audit finding** | Copy fix prompt from Security Audit or terminal audit dock |
| **Terminal issue** | Copy fix prompt from Smart Terminal |
| **Note** | Save to note from another panel |

Browsing panels alone does not add entries. **Copy** actions do.

Entries group under **Today** and **Earlier**. The footer shows up to two **What's next?** suggestions based on local heuristics (no LLM).

## Flight log (Phase 4)

Session Hub records **outcomes**, not just copies:

| Recorded | When |
|----------|------|
| Terminal commands + exit codes | Smart Terminal command completes |
| Test/verify runs | Commands matching `npm test`, `vitest`, `tsc`, etc. |
| Audit runs + grade | Security Audit completes |
| Changed-file snapshots | After commands and audits |
| **Last green** | Last passing verify/test command + files changed since |

Open the collapsible **Flight log** section to see recent commands and last-green summary. Handoffs include a **Last green verify** excerpt when available.

## Current task (Intent Contract)

Set a lightweight **current task** so handoffs, Fix With Context bundles, and Ready Check review prompts stay scoped:

- Collapsible **Current task** strip in Session Hub
- Command palette → **Set current task**
- Stored in `.vibebar/session.json` alongside timeline entries

Fields: goal, optional verify command, constraints, files in scope, acceptance criteria. When set, exports prepend `## Current task`.

## Verify loop (minimal v1)

When you copy a **fix prompt** or **Fix with context**, VibeBar can attach a suggested verify command (from project scripts or your current task).

| Feature | Behavior |
|---------|----------|
| Auto-attach | Fix copies get `verifyCommand` when a test/lint script is detected |
| Pin status | `awaiting verify` → `verified` or `still broken` after re-run |
| Re-run | Play button on Session Hub entries runs verify in Smart Terminal |

Compares exit code on re-run; updates the timeline entry badge automatically.

## Pinning

Pin items you want in a handoff. If none are pinned, **Copy handoff** automatically pins your last few clipboard exports first.

The sparkles badge on the toolbar shows **pinned count only**, not total timeline size.

## Copy actions

| Button | Contents |
|--------|----------|
| **Copy handoff (N)** | Pinned items, project/stack header, `AGENTS.md` excerpt (up to 2048 chars), suggested next steps, git diff summary |
| **Copy fix prompts (N)** | Pinned audit and terminal fix prompts only |

Both respect secret redaction when guardrails are on.

**Copy handoff** requires at least one pinned item. If nothing is pinned, VibeBar shows a notice (including from palette → **Copy session handoff**).

## Filters

Timeline filter chips: **All**, **Prompts**, **Audit**, **Terminal**, **Git**.

Note-type entries exist but do not have their own filter chip.

## Sync project context

The collapsible **Sync project context** section shows status for:

- `AGENTS.md`
- `.cursor/rules/` (file count)
- `AI Context/README.md`

**Project memory diff** compares those docs to live repo signals (stack detection, `package.json` scripts, top-level folders). Drift warnings appear inline with actionable text — e.g. missing AGENTS.md, framework mismatch, undocumented scripts, or new Cursor rules.

**Update AGENTS.md from session** appends a handoff block to your agents file.

## Agent patterns (mistake ledger)

When git snapshots run (after terminal commands or audits), VibeBar records lightweight **agent patterns** in `.vibebar/session.json`:

| Pattern | Trigger |
|---------|---------|
| `weak-types` | Diff adds `any` or `@ts-ignore` |
| `out-of-scope` | Changes outside intent `filesInScope` |
| `duplicate-file` | Untracked basename matches existing file |
| `skipped-tests` | Source changed since last green, no test files in diff |

Open the collapsible **Agent patterns** section when mistakes exist. Top items are included in handoffs and Prepare Cursor. MCP: `vibebar://session/mistakes`.

## Verify timeline notes

Verify runs (test/lint commands) append lightweight **Verify:** note entries to the timeline when Smart Terminal completes them, including pass/fail/inconclusive status.

Palette → **Sync / view AI docs** opens Session Hub (it does not open a separate docs viewer).

## Pack changed

**Pack changed** bundles git-modified files to the clipboard with a token estimate (`chars / 4`). Same idea as Context Packer's Changed files preset without opening the packer.

## Clear session

**Clear session** uses a two-step confirmation. This removes local timeline data in `.vibebar/session.json`.

Full prompt text is stored on copy (up to 8192 chars per entry) so handoffs stay accurate.

## Workflow ideas

**End of day:** Pin open threads, copy handoff, paste into a new Cursor chat tomorrow.

**Mid-refactor:** Pin the git diff entry and key audit findings before switching branches.

## Related

- [Your first session](/guide/first-session)
- [Files & storage](/reference/files-and-storage)
- [Security Audit](./security-audit)
