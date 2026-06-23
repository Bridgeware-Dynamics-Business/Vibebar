# Notes

Notes gives you lightweight Markdown files inside your project, with task lists and optional pop-out windows.

## At a glance

| | |
|---|---|
| **Opens as** | Panel (detachable) |
| **Folder** | `<project>/Notes/` |
| **Index** | `<project>/Notes/.vibebar-notes.json` |
| **Default new note title** | Session log |

## First-time setup

When you open Notes on a new project, VibeBar asks for a project name and whether to add `Notes/` to `.gitignore` (on by default).

## Writing notes

Each note is a `.md` file. Use standard Markdown task lists:

```markdown
- [ ] Fix auth redirect
- [x] Baseline audit finding #12
```

Checklist progress shows in the note list sidebar.

## Pop-out windows

Open a note in a sticky always-on-top window while you keep coding. Pop-out bounds persist like other VibeBar windows.

## Save to note

From Security Audit findings or Session Hub / terminal entries, use **Save to note** to append a summary. Handy for PR checklists or fix backlogs.

## Tips

- Notes are plain files on disk. Edit them outside VibeBar anytime.
- Name notes by feature, sprint, or date so handoffs stay readable.
- Notes are separate from `.vibebar/session.json` session timeline data.

## Related

- [Session Hub](./session-hub)
- [Security Audit](./security-audit)
- [Files & storage](/reference/files-and-storage)
