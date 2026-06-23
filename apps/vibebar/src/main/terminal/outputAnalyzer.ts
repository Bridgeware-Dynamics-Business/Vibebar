import type { ProjectProfile } from '@vibebar/project-detector'
import { buildContext } from '@vibebar/prompt-engine'
import type { DetectedIssue, IssueSeverity } from '@shared/types.js'

export interface AnalyzeInput {
  command: string
  output: string
  exitCode: number | null
  profile: ProjectProfile | null
}

interface ProjectCtx {
  label: string
  language: string
  framework: string
  testRunner: string
  packageManager: string
}

const SAFETY_FOOTER =
  'Constraints: do not weaken security, do not print or hard-code secrets, do not add dependencies unless strictly required, and pin any version you do add. After fixing, tell me the single command to verify it works.'

function projectCtx(profile: ProjectProfile | null): ProjectCtx {
  if (!profile) {
    return {
      label: 'my project',
      language: 'the language',
      framework: 'my app',
      testRunner: 'my test runner',
      packageManager: 'npm'
    }
  }
  const ctx = buildContext(profile)
  const framework = String(ctx.framework)
  const language = String(ctx.language)
  return {
    label: `my ${framework} project (${language})`,
    language,
    framework,
    testRunner: String(ctx.testRunner),
    packageManager: profile.packageManager === 'unknown' ? 'npm' : profile.packageManager
  }
}

/** Trims an evidence block to a sane size and strips trailing whitespace. */
function clampEvidence(text: string, maxLines = 12): string {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0)
  const slice = lines.slice(0, maxLines)
  const out = slice.join('\n').trim()
  return lines.length > maxLines ? `${out}\n…(${lines.length - maxLines} more lines)` : out
}

/** Wraps the matched output into a fenced block for the prompt body. */
function fence(evidence: string): string {
  return ['```', evidence, '```'].join('\n')
}

interface Rule {
  id: string
  severity: IssueSeverity
  title: string
  /** Returns the matched evidence string if the rule fires, else null. */
  match: (text: string) => string | null
  /** Builds the guidance sentence that follows the error block. */
  guidance: (ctx: ProjectCtx) => string
  summary: string
}

function firstMatchLines(text: string, re: RegExp, context = 6): string | null {
  const lines = text.split('\n')
  const idx = lines.findIndex((l) => re.test(l))
  if (idx === -1) return null
  return lines.slice(idx, idx + context).join('\n')
}

