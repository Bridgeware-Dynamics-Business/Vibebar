# Real-world workflows

Practical patterns that match VibeBar as shipped today.

## Pre-PR security pass

**Goal:** Catch issues before review without leaving your flow.

1. Select the project; open **Security Audit**.
2. Review critical/high findings; **Copy fix prompt** for each.
3. Paste into Cursor; implement fixes.
4. **`Ctrl+Shift+T`** → `npm test` (or your test script).
5. Re-run audit; baseline accepted risks in `.vibebar-audit.json` if needed.
6. **Copy git diff prompt** (GitHub badge right-click or palette) for a final review prompt.
7. Pin key items in Session Hub; **Copy handoff** if handing off to CI or a teammate.

## Debug a failing test

**Goal:** Turn terminal output into a useful Cursor prompt.

1. Open Smart Terminal (**`Ctrl+Shift+T`**).
2. Run the failing command (use **Project commands** if available).
3. When the dock shows an issue, **Copy fix prompt**.
4. Paste in Cursor; apply the fix.
5. Re-run in terminal; **Dismiss** when green.
6. Optional: **Save to note** from the terminal issue for your PR checklist.

## Report a UI bug

**Goal:** Give the model visual + textual context.

1. Reproduce the bug on screen.
2. **Snip to AI Context** → select the affected region.
3. Paste the copied snip prompt into Cursor.
4. Add reproduction steps in the same chat.
5. Pin the session entry if the fix spans multiple iterations.

## Hand off to tomorrow-you (or another agent)

**Goal:** One pasteable bundle of everything that mattered today.

1. Throughout the day, **pin** prompts, audit findings, and terminal issues in Session Hub.
2. **Sync / view AI docs** to refresh AGENTS.md / Cursor rules in context.
3. End of day: **Copy handoff**.
4. Start tomorrow's Cursor chat by pasting the handoff.

Handoffs include AGENTS.md excerpts when the file exists.

## Onboard a new repo

**Goal:** Get assistant context standing quickly.

1. Complete onboarding: project → Cursor path → **Create AI Context folder**.
2. Set up **Code Sync** for `src/` or key packages → `AI Context/`.
3. Run **Security Audit** once for baseline.
4. Copy a **Context** category prompt from Prompt Library to generate or refine `AGENTS.md`.
5. **Sync / view AI docs** to confirm rules are picked up.

## Dependency upgrade day

**Goal:** Supply chain + static issues after `npm update`.

1. Enable npm audit in Security Audit.
2. Rescan; triage new advisories.
3. Copy fix prompts for upgrades that need code changes.
4. Smart Terminal: run test suite after each batch.
5. Export **SARIF** if your pipeline ingests it.

## Monorepo: work on one package

**Goal:** Keep context scoped.

1. Switch project to the package root (not always the monorepo root).
2. Context Packer → **Changed files** or **Entry points** preset.
3. Session Hub **Pack changed** for quick copies without opening the tree.
4. Use stack summary in Prompt Library to confirm detection matches the package.

## When VibeBar is not enough

- **Runtime-only bugs** — reproduce in terminal, copy fix prompt with stack trace.
- **Architecture decisions** — Prompt Library **Code Review** or **Refactor** templates + Context Packer for design docs.
- **Team policy** — commit `.vibebar-audit.json` toggles; document accepted risks in Notes.

## Related

- [Your first session](/guide/first-session)
- [Feature map](/features/)
- [Troubleshooting](/help/troubleshooting)
