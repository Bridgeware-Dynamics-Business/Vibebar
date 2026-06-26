# Ready Check

Ready Check is VibeBar's pre-commit **trust gate** — one panel that aggregates git, security audit, Smart Terminal, secrets, session flight data, and project context into a single tri-state answer: **Blocked**, **Needs review**, or **Looks ready**.

Read-only: no auto-commit, no auto-fix. Copy prompts and jump to related tools.

## At a glance

| | |
|---|---|
| **Opens as** | Toolbar panel (detachable) |
| **Signals (v2)** | Git diff, audit posture, terminal status, secrets in diff, project context, verify/session/deps signals from Flight Recorder |
| **Output** | Tri-state status, per-signal detail chips, copy review prompt |
| **Actions** | Copy review prompt, open Security Audit, open Smart Terminal, copy git diff |

## Tri-state rules

| Status | When |
|--------|------|
| **Blocked** | Open critical audit finding, secrets in staged/unstaged diff, **secrets in untracked files**, or last terminal command failed (non-zero exit) |
| **Needs review** | High audit finding, truncated audit scan, large diff (>500 lines), unknown stack, `package.json` changed, untracked-only changes, unresolved terminal dock issues, subfolder without project manifest, JS/TS changed without a recent audit, **or any v2 signal below** |
| **Looks ready** | None of the above **and** (audit ran in the last 30 minutes **or** no JS/TS source files changed) |

### v2 signals (Phase 5)

These use **Session Flight Recorder** data in `.vibebar/session.json` and the session timeline:

| Signal | Meaning |
|--------|---------|
| **Tests not run since change** | Working tree changed but no passing test/verify command recorded since |
| **Diff not reviewed this session** | No `git-diff` Session Hub entry since the last file-change snapshot |
| **Lockfile changed — npm audit pending** | `package-lock.json`, `pnpm-lock.yaml`, etc. changed but no `npm audit` or Security Audit run since |
| **Audit delta since session start** | Finding count increased or score dropped vs the first audit recorded this session |
| **Last green stale** | Files changed after your last passing verify command (from Flight Recorder `lastGreen`) |
| **Untracked secrets** | Secret scanner found credentials in untracked file contents (up to 20 files, 64KB each) |

## Core signals (v1)

### Git diff

Uses staged and unstaged diffs plus changed-path lists. Flags large diffs, untracked-only working trees, and dependency manifest changes.

### Audit posture

Reads the **cached** Security Audit report for the active project (does not force a new scan when you open Ready Check). Run Security Audit first if the panel shows "no recent audit."

### Terminal status

Last command exit code from Smart Terminal and open issues in the terminal dock.

### Secrets in diff

Local secret scanner on staged + unstaged diff hunks. Any match → **Blocked**.

### Untracked file inspector (Phase C)

When untracked paths exist, Ready Check scans up to **20 files** (64KB each) and shows a collapsible **Untracked files (N)** section with per-file scan status. Secrets in untracked content → **Blocked** (`untracked-secrets` signal). Actions:

- **Copy untracked summary for AI** — review prompt listing paths and scan status
- **Copy paths list** — plain path list for packer or manual review

### Dependency change explainer

When `package.json` changed, Ready Check compares `HEAD:package.json` vs working tree and lists added/removed/changed deps (prod vs dev). Flags unpinned versions (`*`, `latest`, `file:`, `git:`) and cross-references the lockfile-audit signal when lockfiles changed without audit.

### Regression context

When **Last green stale** is active, use **Copy regression context** to pack MVC context for files changed since the last passing verify (same logic as MCP `get_regression_context`).

### Project context

Stack detection (`unknown` framework + language) and whether the selected folder has a project manifest at its root (`package.json`, `pyproject.toml`, etc.).

## Context health hint

When profile-level context warnings apply (unknown stack, missing AGENTS.md, subfolder not root), Ready Check shows an aggregated count with a pointer to **Prompt Library** or **Context Packer** for details. Informational only — never blocks commit.

## Using the panel

1. Open **Ready Check** from the toolbar or command palette → **Open Ready Check**.
2. Review the status banner and signal chips.
3. Use **Refresh** after fixing issues, running audit/tests, or copying git diff.
4. **Copy review prompt** for an AI-assisted pre-commit review.
5. Jump to **Security Audit**, **Smart Terminal**, or **Copy git diff** as needed.

## Related

- [Session Hub](./session-hub) — flight recorder, pins, handoffs
- [Security Audit](./security-audit) — repo scan + paste AI output risk scanner
- [Smart Terminal](./smart-terminal) — verify commands feed Flight Recorder

## Where it lives in code

| Piece | Path |
|-------|------|
| Aggregation service | `apps/vibebar/src/main/readyCheck/ReadyCheckService.ts` |
| Tri-state + v2 logic (unit tested) | `apps/vibebar/src/main/readyCheck/readyCheckLogic.ts` |
| Panel UI | `apps/vibebar/src/renderer/overlay/panels/ReadyCheckPanel.tsx` |
| Context health helper | `apps/vibebar/src/shared/contextHealth.ts` |
| Flight recorder | `apps/vibebar/src/main/session/FlightRecorderService.ts` |
