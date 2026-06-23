# Snip to AI Context

Capture a screenshot region and save it to your AI Context folder with a copy-ready prompt.

## How it works

1. Click **Snip to AI Context** (crop icon) on the toolbar, or **`Ctrl+Shift+P`** → **Snip to AI context**.
2. Your display freezes briefly with a selection overlay.
3. Drag a box over the area you want to capture.
4. VibeBar saves a **PNG** to `<project>/AI Context/` (or configured folder).
5. A prompt describing the snip is copied to your clipboard.

Paste into Cursor when reporting UI bugs, layout issues, or visual regressions.

## Important distinction

This is **screen capture**, not smart code selection. It does not:

- Parse selected source code
- Pull imports, callers, or usages
- Connect to your IDE's selection

For code context, use [Context Packer](./context-packer) or [Prompt Library](./prompt-library).

## Best for

- Visual bugs and layout misalignment
- Error dialogs and toast messages
- Design review before/after screenshots
- Anything where a picture helps the AI more than text

## Tips

- Ensure a project is selected so files land in the right `AI Context/` folder.
- Name or organize snips in AI Context if you capture many per session.
- Combine with a text prompt: paste the snip prompt, then add steps to reproduce.

## Related

- [Code Sync](./code-sync)
- [Real-world workflows](/workflows/real-world-workflows#report-a-ui-bug)
