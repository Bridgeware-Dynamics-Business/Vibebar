# Code Sync

One-way folder mirroring into your AI Context folder so assistants always see up-to-date project slices.

## What it does

Code Sync watches a **source folder** in your project and mirrors files to a **destination** (typically `AI Context/` or a subfolder). Multiple sync instances can run per project.

Open **Code Sync** from the toolbar (folder-sync icon).

## Typical setup

| Source | Destination | Why |
|--------|-------------|-----|
| `src/components/` | `AI Context/components/` | UI work with Cursor |
| `docs/` | `AI Context/docs/` | Assistant-readable specs |
| API route folder | `AI Context/api/` | Backend context |

Sync is **one-way** — changes in the destination are overwritten on the next sync. Edit source files in your repo, not the mirror.

## Multiple instances

Add separate sync pairs for different parts of a monorepo. Each instance runs independently.

## Pair with other context tools

- **[Snip to AI Context](./snip-to-ai-context)** saves screenshots into the same folder tree
- **Session Hub → Sync / view AI docs** surfaces AGENTS.md and Cursor rules alongside synced files
- **[Prompt Library](./prompt-library)** templates can reference paths under AI Context

## Tips

- Keep sync destinations out of production build paths.
- Use `.gitignore` on `AI Context/` if screenshots and mirrors shouldn't be committed.
- After large refactors, pause sync, clear destination, resume to avoid stale files.

## Related

- [Getting started — AI Context folder](/guide/getting-started#optional-ai-context-folder)
- [Snip to AI Context](./snip-to-ai-context)
