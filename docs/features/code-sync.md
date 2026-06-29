# Code Sync

Code Sync mirrors folders from your project into an AI context directory so assistants always see fresh copies of the files you choose.

## At a glance

| | |
|---|---|
| **Opens as** | Floating window (toolbar toggle) |
| **Direction** | One-way: source → destination |
| **Instances** | Up to 16 sync pairs per project |
| **Defaults** | 100 MB max file size, 350 ms debounce |

## Typical setup

| Source | Destination | Why |
|--------|-------------|-----|
| `src/components/` | `AI Context/` | Creates `AI Context/components context/` for UI work with Cursor |
| `docs/` | `AI Context/` | Creates `AI Context/docs context/` for specs and references |
| API routes folder | `AI Context/` | Creates `AI Context/api context/` (or similar) for backend context |

Edit files in the **source** tree. The mirror overwrites destination copies on sync. Do not treat the mirror as the source of truth.

## Multiple instances

Add separate sync pairs for different parts of a monorepo. Each runs independently.

## Works well with

- **[Snip to AI Context](./snip-to-ai-context)** saving PNGs into the same folder tree
- **Session Hub → Sync project context** for `AGENTS.md`, Cursor rules, and AI Context README
- **[Prompt Library](./prompt-library)** templates that reference paths under AI Context

## Tips

- Keep sync destinations out of production build output.
- Use `.gitignore` on `AI Context/` if mirrors and snips should not be committed.
- After large refactors, pause sync, clear stale destination files, then resume.

## Related

- [Install & setup](/guide/getting-started#ai-context-folder-optional)
- [Files & storage](/reference/files-and-storage)
