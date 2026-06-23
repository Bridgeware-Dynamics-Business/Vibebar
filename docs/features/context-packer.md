# Context Packer

Bundle selected project files into a single paste-ready AI prompt with token estimates and secret redaction.

## Opening the panel

Click **Context Packer** on the toolbar or **`Ctrl+Shift+P`** → **Open Context Packer**.

## File tree

- Lazy-loaded directories with debounced expand
- Loading indicators on large folders
- Select individual files or folders

## Presets

| Preset | Contents |
|--------|----------|
| **Changed files** | Git-modified files (staged + unstaged) |
| **Tests** | Test files detected in your project |
| **Config** | Config files (package.json, tsconfig, etc.) |
| **Entry points** | Main application entry files |

Presets respect your project layout — detection uses the same profile engine as Prompt Library.

## Pack & copy

1. Select files or apply a preset.
2. Review the **token estimate** (approximate).
3. Click **Pack & copy**.

Output is formatted markdown suitable for Cursor chat. Secrets are redacted when guardrails are on.

## Fast path: pack changed only

Without opening the panel:

- **`Ctrl+Shift+P`** → **Pack changed files**
- Session Hub → **Pack changed**

## When to use Packer vs Prompt Library

| Use Context Packer when… | Use Prompt Library when… |
|--------------------------|--------------------------|
| You need raw file contents | You want a structured task template |
| You're mid-refactor with specific files | You want guardrailed instructions |
| Token budget matters (check estimate) | Variables should auto-fill from profile |

## Tips

- Start with **Changed files** before commits — pairs well with git diff prompts.
- Detach the panel to keep file selection visible while editing.
- Large packs may exceed model context — trim selection using the token estimate.

## Related

- [Prompt Library](./prompt-library)
- [Session Hub](./session-hub) — logs pack events
- [Git diff workflow](/guide/first-session#scenario-git-diff-as-a-prompt)
