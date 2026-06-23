# What Makes VibeBar Different

There are many AI coding tools — Copilot, Cursor, Claude Code, ChatGPT, local models. They're all useful. VibeBar exists for a different layer: **the communication between you and the model**.

## The prompting problem

Most developers are great at code and mediocre at prompting — not from lack of intelligence, but because prompting is a new skill nobody taught.

The classic loop:

```
You: "Can you fix this bug?"
AI:  "What bug?"
You: "The function returns null sometimes"
AI:  "I need to see the code"
You: [pastes code]
AI:  "This looks okay to me"
You: "But it breaks when the API is slow"
AI:  [finally understands]
```

Three messages before the AI has enough context. VibeBar's job is to front-load that context so the first message works.

## How VibeBar solves it

### Project awareness (automatic)

When you select a project, VibeBar silently detects:

- Language and framework
- Test runner and package manager signals
- Monorepo layout
- Common config files

This powers Prompt Library variables, Context Packer presets, and terminal project commands. You don't click "Analyze" — detection runs in the background.

### Copy-first, paste-in-Cursor workflow

VibeBar does not replace your AI editor. It prepares **clipboard-ready prompts** with guardrails and redaction, then you paste into Cursor (or any chat). Quick Launch opens Cursor on your project when the copy toast offers it.

That keeps you in control of what the model sees and avoids API key sprawl.

### Purpose-built tools, not generic chat

| Tool | Communication problem it solves |
|------|----------------------------------|
| **Prompt Library** | "I don't know how to ask for this" |
| **Context Packer** | "The model needs these exact files" |
| **Security Audit** | "Find issues and phrase fixes correctly" |
| **Session Hub** | "I'm losing context across prompts" |
| **Smart Terminal** | "Turn this error into a useful prompt" |
| **Git diff prompt** | "Explain what changed without manual diff paste" |

### Guardrails by default

Security-sensitive categories attach guardrails (`no-secrets`, `parameterized-queries`, etc.). Optional **Harden prompts** redacts secrets on copy. For a security-focused tool, that's non-negotiable.

## Real comparison: fixing a vulnerability

**Without VibeBar:** six messages to explain code, database setup, logging patterns, and constraints.

**With VibeBar:**

1. Run Security Audit
2. Copy fix prompt on the finding
3. Paste once — prompt includes file context, rule ID, and project-aware instructions
4. Implement and verify in Smart Terminal

## Why this matters

Time saved isn't just fewer messages:

- **Focus** — stay in code, not context-switching to explain
- **Accuracy** — model gets the full picture immediately
- **Consistency** — prompts follow your stack and guardrails
- **Learning** — you see what good context looks like

## Source-available, community-shaped

VibeBar is **source-available** — you can read the code, use it, and contribute improvements back. See [Contributing](/contribute/contributing) and the [LICENSE](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/LICENSE) for terms.

The goal is a tool shaped by real vibe coding workflows, not a generic AI wrapper.

---

Next: [Feature map](/features/) — everything you can do today
