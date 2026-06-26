# What is VibeBar?

VibeBar is a Windows desktop app that floats at the edge of your screen while you work. It stays out of the way until you need it, then helps you talk to your AI assistant with the right context already in hand.

You still code in Cursor (or your editor of choice). VibeBar does not replace that. It prepares prompts, scans your repo, packs files, and tracks your session so the paste into chat is useful on the first try.

## Who it is for

VibeBar is built for developers who:

- Use AI assistants daily and want fewer back-and-forth messages
- Care about security and consistent prompting habits
- Work on real projects with git, tests, and team conventions
- Want a small toolbar instead of another full IDE panel

## What you can do

| Need | Tool |
|------|------|
| A good starting prompt | [Prompt Library](/features/prompt-library) |
| Security issues in the repo | [Security Audit](/features/security-audit) |
| Check if changes are safe to commit | [Ready Check](/features/ready-check) |
| Raw file content for the model | [Context Packer](/features/context-packer) |
| Remember what you did this session | [Session Hub](/features/session-hub) |
| Run tests and fix failures | [Smart Terminal](/features/smart-terminal) |
| Capture a UI bug visually | [Snip to AI Context](/features/snip-to-ai-context) |
| Keep assistant docs in the repo | [Code Sync](/features/code-sync) + `AI Context/` folder |
| Let Cursor read your session directly | [Cursor Agent / MCP server](/features/mcp-server) |

## How it fits your day

1. Pick a project from the toolbar.
2. Code as usual in Cursor.
3. When you need help, copy a prompt or pack context from VibeBar.
4. Paste into Cursor chat and implement the fix.
5. Verify in Smart Terminal.
6. Pin important items in Session Hub and copy a handoff when you are done.

That loop is the whole product. Everything else supports it.

## Platform and license

VibeBar runs on **Windows 10 and later**. macOS and Linux are not supported today.

The project is **source-available** under the PolyForm Internal Use License. You can read the code, use it, and contribute back. It is not open source in the OSI sense. See [Contributing](/contribute/contributing) and the [LICENSE](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/LICENSE) for details.

## Next steps

- [Install & setup](/guide/getting-started)
- [Toolbar & tools overview](/features/)
- [Why VibeBar exists](/philosophy/whats-different)
