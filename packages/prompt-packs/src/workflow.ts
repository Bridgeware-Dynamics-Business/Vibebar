import type { PromptTemplate } from '@vibebar/prompt-engine'

/** Vibe-coding workflow prompts — session handoff, planning, verification, PR splitting. */
export const WORKFLOW_PROMPTS: PromptTemplate[] = [
  {
    id: 'workflow-session-handoff',
    title: 'Continue this vibe coding session',
    categories: ['Context', 'Docs'],
    stacks: ['any'],
    description:
      'Hand off a pinned Session Hub bundle to Cursor — continue from structured context without losing the thread.',
    variables: [
      { key: 'project', source: 'folderName', default: 'my project', label: 'Project' },
      {
        key: 'pinnedSummary',
        source: 'custom',
        default: '(Paste your Session Hub handoff or list pinned items here)',
        label: 'Pinned items'
      }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Continue this vibe coding session for {{project}}.',
      '',
      'I pinned the following from my VibeBar session — treat this as the source of truth for what I was doing and what still needs doing:',
      '',
      '{{pinnedSummary}}',
      '',
      'Pick up where I left off:',
      '1. Read the pinned context before changing anything.',
      '2. Keep changes scoped to the open task — no drive-by refactors.',
      '3. Run relevant tests and tell me what to verify in the terminal.',
      '4. If something in the pinned context is stale, say so and ask one clarifying question.'
    ].join('\n')
  },
  {
    id: 'workflow-plan-before-code',
    title: 'Plan before code',
    categories: ['Context', 'Docs'],
    stacks: ['any'],
    description: 'Structured planning prompt for complex tasks — forces a plan before any implementation.',
    variables: [
      { key: 'task', source: 'custom', default: '(Describe the task)', label: 'Task' },
      { key: 'project', source: 'project.name', default: 'my project', label: 'Project' }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'I need a plan before any code changes in {{project}}.',
      '',
      'Task: {{task}}',
      '',
      'Do NOT write code yet. Produce:',
      '',
      '1. **Goal** — one sentence restatement.',
      '2. **Assumptions** — what you are inferring; flag anything uncertain.',
      '3. **Files to touch** — explicit list with why each file matters.',
      '4. **Steps** — ordered, each with acceptance criteria.',
      '5. **Risks** — security, regressions, migration/rollback notes.',
      '6. **Verification** — exact commands I should run after implementation.',
      '',
      'Wait for my approval before implementing.'
    ].join('\n')
  },
  {
    id: 'workflow-verify-my-fix',
    title: 'Verify my fix',
    categories: ['Testing', 'Context'],
    stacks: ['any'],
    description: 'After AI changes land, paste a diff and get a verification checklist.',
    variables: [
      { key: 'diff', source: 'custom', default: '(Paste git diff or describe changes)', label: 'Diff / changes' }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Review this change and give me a verification checklist. Do not assume it is correct — be skeptical.',
      '',
      '```diff',
      '{{diff}}',
      '```',
      '',
      'Return:',
      '- What could still be wrong (edge cases, security, performance).',
      '- A numbered checklist of commands/tests I should run locally.',
      '- One regression test idea if none exist yet.',
      '- Whether the change matches the original intent or scope-creeped.'
    ].join('\n')
  },
  {
    id: 'workflow-split-into-prs',
    title: 'Split into reviewable PRs',
    categories: ['Docs', 'Context'],
    stacks: ['any'],
    description: 'Break a large change into small, reviewable PRs with titles and scope per PR.',
    variables: [
      {
        key: 'changeSummary',
        source: 'custom',
        default: '(Describe the full change or paste file list / diff stats)',
        label: 'Change summary'
      }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Help me split this work into small, reviewable PRs (each should be reviewable in ~15 minutes).',
      '',
      '{{changeSummary}}',
      '',
      'For each proposed PR give:',
      '- Title (Conventional Commit style)',
      '- Scope (files/areas)',
      '- Why it is isolated (dependencies on other PRs)',
      '- Suggested merge order',
      '- Test plan for that PR alone',
      '',
      'Prefer 3–6 PRs over one giant diff. Flag anything that must land together.'
    ].join('\n')
  },
  {
    id: 'workflow-explain-pairing',
    title: 'Explain like I\'m pairing',
    categories: ['Context', 'Docs'],
    stacks: ['any'],
    description: 'Concise live-pairing explanation — what changed, why, and what to watch.',
    variables: [
      { key: 'topic', source: 'custom', default: '(What to explain — code, error, design decision)', label: 'Topic' }
    ],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Explain this like we are pair programming — concise, spoken tone, no essay.',
      '',
      '{{topic}}',
      '',
      'Cover in order:',
      '1. What it is (one line).',
      '2. Why it matters for this codebase.',
      '3. The one thing I should watch for when editing nearby code.',
      '',
      'Skip boilerplate. Max ~12 sentences unless I ask for more.'
    ].join('\n')
  }
]
