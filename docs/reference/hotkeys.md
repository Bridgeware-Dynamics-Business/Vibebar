# Keyboard shortcuts

VibeBar registers three global hotkeys on Windows. They work when the app is running and hotkeys are enabled.

## Default shortcuts

| Shortcut | Action |
|----------|--------|
| **`Ctrl+Shift+H`** | Hide or show the floating toolbar |
| **`Ctrl+Shift+P`** | Open the [command palette](/features/command-palette) |
| **`Ctrl+Shift+T`** | Toggle [Smart Terminal](/features/smart-terminal) |

## Enabling and disabling

**Settings → Behavior → Global hotkeys**

When disabled, use the system tray menu (**Show toolbar**) or click the toolbar if still visible.

Hotkeys are **not rebindable** in the current version. If they conflict with Cursor or another app, disable global hotkeys and use the toolbar or tray.

## Recovery: toolbar hidden

1. **`Ctrl+Shift+H`** to toggle visibility, or
2. System tray → **Show toolbar**, or
3. **Settings → Show toolbar** (also resets dock position)

## IDE conflicts

Cursor uses **`Ctrl+Shift+P`** for its own command palette. On some setups both may register — if VibeBar's palette doesn't open, try clicking the toolbar first or temporarily disable one app's binding.

## Not global hotkeys

These actions have **no** default global shortcut (use toolbar or palette):

- Prompt Library
- Security Audit
- Session Hub
- Context Packer
- Snip to AI Context
- Notes

Search the palette (**`Ctrl+Shift+P`**) for any of the above by name.

## Related

- [Command palette](/features/command-palette)
- [Settings](./settings)
