# Snip to AI Context

Snip captures a region of your screen, saves it as a PNG in your AI Context folder, and copies a vision prompt to the clipboard.

## At a glance

| | |
|---|---|
| **Trigger** | Toolbar **Snip to AI Context** or palette → **Snip to AI context** |
| **Requires** | A selected project |
| **Saves** | `snip-YYYYMMDD-HHMMSS.png` (or a safe custom name) |
| **Output** | PNG file + clipboard prompt |

## How to snip

1. Select your project.
2. Start snip from the toolbar or command palette.
3. The screen freezes briefly. Drag a box over the area you want.
4. VibeBar saves the PNG and copies a prompt describing the capture.

Paste into Cursor when reporting layout bugs, visual regressions, or error dialogs.

::: warning Screen capture, not code selection
Snip does not read your IDE selection, imports, or call graph. For code context, use [Context Packer](./context-packer) or [Prompt Library](./prompt-library).
:::

## Best uses

- Misaligned UI or broken layouts
- Toast messages and modal text
- Before/after screenshots for design review
- Anything where a picture helps more than a text description

## Tips

- VibeBar creates the AI Context folder if needed before saving.
- Add reproduction steps in the same Cursor message after pasting the snip prompt.
- Organize snips in subfolders under AI Context if you capture many per session.

## Related

- [Code Sync](./code-sync)
- [Everyday patterns](/workflows/real-world-workflows)
