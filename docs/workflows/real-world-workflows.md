# Everyday patterns

Recipes for common days with VibeBar. Each matches how the app works today.

## Pre-PR security pass

**Goal:** Catch issues before review without leaving your flow.

1. Select the project. Open **Security Audit**.
2. Triage critical and high findings. **Copy fix prompt** for each.
3. Paste in Cursor. Implement fixes.
4. `Ctrl+Shift+T` → run your test script in Smart Terminal.
5. Re-run the audit. **Accept risk** on findings you are knowingly shipping.
6. **Right-click** the GitHub badge → copy git diff prompt for a final review message.
7. Pin key items in Session Hub. **Copy handoff** if someone else picks up the PR.

Commit `.vibebar-audit.json` rule toggles if your team shares them.

## Debug a failing test

**Goal:** Turn terminal output into a useful Cursor prompt.

1. Open Smart Terminal (`Ctrl+Shift+T`).
2. Run the failing command (try **Project commands**).
3. When the dock shows an issue, **Copy fix prompt**.
4. Paste in Cursor. Apply the fix.
5. Re-run. **Mark resolved** when green.
6. Optional: **Save to note** for your PR checklist.

## Report a UI bug

**Goal:** Give the model something visual.

1. Reproduce the bug on screen.
2. **Snip to AI Context** over the affected area.
3. Paste the copied prompt into Cursor.
4. Add numbered reproduction steps in the same chat.
5. Pin the session entry if the fix takes multiple rounds.

## Hand off to tomorrow-you

**Goal:** One pasteable bundle for the next session.

1. During the day, **pin** prompts, audit copies, and terminal issues in Session Hub.
2. Open Session Hub → **Sync project context** to check `AGENTS.md` and Cursor rules.
3. End of day: **Copy handoff** (requires pins).
4. Start tomorrow's chat by pasting the handoff.

Handoffs include an `AGENTS.md` excerpt when the file exists.

## Set up a new repo

**Goal:** Stand up assistant context quickly.

1. Finish onboarding: project → Cursor path → create **AI Context** folder.
2. Open **Code Sync**. Mirror `src/` or key packages into `AI Context/`.
3. Run **Security Audit** once for a baseline.
4. Copy a **Context** prompt from the library to draft or refine `AGENTS.md`.
5. Session Hub → confirm AI docs section looks right.

## Dependency upgrade day

**Goal:** Catch supply chain and static issues after updates.

1. Enable npm audit in Security Audit.
2. Rescan. Triage new advisories.
3. Copy fix prompts where code must change.
4. Batch test in Smart Terminal between upgrades.
5. Export **SARIF** if your pipeline ingests it.

## Work in one package of a monorepo

**Goal:** Keep context scoped to one package.

1. Switch project to the **package root**, not always the monorepo root.
2. Context Packer → **Changed files** or **Entry points**.
3. Session Hub → **Pack changed** for quick copies.
4. Confirm Prompt Library stack summary matches that package.

## When to reach for something else

| Situation | Try |
|-----------|-----|
| Runtime-only bug | Reproduce in Smart Terminal, copy fix prompt with stack trace |
| Architecture decision | Code Review or Refactor prompts + Context Packer for design docs |
| Team policy | Commit audit rule toggles; document accepted risks in Notes |

## Related

- [Your first session](/guide/first-session)
- [Toolbar & tools](/features/)
- [Troubleshooting](/help/troubleshooting)
