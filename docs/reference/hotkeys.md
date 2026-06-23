# Keyboard shortcuts

VibeBar registers three global shortcuts on Windows. They work while the app is running and **Global hotkeys** is enabled in Settings.

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+H` | Hide or show the floating toolbar |
| `Ctrl+Shift+P` | Open the [command palette](/features/command-palette) |
| `Ctrl+Shift+T` | Toggle [Smart Terminal](/features/smart-terminal) |

`Ctrl+Shift+P` also restores the toolbar if it was hidden.

## Enable or disable

**Settings → Behavior → Global hotkeys** (default: on)

When off, use the system tray or toolbar buttons instead.

Hotkeys **cannot be remapped** in the app today. If registration fails because another app owns the combo, VibeBar logs a warning at startup.

## Toolbar hidden?

1. `Ctrl+Shift+H`
2. System tray → **Show toolbar**
3. **Settings → Show toolbar** (also resets dock position)

## Cursor uses the same palette shortcut

Cursor maps `Ctrl+Shift+P` to its own command palette. On some setups both apps compete. If VibeBar's palette does not open, focus the toolbar first, disable VibeBar hotkeys, or change Cursor's binding.

## No dedicated hotkeys for

Prompt Library, Security Audit, Session Hub, Context Packer, Notes, and Snip. Open the palette and type the tool name.

## Related

- [Command palette](/features/command-palette)
- [Settings](./settings)