const RULES: Rule[] = [
  {
    id: 'missing-node-module',
    severity: 'error',
    // Avoid "…import" immediately before a quote — electron-vite's esm-shim regex false-matches it as an ESM import.
    title: 'Missing module or dependency',
    summary: 'A required package or local module could not be resolved.',
    match: (t) =>
      firstMatchLines(t, /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i) ??
      firstMatchLines(t, /Cannot find name|has no exported member/i),
    guidance: (c) =>
      `Identify whether this is a missing dependency or a wrong import path in ${c.label}. If it is a real package, give me the exact ${c.packageManager} install command and the correct import. If it is a local file, give me the corrected relative path. Do not invent a package name that may not exist — verify the package is real first.`
  },
  {
    id: 'python-module-not-found',
    severity: 'error',
    title: 'Python ModuleNotFoundError',
    summary: 'Python could not import a module.',
    match: (t) => firstMatchLines(t, /ModuleNotFoundError: No module named|ImportError:/),
    guidance: () =>
      `Tell me whether this module ships with the standard library or needs installing. If it needs installing, give me the exact pip install command and the correct import, and confirm the package name is real before suggesting it.`
  },
  {
    id: 'typescript-error',
    severity: 'error',
    title: 'TypeScript type error',
    summary: 'The TypeScript compiler reported a type error.',
    match: (t) => firstMatchLines(t, /error TS\d{3,5}:/),
    guidance: (c) =>
      `Explain this type error in ${c.label} in plain language, then give me the minimal, correctly typed fix. Do not use \`any\` or \`@ts-ignore\` to silence it.`
  },
  {
    id: 'eslint-error',
    severity: 'warning',
    title: 'Lint errors',
    summary: 'ESLint reported problems.',
    match: (t) => firstMatchLines(t, /\b\d+\s+error|✖\s+\d+\s+problem|error\s+.+\s+@typescript-eslint/i),
    guidance: () =>
      `Group these lint errors by rule, explain what each rule protects against, and give me the corrected code. Do not disable rules to make them pass unless the rule is genuinely inapplicable, in which case explain why.`
  },
  {
    id: 'test-failure',
    severity: 'error',
    title: 'Failing tests',
    summary: 'One or more tests failed.',
    match: (t) =>
      firstMatchLines(t, /\bFAIL\b|Tests:.*failed|\d+ failing|AssertionError|Expected.*Received/i),
    guidance: (c) =>
      `These ${c.testRunner} tests are failing. For each failure, tell me whether the test or the implementation is wrong, then give me the fix. If the implementation is correct and the test is outdated, update the test — never delete a test just to make the suite green.`
  },
  {
    id: 'port-in-use',
    severity: 'error',
    title: 'Port already in use',
    summary: 'The dev server could not bind its port.',
    match: (t) => firstMatchLines(t, /EADDRINUSE|address already in use|port \d+ is (?:already )?in use/i),
    guidance: () =>
      `Give me the safe way to find and stop the process holding this port on Windows, and how to configure the app to use a different port. Do not suggest killing processes blindly by name.`
  },
  {
    id: 'command-not-found',
    severity: 'error',
    title: 'Command not recognized',
    summary: 'The shell could not find the command.',
    match: (t) =>
      firstMatchLines(t, /is not recognized as the name of a cmdlet|command not found|not recognized as an internal or external command/i),
    guidance: (c) =>
      `Tell me what tool provides this command, whether it should be installed globally or run via ${c.packageManager}, and the exact command to run it correctly from this project.`
  },
  {
    id: 'permission-denied',
    severity: 'error',
    title: 'Permission denied',
    summary: 'A file or resource was not accessible.',
    match: (t) => firstMatchLines(t, /EACCES|permission denied|Access is denied|EPERM/i),
    guidance: () =>
      `Explain what is being blocked and the least-privilege way to resolve it. Do not tell me to run everything as administrator or chmod 777 — give me the narrowest fix that works.`
  },
  {
    id: 'npm-err',
    severity: 'error',
    title: 'Package manager error',
    summary: 'A package manager command failed.',
    match: (t) => firstMatchLines(t, /npm ERR!|pnpm ERR|yarn error|ERESOLVE|peer dep/i, 10),
    guidance: (c) =>
      `Diagnose this ${c.packageManager} failure. If it is a dependency conflict, explain the conflict and give me a resolution that keeps versions pinned and compatible. Do not suggest --force or --legacy-peer-deps without explaining the risk.`
  },
  {
    id: 'unhandled-exception',
    severity: 'error',
    title: 'Unhandled error / stack trace',
    summary: 'The program crashed with an exception.',
    match: (t) =>
      firstMatchLines(t, /Traceback \(most recent call last\)/) ??
      firstMatchLines(t, /Unhandled|UnhandledPromiseRejection|^\s*at .+\(.+:\d+:\d+\)/m) ??
      firstMatchLines(t, /\b(?:TypeError|ReferenceError|RangeError|SyntaxError):/),
    guidance: (c) =>
      `Trace this exception in ${c.label} to its root cause (not just where it threw), explain it in plain language, and give me the fix plus a guard so it cannot recur silently.`
  }
]

/**
 * Scans terminal output for known failure signatures and produces ready-to-paste, project-aware
 * fix prompts. Pure: no I/O, no clipboard — the controller decides what to do with the results.
 * Each rule fires at most once per analysis so the issue list stays focused.
 */
export function analyzeOutput(input: AnalyzeInput): DetectedIssue[] {
  const text = input.output ?? ''
  if (!text.trim()) return []
  const ctx = projectCtx(input.profile)
  const issues: DetectedIssue[] = []

  for (const rule of RULES) {
    const raw = rule.match(text)
    if (!raw) continue
    const evidence = clampEvidence(raw)
    const prompt = [
      `I'm working in ${ctx.label}. I ran \`${input.command.trim()}\` and it failed${
        input.exitCode != null ? ` (exit code ${input.exitCode})` : ''
      } with:`,
      '',
      fence(evidence),
      '',
      rule.guidance(ctx),
      '',
      SAFETY_FOOTER
    ].join('\n')

    issues.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      summary: rule.summary,
      evidence,
      prompt
    })
  }

  // If the command failed but matched no specific rule, still offer a generic guided prompt so
  // the user is never left without a next step.
  if (issues.length === 0 && input.exitCode != null && input.exitCode !== 0) {
    const evidence = clampEvidence(text)
    issues.push({
      id: 'generic-failure',
      severity: 'warning',
      title: 'Command failed',
      summary: `Exited with code ${input.exitCode}.`,
      evidence,
      prompt: [
        `I'm working in ${ctx.label}. The command \`${input.command.trim()}\` exited with code ${input.exitCode}. Here is the output:`,
        '',
        fence(evidence),
        '',
        'Explain what went wrong in plain language and give me the exact fix and how to verify it.',
        '',
        SAFETY_FOOTER
      ].join('\n')
    })
  }

  return issues
}
