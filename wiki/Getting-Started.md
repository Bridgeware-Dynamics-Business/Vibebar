# Getting Started with VibeBar

You'll be up and running in about 5 minutes. Then you'll wonder how you ever lived without it.

## Installation

### Requirements

- Windows 10 or later (macOS and Linux coming soon)
- Node.js 16+
- Any AI coding environment (Cursor, Claude Code, etc.)

### Step 1: Download and Install

Head to the [releases page](https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases) and grab the latest version.

```
1. Download the installer
2. Run it
3. Choose your installation location
4. Let it finish
```

That's it. No complex setup. No environment variables to fiddle with.

### Step 2: First Launch

When you launch VibeBar for the first time:

1. A floating toolbar appears above your taskbar
2. It scans your current project
3. You'll see a quick setup dialog asking which folders you work in most

Point it to your main projects folder. It learns your workspace from there.

## Initial Setup (2 minutes)

### Connect Your AI Tools

VibeBar works alongside your existing setup. It doesn't replace anything.

In the settings menu, you can optionally connect:

- Cursor API key (if you want direct integration)
- Local LLM paths (for Ollama, LM Studio, etc.)
- Custom prompt paths

You don't need to set these up to start using VibeBar. The basic tools work out of the box.

### Choose Your Workflow

VibeBar adapts to how you work. Quick setup asks:

1. **Do you prefer quick prompts or detailed context?** - Sets your default prompt depth
2. **Which folders should VibeBar watch?** - Points it to your main projects
3. **Terminal preference** - Integrated, external, or none

These can all be changed later. Pick what feels right and move on.

## Your First Session

Let's walk through a realistic scenario.

### The Situation

You're in your codebase. You notice something. Maybe it's a security concern. Maybe there's error handling missing. Maybe you see a performance opportunity.

You know what the issue is. Explaining it to your AI is the work.

### The VibeBar Approach

1. **Click the audit button** on the toolbar
2. **Select what kind of review** you want (security, performance, error handling, logging, health check)
3. **VibeBar scans your current file** and understands the context
4. **A prompt appears that's already tailored** to your code, your patterns, your project

The prompt understands:

- Your tech stack
- Your coding patterns
- Your project structure
- Common issues in your codebase
- Similar code patterns elsewhere

You paste that prompt into your AI (or VibeBar sends it directly if you configured integration). The AI gets back the right context and gives you better results.

That's it. That's the workflow.

### Example Walk-Through

Let's say you're looking at a user authentication function and something feels off.

**Old workflow:**
- Copy the function
- Open your AI chat
- Write a custom prompt trying to explain what feels wrong
- Paste the code
- Wait for a response
- Realize the AI didn't understand your project's authentication pattern
- Refine and try again

**VibeBar workflow:**
- Click the security audit button
- Select your function (or it auto-selects what's visible)
- VibeBar generates a prompt that already knows:
  - This is auth code (from filename and function names)
  - Your project uses JWT tokens (it found your auth config)
  - Your common patterns (it scanned your other auth functions)
  - Your current security standards (from your other security decisions)
- One click copies it to your AI or sends directly if integrated
- AI responds with context about *your* patterns, not generic advice

### Basic Usage Patterns

#### The Prompt Library

The toolbar has a prompt button. Click it and you see prompts organized by:

- **By Task**: Generate tests, write docs, refactor, add logging, etc.
- **By Context**: These prompts automatically load your project context
- **By Pattern**: Prompts for common patterns in your specific tech stack

Pick one, customize if needed, send to your AI.

#### The Snipping Tool

Sometimes you need to grab a specific piece of context. The snipping tool:

1. Let's you select code visually
2. Understands it in context
3. Adds relevant surrounding code automatically
4. Adds usage examples if they exist
5. Copies it formatted for your AI

#### The Terminal Window

Right below the toolbar, a terminal integration shows:

- Your last few terminal commands
- Errors from recent runs
- Quick access to rebuild/restart commands
- AI debugging suggestions based on error logs

Click "Debug" and VibeBar generates a prompt with:

- The actual error
- Surrounding context
- Relevant code
- What you tried

Send to your AI. Get relevant debugging help.

#### Project Analysis

The "Analyze" button scans your current project and tells you:

- Tech stack detected
- Architecture pattern
- Common issues found
- Security concerns
- Performance opportunities
- Testing coverage
- Documentation gaps

This powers all the context-aware features. It runs automatically but you can trigger it manually.

## Recommended Workflow

Here's how experienced VibeBar users tend to work:

### Morning Setup (once per session)

1. Launch VibeBar (it auto-launches if you have it set to)
2. Point it to your current project if it hasn't auto-detected
3. Let it scan (takes 10-30 seconds depending on project size)
4. You're ready

### During Development

1. **Spot something**: A potential bug, missing error handling, security concern, performance opportunity
2. **Click the relevant audit**: Security, Performance, Error Handling, Logging
3. **Get a smart prompt** that understands your code
4. **Send to your AI**
5. **Get better results**

### Before Commits

1. Click "Health Check" for the files you're committing
2. VibeBar generates an audit prompt including:
   - Security review
   - Error handling review
   - Logging review
   - Performance check
3. Send to your AI for a final review
4. Address any concerns before committing

### When Confused About New Code

1. Use the "Explain" prompt from the library
2. VibeBar loads the file and surrounding context
3. Gets an explanation that connects to your actual patterns
4. Understand faster

## Configuration

VibeBar works great out of the box, but you can customize:

### Settings Menu

- **Prompt style**: Aggressive (detailed), Balanced, or Minimal
- **Context depth**: How much surrounding code to include
- **Auto-scan**: Frequency for project analysis
- **Keyboard shortcuts**: Customize what each button does
- **Integration preferences**: Which AI tools to integrate with
- **Privacy**: Local scanning only vs. cloud features

### Keyboard Shortcuts

The toolbar has buttons, but keyboard shortcuts are faster:

- `Ctrl+Shift+V` - Open VibeBar menu
- `Ctrl+Shift+A` - Run quick audit on selection
- `Ctrl+Shift+P` - Open prompt library
- `Ctrl+Shift+S` - Snipping tool

These are customizable.

## Next Steps

Now that you're up and running:

1. **Try an audit** on some code that's been bugging you
2. **Explore the prompt library** - there are templates for tons of situations
3. **Read [Real World Workflows](Real-World-Workflows)** - see VibeBar in action
4. **Learn [What Makes VibeBar Different](Whats-Different)** - understand the philosophy

## Troubleshooting

### VibeBar isn't detecting my project

1. Check that you've pointed it to the right folder in settings
2. Make sure it's a folder with actual code (not just text files)
3. Restart VibeBar (sometimes it helps)

See [Troubleshooting](Troubleshooting) for more help.

### The prompts don't feel tailored

1. Let VibeBar scan your project fully (watch the bottom right status)
2. It gets smarter as it learns your patterns
3. You can manually trigger a deep scan in settings

### I'm not seeing the terminal integration

1. Make sure you have a terminal open in your workspace
2. VibeBar looks for active terminals in your current IDE
3. Click the terminal icon to connect it manually

### Keyboard shortcuts aren't working

1. Check that VibeBar is set to run on startup
2. Some IDEs capture hotkeys - customize them in settings
3. You can always use the button menu instead

---

Ready to dive deeper? Check out [Core Features](Core-Features) to see everything VibeBar can do.
