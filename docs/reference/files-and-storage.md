# Files & storage

Where VibeBar reads and writes data on disk.

## Project files (inside your repo)

| Path | Purpose | Git |
|------|---------|-----|
| `.vibebar/session.json` | Session timeline, pins, stored prompt text | Ignored (via `.gitignore`) |
| `.vibebar-audit.json` | Audit rule toggles and baselines | Often committed by teams |
| `Notes/` | Markdown notes | Optional ignore on setup |
| `Notes/.vibebar-notes.json` | Notes index | Same as Notes folder |
| `AI Context/` | Snips, sync mirrors, assistant docs | Your choice |
| `AGENTS.md` | Agent instructions (handoff excerpts) | Usually committed |
| `.cursor/rules/` | Cursor rules (status shown in Session Hub) | Usually committed |

Do not confuse `.vibebar/` (session only, git-ignored) with `.vibebar-audit.json` at the project root (audit tuning, committable).

## AI Context folder names

VibeBar creates **`AI Context`** by default. It also recognizes folders named `ai-context`, `ai_context`, `aicontext`, `.ai-context`, `.ai`, `context`, `Context`, and `.context`.

## App config (outside the project)

User settings, custom prompts, recent projects, Code Sync pairs, and panel/window bounds live in Electron **userData**, typically:

`%APPDATA%/vibebar/config.json` on Windows

Custom prompts are **not** stored inside the project repo.

## Session storage details

- Timeline display caps at **100** entries in the UI (older entries still on disk).
- Stored prompt text per entry: up to **8192** characters.
- Handoff `AGENTS.md` excerpt: up to **2048** characters.
- Prompt Library history keeps up to **50** entries; **Recent** chips show **8**.

## Security audit limits

Per scan: up to **1200** files, **200 KB** max per file. Warns if truncated.

## Code Sync limits

Up to **16** sync instances. Default **100 MB** max file size, **350 ms** debounce.

## Related

- [Session Hub](/features/session-hub)
- [Security Audit](/features/security-audit)
- [Notes](/features/notes)
