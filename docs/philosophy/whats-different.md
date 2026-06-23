# Why VibeBar exists

Cursor, Copilot, Claude Code, and local models are good at writing code. The hard part is often the conversation: getting the model to understand your project on the first message.

VibeBar focuses on that communication layer. It sits beside your editor and prepares context before you paste.

## The back-and-forth problem

A familiar pattern:

```
You: "Can you fix this bug?"
AI:  "What bug?"
You: "The function returns null sometimes."
AI:  "Can I see the code?"
You: [pastes a snippet]
AI:  "This looks fine to me."
You: "It breaks when the API is slow."
AI:  [finally has enough to help]
```

None of those messages is unreasonable. Together they waste time. VibeBar front-loads file paths, stack hints, diffs, and scan results so the first paste is closer to complete.

## What VibeBar does differently

### Background project detection

When you pick a folder, VibeBar detects language, framework, test runner, and related signals. That feeds the Prompt Library, Context Packer presets, and terminal project commands. There is no separate "Analyze project" button.

### Copy, then paste in Cursor

VibeBar does not replace your AI editor or hold API keys for you. It puts guardrailed text on the clipboard. You paste where you already work. Quick Launch can open Cursor on your project from the copy toast.

### Tools for specific jobs

| Tool | Problem it targets |
|------|-------------------|
| Prompt Library | "I do not know how to ask for this." |
| Context Packer | "The model needs these exact files." |
| Security Audit | "Find issues and phrase fixes correctly." |
| Session Hub | "I am losing thread across prompts." |
| Smart Terminal | "Turn this error output into a useful prompt." |
| Git diff prompt | "Summarize what changed without manual diff paste." |

### Guardrails by default

Security-related templates can attach rules like `no-secrets` and `parameterized-queries`. With **Harden prompts** on, secrets are redacted before copy. For a security-focused app, that is intentional.

## A concrete example

Fixing a vulnerability without VibeBar often takes many messages: paste code, explain your DB layer, mention audit logging, clarify constraints.

With VibeBar:

1. Run Security Audit.
2. Copy fix prompt on the finding.
3. Paste once (file context and rule ID included).
4. Verify in Smart Terminal.

## Source-available, not open source

VibeBar is **source-available** under the PolyForm Internal Use License. You can read the code, run it, and contribute improvements back. Forking to submit PRs is allowed. Distribution or competing products need written permission. See [Contributing](/contribute/contributing).

The goal is a tool shaped by real workflows, not a generic chat wrapper.

## Next

[Toolbar & tools](/features/) · [Your first session](/guide/first-session)
