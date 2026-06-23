# Settings

Open **Settings** from the toolbar (gear icon, pinned end) or the command palette.

## Toolbar missing?

**Show toolbar** — restores visibility and resets dock position to default.

## Monitors

Control which displays show the floating toolbar:

- Per-monitor toggles
- **Show on all** / **Primary only** shortcuts

Same pattern for the **Error Console** (bottom-left diagnostic window on selected monitors).

## Dock position

Place the toolbar on **Left**, **Top**, or **Right** edge of the screen.

## Behavior

| Setting | Default | Effect |
|---------|---------|--------|
| **Harden prompts** | On | Guardrails + secret redaction on copy |
| **Launch on startup** | Off | Start VibeBar with Windows |
| **Global hotkeys** | On | Register `Ctrl+Shift+H/P/T` |

**Harden prompts** also appears as a per-panel toggle in Prompt Library.

## Quick Launch

Configure apps on the toolbar launch cluster:

- Show/hide **Cursor**, **Codex**, and custom entries
- Set executable path per app
- Add or remove custom launchers

Quick Launch opens the app scoped to your **current project path**.

## Footer

**Quit VibeBar** — closes the app (toolbar power button shows a confirmation first).

## What is not in Settings (today)

These are not configurable in the current app:

- Custom keyboard shortcut rebinding
- Prompt style presets (minimal vs detailed)
- Direct AI API keys or send-to-model integration
- Auto-scan frequency sliders
- Privacy / cloud toggles (scanning is local)

## Error Console

When enabled on a monitor, captures renderer errors with redaction for debugging. Configure monitors alongside the toolbar in Settings.

## Related

- [Keyboard shortcuts](./hotkeys)
- [Prompt Library — guardrails](/features/prompt-library#guardrails)
