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

## Pinning

Pin items you want in a handoff. Unpin when they are done so bundles stay focused.

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

**Update AGENTS.md from session** appends a handoff block to your agents file.

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
