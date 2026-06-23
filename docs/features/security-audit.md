# Security Audit

Security Audit scans your project files read-only and gives you copy-paste fix prompts. It never executes your code.

## At a glance

| | |
|---|---|
| **Opens as** | Panel (detachable), or terminal dock if Smart Terminal is already open |
| **Scans** | Up to ~1200 JS/TS/Vue/Svelte/Astro/Python files per run (200 KB max per file) |
| **Rules** | ~29 static rules plus optional `npm audit` advisories |
| **Output** | Fix prompts, test prompts, SARIF, Markdown |

## What it finds

The engine looks for patterns related to:

- Injection (SQL, command, XSS)
- Auth and access control gaps
- Secrets and sensitive data exposure
- Weak crypto or config mistakes
- Input validation issues
- Supply chain advisories (when npm audit is enabled)

Each finding includes severity (critical through low), confidence, CWE references where applicable, a **fix prompt**, and often a **test prompt**. Runs produce a score and letter grade (A through F).

## Using the panel

1. Open **Security Audit** from the toolbar or palette → **Run security audit**.
2. Review the summary and finding list.
3. Filter by severity, confidence, new-only, category, or search text.
4. **Copy fix prompt** or **Copy test prompt** on any row.
5. Paste into Cursor and implement.

The panel auto-runs when opened. You can set an **auto-scan interval** (minimum 3 seconds). Overlapping scans coalesce so you do not get pile-ups.

### Paste scanner

Paste suspicious text (from a log, chat, or snippet) into the paste scanner for a one-off secret or pattern check before you commit.

### Audit config

Rule toggles and accepted-risk baselines live in the **Audit config** section inside this panel. Palette → **Audit config** opens the same panel scrolled to that section.

Settings persist in `.vibebar-audit.json` at the project root. Teams often commit rule toggles; baselines are usually local or team-agreed.

### Accept risk

**Accept risk** on a finding baselines its fingerprint. Future scans skip it until the code changes.

## npm audit

When enabled and a lockfile is present, VibeBar merges `npm audit` advisories into the findings list alongside static rule results. Requires npm in your environment.

## Export and bulk copy

- **Export SARIF 2.1.0** for CI or GitHub Advanced Security
- **Export Markdown** for PRs or review notes
- **Copy all / filtered as one prompt** for batch review in Cursor

## Smart Terminal integration

- Click **Smart Terminal** in the audit panel to open the terminal and present findings there.
- If Smart Terminal is **already open**, clicking **Security Audit** on the toolbar sends results to the terminal audit dock instead of keeping the panel open.
- Quiet mirroring also happens on some scan paths when the terminal is open.

## Workflow ideas

**Before a PR:** Scan, copy fix prompts for critical/high items, run tests in Smart Terminal, baseline accepted risks.

**After `npm update`:** Enable npm audit, rescan, copy fix prompts for advisories that need code changes.

## What it is not

- Not penetration testing or runtime monitoring
- Not a performance or logging scanner (use Prompt Library templates for those topics)
- Not scoped to a single highlighted function in your IDE; it scans the repo statically

## Related

- [Smart Terminal](./smart-terminal)
- [Session Hub](./session-hub)
- [Notes](./notes) (Save to note from a finding)
