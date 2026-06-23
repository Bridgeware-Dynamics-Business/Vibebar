# Core Features

Everything VibeBar can do for you. Pick a section and dive in.

## Prompt Library

Your starting point for almost everything.

### What It Is

A organized collection of prompts ready to use. Click, customize if needed, send to your AI.

### How It Works

The library organizes prompts by:

**By Task**
- Generate unit tests
- Write documentation
- Refactor code
- Add error handling
- Add logging
- Optimize performance
- Create API docs
- Fix security issues
- Add type safety

**By Pattern** (Language/Framework Specific)
- React patterns
- Node.js patterns
- Database patterns
- API patterns
- Authentication patterns
- Error handling patterns

**By Context** (Automatically Loaded)
- Your tech stack
- Your project structure
- Your coding standards
- Your recent patterns
- Similar code examples

### Why This Matters

The best prompt is one you don't have to write. Pick from the library, and you're 80% there. The remaining 20% is your specific customization.

### Example Uses

**Generate Tests**
- Click "Unit Tests" from the library
- Select your function
- VibeBar loads:
  - Your testing framework (Vitest, Jest, Pytest, etc.)
  - Your test patterns
  - Similar tests you've written
  - Any mocking patterns you use
- Paste the generated prompt to your AI
- Get tests that match your standards

**Write Documentation**
- Click "API Documentation"
- Select your endpoint
- VibeBar loads:
  - Your doc style
  - Your parameter patterns
  - Your response formats
  - Examples from similar endpoints
- Get docs formatted exactly like your other docs

**Optimize Performance**
- Click "Performance Review"
- Select code section
- VibeBar loads:
  - Your previous optimizations
  - Performance standards in your codebase
  - Similar patterns that are optimized
  - Metrics you care about
- Get specific recommendations, not generic ones

---

## Code Auditing

The heart of VibeBar. One click, get comprehensive reviews.

### Security Audits

Scans for vulnerabilities and security patterns.

**What It Checks**

- SQL injection vulnerabilities
- XSS vulnerabilities
- CSRF protection
- Authentication and authorization
- Sensitive data handling
- Dependency vulnerabilities (when applicable)
- Encryption and hashing
- API security
- Input validation

**How It Works**

