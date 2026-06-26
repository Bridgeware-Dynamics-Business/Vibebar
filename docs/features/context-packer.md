# Context Packer

Context Packer bundles project files into one markdown prompt on your clipboard, with a rough token estimate and optional secret redaction.

## At a glance

| | |
|---|---|
| **Opens as** | Panel (detachable) |
| **Presets** | Changed files, Tests, Config, Entry points |
| **Token estimate** | Approximately `character count / 4` |
| **Shortcut** | Palette → **Pack changed files** |

## Pack tiers (Phase D)

Context Packer and **Pack changed** support three char budgets:

| Tier | Budget | Best for |
|------|--------|----------|
| **Micro** | 8,000 | Prepare Cursor–scale bootstrap, quick fixes |
| **Standard** | 32,000 | Default handoffs and Fix with Context |
| **Full** | 100,000 | MCP `pack_changed` cap, large refactors |

The panel shows a **Tier** selector and a suggested tier from your current selection size. Pack metadata includes `tier`, `charBudget`, and `usedChars`.

## File tree

Directories load lazily with a short debounce when you expand folders. Large trees show loading indicators.

Select individual files or whole folders, then **Pack & copy**.

## Presets

| Preset | Selects |
|--------|---------|
| **Changed files** | Git-modified paths (staged and unstaged) |
| **Tests** | Test files detected in your project |
| **Config** | Config files (`package.json`, `tsconfig`, etc.) |
| **Entry points** | Main application entry files |

Detection uses the same project profile engine as the Prompt Library.

## Fast paths

Without opening the panel:

- `Ctrl+Shift+P` → **Pack changed files**
- Session Hub → **Pack changed**

## Packer vs Prompt Library

| Use Context Packer when… | Use Prompt Library when… |
|--------------------------|--------------------------|
| The model needs actual file contents | You want a structured task template |
| You are mid-refactor with specific paths | Guardrailed instructions matter more |
| You need to watch token budget | Variables should auto-fill from profile |

## Tips

- **Changed files** pairs well with git diff prompts before a commit.
- Trim selection if the token estimate is large. Models have context limits.
- Detach the panel to keep file picks visible while editing.
- Secrets redact when **Harden prompts** is enabled.

## Related

- [Prompt Library](./prompt-library)
- [Session Hub](./session-hub)
- [Your first session](/guide/first-session)
