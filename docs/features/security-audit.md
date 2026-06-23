# Security Audit

Read-only static security scanning with copy-paste fix prompts, optional supply-chain checks, and export formats.

## What it checks

The audit engine runs against your project files (not a single selected function). Rules cover patterns like:

- Injection risks (SQL, command, XSS)
- Authentication and authorization gaps
- Sensitive data exposure
- Insecure dependencies (when npm audit is enabled)
- Cryptography and secret handling
- Input validation issues

Findings map to CWE/OWASP references where applicable. Each finding includes a **fix prompt** and often a **test prompt**.

## Using the panel

1. Open **Security Audit** from the toolbar.
2. Review the **score and grade** summary.
3. Filter by severity, rule, or file path.
4. Click **Copy fix prompt** on any finding.
5. Paste into Cursor and implement the fix.

### Auto-rescan

Configure an auto-rescan interval in the panel. Scans coalesce when multiple triggers fire — you won't get overlapping runs.

### Paste-to-scan

Paste suspicious text (e.g. from a log or chat) into the paste scanner to check for secrets or dangerous patterns before committing.

## npm audit integration

When enabled, VibeBar merges `npm audit` advisories into the findings list alongside static rule results. This is optional and requires npm in your environment.

## Baselines and rule toggles

Accept a finding as known risk to baseline it — future scans skip it until the code changes.

Rule toggles persist in **`.vibebar-audit.json`** at the project root. Open **Audit config** from the command palette to jump to configuration.

## Export

Export findings as:

- **SARIF** — for CI or GitHub Advanced Security ingestion
- **Markdown** — for PR descriptions or team review

The Smart Terminal audit dock can mirror findings when the terminal is open.

## Smart Terminal mirror

When Smart Terminal is open, audit results can appear in the terminal dock for quick copy without switching panels.

## Workflow tips

**Before a PR:** Run audit → copy fix prompts for critical/high findings → verify with `npm test` in Smart Terminal.

**After dependency updates:** Enable npm audit → rescan → baseline false positives you accept.

**Team consistency:** Commit `.vibebar-audit.json` rule toggles; keep accepted-risk baselines local or team-agreed.

## What it is not

- Not a replacement for penetration testing or runtime monitoring
- Not separate "performance" or "logging" audit buttons — use [Prompt Library](./prompt-library) templates for those concerns
- Not IDE selection-based — it scans the repo statically

## Related

- [Smart Terminal](./smart-terminal) — verify fixes and mirror findings
- [Session Hub](./session-hub) — audit events on the timeline
- [Notes](./notes) — **Save to note** from findings
