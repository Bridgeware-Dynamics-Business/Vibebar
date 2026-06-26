# Command palette

The command palette is fuzzy search for almost every VibeBar action. Faster than hunting toolbar buttons once you learn a few names.

## Open

Press `Ctrl+Alt+Shift+P` (also restores the toolbar if it was hidden).

Type to filter. Use ↑/↓ to move, Enter to run, Esc to close. Search debounces after 150 ms.

Placeholder text: **Type a command…**

## Actions

### Recent projects (dynamic)

Up to 10 entries like **Switch project: my-app**, one per recent folder.

### Fixed commands

| Command | What it does |
|---------|----------------|
| **Switch project…** | Native folder picker |
| **Open Session Hub** | Opens Session Hub panel |
| **Copy session handoff** | Copies handoff (needs ≥1 pinned item) |
| **Sync / view AI docs** | Opens Session Hub (AI docs section) |
| **Audit config** | Opens Security Audit panel at config section |
| **Run security audit** | Opens Security Audit panel |
| **Open Smart Terminal** | Toggles terminal window |
| **Copy git diff prompt** | Staged + unstaged diff as prompt |
| **Pack changed files** | Git-changed files to clipboard |
| **Open Prompt Library** | Opens library panel |
| **Snip to AI context** | Starts screen snip |
| **Open Context Packer** | Opens packer panel |
| **Open Notes** | Opens notes panel |
| **Open Settings** | Opens settings panel |

## Cursor conflict

Cursor uses `Ctrl+Shift+P` for its own palette. VibeBar defaults to `Ctrl+Alt+Shift+P` to reduce conflicts. You can disable VibeBar global hotkeys in Settings and use the toolbar instead.

## No global shortcut for these

Prompt Library, Security Audit, Session Hub, Context Packer, Notes, and Snip have no dedicated hotkeys. Search the palette by name.

## Related

- [Keyboard shortcuts](/reference/hotkeys)
- [Toolbar & tools](/features/)