1. Click the security audit button
2. Select a file or function (or it auto-selects what's visible)
3. VibeBar scans it and surrounding code
4. Generates a prompt that includes:
   - The code in question
   - Your existing security patterns
   - Security standards in your codebase
   - Relevant parts of your auth/data handling systems
5. Copy to your AI
6. Get security-focused advice

**Real Example**

You have a user API that handles passwords. Click the security audit. VibeBar loads:
- Your password handling code
- Your hashing pattern (bcrypt? Argon2?)
- Your rate limiting
- Your session management
- Similar secure operations in your codebase

The prompt goes to your AI with all this context. The AI catches that you forgot to validate password length, but knows how you handle validation elsewhere. Better advice, immediately.

### Performance Audits

Finds performance problems and optimization opportunities.

**What It Checks**

- N+1 query patterns
- Unnecessary renders (in frontend code)
- Memory leaks
- Blocking operations
- Inefficient algorithms
- Cache opportunities
- Bundle size issues
- Database query efficiency

**How It Works**

Same as security audits, but focused on performance:

1. Click performance audit
2. Select code
3. VibeBar includes:
   - The code
   - Your performance standards
   - How you've optimized elsewhere
   - Your monitoring/profiling approach
   - Similar code that's been optimized

**Real Example**

You're querying users and their orders. Click performance audit. VibeBar loads:
- Your query
- Your database schema
- Other queries you've optimized
- Your pagination pattern
- Your caching strategy

The AI catches the N+1 query problem and suggests a solution that matches your actual patterns.

### Error Handling Audits

Ensures errors are caught and handled appropriately.

**What It Checks**

- Uncaught exceptions
- Unhandled promise rejections
- Missing try-catch blocks
- Insufficient error context
- Missing user feedback on errors
- Inadequate error logging
- Missing validation

**How It Works**

1. Click error handling audit
2. Select code
3. VibeBar includes:
   - The code
   - Your error handling patterns
   - How you format error messages
   - Your error logging approach
   - Similar code with good error handling

**Real Example**

You have an async function that could fail. Click error handling audit. VibeBar loads:
- Your function
- How you handle errors elsewhere
- Your error message format
- Your logging approach
- What users should see vs. what logs should record

You get back a prompt that results in error handling that matches your standards.

### Logging Audits

Makes sure you're logging the right things without logging too much.

**What It Checks**

- Missing important logs
- Excessive logging (logging everything)
- Sensitive data in logs
- Log levels (info vs. debug vs. error)
- Debugging information
- Performance tracking points
- User action tracking

**How It Works**

1. Click logging audit
2. Select code
3. VibeBar includes:
   - The code
   - Your logging patterns
   - What you log in similar functions
   - Your log level standards
   - Privacy guidelines you follow

**Real Example**

You're implementing a payment function. Click logging audit. VibeBar loads:
- Your function
- How you log security events
- That you never log credit card data
- That you log transaction IDs instead
- Your debugging log patterns

You get a prompt that results in proper logging without security risks.

### Health Checks

Run all audits at once before committing.

**What You Get**

- Security issues (if any)
- Performance issues (if any)
- Error handling gaps (if any)
- Logging gaps (if any)
- Quick recommendations

Perfect before committing. Takes 30 seconds. Catches real issues.

---

## Terminal Integration

Your terminal right below your toolbar.

### What It Does

Shows your terminal output and helps debug faster.

**Features**

- Terminal output window below the toolbar
- Recent commands history
- Error highlighting
- Quick debugging prompts
- Command suggestions based on errors

### How It Works

1. VibeBar connects to your active terminal
2. It watches for errors and failures
3. When something fails, it:
   - Highlights the error
   - Extracts the relevant parts
   - Generates a debugging prompt
4. Click "Debug" to copy the prompt
5. Paste to your AI with full error context

### Real Example

Your tests fail. You see in the VibeBar terminal window:

```
FAIL src/auth.test.ts
  Auth tests
    should validate tokens
      Expected true, received false
```

Click "Debug". VibeBar generates a prompt that includes:
- The error message
- The test code that failed
- Similar passing tests
- Your auth validation pattern
- What changed recently

Copy to your AI. Get debugging help immediately.

### Terminal Commands

VibeBar learns your common commands:

- `npm test` or `pytest`
- `npm run build`
- `npm run dev`
- Database migrations
- Custom scripts

Quick buttons to run them without typing.

---

## Snipping Tool

Capture exactly what your AI needs.

### What It Does

Visual code selection that automatically includes context.

### How It Works

1. Click the snipping tool
2. Click and drag to select code
3. VibeBar automatically:
   - Includes surrounding context
   - Finds related functions/imports
   - Adds variable definitions
   - Includes usage examples
4. Review and copy

### Why It's Better Than Copy-Paste

When you copy a function, you get just that function. VibeBar gives your AI:

- The function
- What it imports
- What calls it
- Variable definitions it uses
- Related utility functions
- Examples of how it's used

Your AI understands the context immediately.

### Real Example

You want help with a component. Click snipping tool, select the component.

Without snipping tool:
```javascript
function UserCard({ user }) {
  return (
    <div className="card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  )
}
```

With snipping tool, your AI gets:
```javascript
// Imports
import { formatEmail } from '../utils/email'
import { Card } from './Card'

// Related styles
const cardStyles = {/* ... */}

// The component
function UserCard({ user }) {
  return (
    <div className={cardStyles.card}>
      <h3>{user.name}</h3>
      <p>{formatEmail(user.email)}</p>
    </div>
  )
}

// How it's used
<UserCard user={currentUser} />
```

Context included automatically. Your AI understands it properly.

---

## Project Analysis

Deep understanding of your codebase.

### What It Detects

**Tech Stack**
- Languages
- Frameworks (React, Next, Vue, Angular, etc.)
- Databases
- Authentication systems
- Testing frameworks
- Build tools
- Deployment systems

**Architecture**
- Monorepo vs. single package
- Component structure
- Data flow patterns
- API design patterns
- Database schema patterns
- Module organization

**Patterns**
- Error handling approach
- Logging style
- Testing patterns
- Naming conventions
- Code organization standards

**Issues Found**
- Security concerns
- Missing tests
- Performance opportunities
- Documentation gaps
- Type safety issues
- Inconsistent patterns

### How It Works

1. VibeBar runs automatically when you open a project
2. It scans:
   - Project structure
   - Package files
   - Config files
   - Code samples
   - Recent changes
3. Builds understanding of your project
4. Uses this for all context-aware features

### Why It Matters

Project analysis powers everything else:

- Prompts know your tech stack
- Audits know your patterns
- Suggestions match your standards
- Context is accurate, not guessed

### Running Analysis Manually

1. Click the analyze button
2. Choose depth:
   - Quick (30 seconds) - Surface level analysis
   - Deep (2-5 minutes) - Full codebase analysis
3. Get a detailed report

The report includes:
- Confirmed tech stack
- Architecture summary
- Found patterns
- Recommended best practices
- Issues discovered
- Quick wins for improvement

---

## Integration Options

Connect VibeBar to your AI tools (optional).

### Direct AI Integration

If configured, VibeBar can send prompts directly to:
- Cursor
- Claude Code
- Local LLMs (Ollama, LM Studio)
- OpenAI API
- Custom API endpoints

One click sends the prompt instead of copy-pasting.

### Chat Integration

Copy prompts to:
- Claude.ai
- ChatGPT
- Any web-based AI chat
- Your team's AI tools

### API Integration

For teams, connect to:
- Internal AI services
- Team prompt libraries
- Custom workflows

---

## Keyboard Shortcuts

Speed up your workflow.

**Default Shortcuts**

- `Ctrl+Shift+V` - Open VibeBar menu
- `Ctrl+Shift+A` - Quick audit on selection
- `Ctrl+Shift+P` - Open prompt library
- `Ctrl+Shift+S` - Snipping tool
- `Ctrl+Shift+T` - Terminal window
- `Ctrl+Shift+L` - Last audit result
- `Ctrl+Shift+?` - Help menu

All customizable in settings.

---

Next: [Real World Workflows](Real-World-Workflows) - See these features in action
