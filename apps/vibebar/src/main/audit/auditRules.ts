import type { AuditFinding } from '@shared/types.js'

export interface ScanFile {
  /** Path relative to the project root, using forward slashes. */
  path: string
  content: string
}

export interface AuditContext {
  label: string
  framework: string
  language: string
  testRunner: string
}

export interface AuditRuleInput {
  ctx: AuditContext
  files: ScanFile[]
  packageJson: Record<string, unknown> | null
  hasLockfile: boolean
  /** Contents of the project's .gitignore, or null when none is committed. */
  gitignore?: string | null
}

/** Safety rules appended to every fix prompt so the AI can't "fix" one thing by breaking another. */
const COMMON_SAFETY = [
  'Do not print, log, echo, or commit any secret values, tokens, API keys, passwords, or connection strings.',
  'Do not expose environment variables, cookies, localStorage, sessionStorage, or full user file paths.',
  'Do not weaken or disable any existing security control to make the fix easier.',
  'Validate and sanitize all untrusted input; never build SQL/queries by string concatenation.',
  'Do not send any data to a third-party server as part of this change.',
  'Keep the change minimal and scoped to this single issue.'
]

/** Extra rules that only apply to Electron projects (detected from the project framework). */
const ELECTRON_SAFETY = [
  'Keep contextIsolation: true and nodeIntegration: false.',
  'Keep sandbox: true if my app already uses it.',
  'Do not use innerHTML with untrusted data — use textContent or safe DOM node creation.',
  'Do not add eval, the Function constructor, remote code loading, or unsafe inline script execution.'
]

function isElectron(ctx: AuditContext): boolean {
  return /electron/i.test(ctx.framework)
}

function safetyBlock(ctx: AuditContext, extra: string[] = []): string {
  const lines = [...COMMON_SAFETY, ...(isElectron(ctx) ? ELECTRON_SAFETY : []), ...extra]
  return lines.map((l) => `* ${l}`).join('\n')
}

// ---------------------------------------------------------------------------
// Location + context helpers — these make every prompt carry precise, machine-
// readable context (file, line, column, a numbered code frame, the mapped CWE
// and OWASP entry), the same way our in-app error console captures an error.
// ---------------------------------------------------------------------------

function locate(content: string, index: number): { line: number; column: number } {
  let line = 1
  let column = 1
  const end = Math.min(index, content.length)
  for (let i = 0; i < end; i++) {
    if (content.charCodeAt(i) === 10) {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

/** A numbered code frame around the match, marking the offending line with '>'. */
function codeFrame(content: string, index: number, radius = 3): string {
  const lines = content.split('\n')
  const { line } = locate(content, index)
  const start = Math.max(1, line - radius)
  const stop = Math.min(lines.length, line + radius)
  const width = String(stop).length
  const out: string[] = []
  for (let n = start; n <= stop; n++) {
    const raw = (lines[n - 1] ?? '').replace(/\s+$/, '')
    const marker = n === line ? '>' : ' '
    out.push(`${marker} ${String(n).padStart(width)} | ${raw}`)
  }
  return out.join('\n')
}

interface ContextHeaderInput {
  id: string
  severity: AuditFinding['severity']
  category: AuditFinding['category']
  cwe?: string
  references?: string[]
  file?: string
  line?: number
  column?: number
  frame?: string
}

/** Renders the structured finding header that anchors the LLM to the exact location and standard. */
function buildContextHeader(o: ContextHeaderInput): string {
  const lines: string[] = [`--- Security finding ${o.id} ---`]
  lines.push(`Severity: ${o.severity.toUpperCase()}`)
  lines.push(`Category: ${o.category}`)
  if (o.cwe) lines.push(`Weakness: ${o.cwe}`)
  if (o.references && o.references.length > 0) lines.push(`Standards: ${o.references.join('; ')}`)
  if (o.file) lines.push(`File: ${o.file}`)
  if (o.line) lines.push(`Location: line ${o.line}${o.column ? `, column ${o.column}` : ''}`)
  if (o.frame) {
    lines.push('Code:')
    lines.push(o.frame)
  }
  return lines.join('\n')
}

interface FixSpec {
  ctx: AuditContext
  task: string
  where: string
  problem: string
  goal: string
  steps?: string[]
  extraSafety?: string[]
  /** Structured finding header injected near the top so the model has exact context. */
  context?: string
}

/**
 * Builds a long, structured, copy-paste fix prompt: finding context → task → where → problem →
 * goal → explicit steps → safety requirements → a strict "before/after editing" protocol. This is
 * the direct LLM context the user pastes so the AI fixes the real issue without weakening anything.
 */
function buildFixPrompt(s: FixSpec): string {
  const parts: string[] = [`You are a senior application-security engineer working inside ${s.ctx.label}.`]
  if (s.context) {
    parts.push(
      '',
      'Finding context (auto-generated by VibeBar\u2019s security audit \u2014 treat the location and code below as ground truth):',
      s.context
    )
  }
  parts.push(
    '',
    `Task: ${s.task}`,
    '',
    'Where:',
    s.where,
    '',
    'Problem:',
    s.problem,
    '',
    'Goal:',
    s.goal
  )
  if (s.steps && s.steps.length > 0) {
    parts.push('', 'Do this:', ...s.steps.map((x, i) => `${i + 1}. ${x}`))
  }
  parts.push(
    '',
    'Safety requirements:',
    safetyBlock(s.ctx, s.extraSafety),
    '',
    'Before editing:',
    '* Open the file and confirm the finding at the line above is real (not a false positive); if it is a false positive, explain why and stop.',
    '* Tell me exactly which file(s) you are changing.',
    '* For every change, show the existing block, the replacement block, and why the change is safe.',
    '* Do not add new dependencies without telling me why and what they do.',
    '',
    'After editing:',
    '* Explain the root cause in plain language first, then give me the minimal fix.',
    '* Confirm you did not weaken any other security control.',
    '* Confirm no secrets, tokens, or full file paths appear in your answer.',
    '* Tell me how to verify the fix manually, then run the behavioral test below to prove it.'
  )
  return parts.join('\n')
}

interface TestSpec {
  ctx: AuditContext
  objective: string
  steps: string[]
  extra?: string[]
}

/** Builds a structured behavioral-test prompt — the runtime proof a static scanner can't give. */
function buildTestPrompt(s: TestSpec): string {
  const parts: string[] = [
    `You are writing an automated security regression test for ${s.ctx.label} using ${s.ctx.testRunner}.`,
    '',
    'Objective:',
    s.objective,
    '',
    'Write the test so that:',
    ...s.steps.map((x, i) => `${i + 1}. ${x}`),
    '',
    'Important:',
    '* Drive the API/app directly with raw requests, not through the UI — UI tests inherit the frontend\u2019s assumptions.',
    '* The test must FAIL today if the vulnerability is present and PASS once it is fixed.',
    '* Add the test to the suite so it runs on every deploy/CI run.'
  ]
  if (s.extra && s.extra.length > 0) parts.push(...s.extra.map((l) => `* ${l}`))
  return parts.join('\n')
}

function snippet(content: string, index: number, len = 120): string {
  const start = Math.max(0, index - 10)
  return content.slice(start, start + len).replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Finding builders — one for file-anchored findings (with a code frame) and one
// for project-level findings (no single line). Both inject the rich context
// header into the fix prompt and copy the location/standards onto the finding.
// ---------------------------------------------------------------------------

interface FileFindingSpec {
  input: AuditRuleInput
  file: ScanFile
  index: number
  id: string
  category: AuditFinding['category']
  severity: AuditFinding['severity']
  cwe?: string
  references?: string[]
  title: string
  detail: string
  fix: Omit<FixSpec, 'ctx' | 'context'>
  test: Omit<TestSpec, 'ctx'>
}

function fileFinding(s: FileFindingSpec): AuditFinding {
  const { line, column } = locate(s.file.content, s.index)
  const frame = codeFrame(s.file.content, s.index)
  const header = buildContextHeader({
    id: s.id,
    severity: s.severity,
    category: s.category,
    cwe: s.cwe,
    references: s.references,
    file: s.file.path,
    line,
    column,
    frame
  })
  return {
    id: s.id,
    category: s.category,
    severity: s.severity,
    title: s.title,
    detail: s.detail,
    file: s.file.path,
    line,
    column,
    codeContext: frame,
    cwe: s.cwe,
    references: s.references,
    evidence: snippet(s.file.content, s.index),
    fixPrompt: buildFixPrompt({ ...s.fix, ctx: s.input.ctx, context: header }),
    testPrompt: buildTestPrompt({ ...s.test, ctx: s.input.ctx })
  }
}

interface MetaFindingSpec {
  input: AuditRuleInput
  id: string
  category: AuditFinding['category']
  severity: AuditFinding['severity']
  cwe?: string
  references?: string[]
  title: string
  detail: string
  file?: string
  evidence?: string
  fix: Omit<FixSpec, 'ctx' | 'context'>
  test: Omit<TestSpec, 'ctx'>
}

function metaFinding(s: MetaFindingSpec): AuditFinding {
  const header = buildContextHeader({
    id: s.id,
    severity: s.severity,
    category: s.category,
    cwe: s.cwe,
    references: s.references,
    file: s.file
  })
  return {
    id: s.id,
    category: s.category,
    severity: s.severity,
    title: s.title,
    detail: s.detail,
    file: s.file,
    cwe: s.cwe,
    references: s.references,
    evidence: s.evidence,
    fixPrompt: buildFixPrompt({ ...s.fix, ctx: s.input.ctx, context: header }),
    testPrompt: buildTestPrompt({ ...s.test, ctx: s.input.ctx })
  }
}

/** Files that ship to the browser — where a secret becomes public. */
function isClientFile(path: string): boolean {
  if (/\.(tsx|jsx)$/.test(path)) return true
  if (/(^|\/)(src|app|components|pages|public|client)\//.test(path)) {
    return /\.(ts|js|mjs|cjs|svelte|vue)$/.test(path)
  }
  return false
}

function isServerish(path: string): boolean {
  return /(^|\/)(api|server|routes?|backend|functions?|pages\/api|app\/api)\//.test(path)
}

/** Tests/fixtures/examples are expected to contain "scary" strings — don't flag them as findings. */
function isTestOrExampleFile(path: string): boolean {
  return /(\.(test|spec)\.|(^|\/)(tests?|__tests__|__mocks__|fixtures?|examples?|mocks?)\/|\.example$|\.sample$)/i.test(
    path
  )
}

/** A literal value that is clearly a placeholder, not a real secret. */
function isPlaceholderSecret(value: string): boolean {
  return /(your[_-]?|example|placeholder|changeme|change[_-]?this|xxxx|<.*>|\$\{|process\.env|os\.environ|dummy|sample|test[_-]?key|fake)/i.test(
    value
  )
}

/** CWE-798 / the Moltbook pattern: secrets reachable from the client bundle. */
function detectClientSecrets(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  let supabaseSeen = false

  const patterns: Array<{ id: string; re: RegExp; what: string }> = [
    { id: 'public-env-secret', re: /(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)\w*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE)\w*/i, what: 'a server secret exposed through a client-public env var' },
    { id: 'stripe-live', re: /sk_live_[A-Za-z0-9]{16,}/, what: 'a live Stripe secret key' },
    { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/, what: 'an AWS access key id' },
    { id: 'firebase-apikey', re: /apiKey\s*:\s*["'][A-Za-z0-9_\-]{20,}["']/, what: 'a hard-coded Firebase/web apiKey' },
    { id: 'generic-bearer', re: /(?:bearer|authorization)\s*[:=]\s*["'][A-Za-z0-9._\-]{20,}["']/i, what: 'a hard-coded auth token' }
  ]

  for (const file of input.files) {
    if (!isClientFile(file.path)) continue
    if (/supabase|createClient/i.test(file.content)) supabaseSeen = true
    for (const p of patterns) {
      const m = p.re.exec(file.content)
      if (!m) continue
      findings.push(
        fileFinding({
          input,
          file,
          index: m.index,
          id: `secret-${p.id}-${file.path}`,
          category: 'Exposed Secrets',
          severity: 'critical',
          cwe: 'CWE-798 — Use of Hard-coded Credentials',
          references: ['OWASP A07:2021 — Identification and Authentication Failures', 'OWASP A05:2021 — Security Misconfiguration'],
          title: 'Secret reachable from the client bundle',
          detail: `Found ${p.what} in a file that ships to the browser. Anyone can read this in DevTools.`,
          fix: {
            task: 'Remove a secret that is reachable from the client bundle',
            where: `${file.path} — at the line marked above (${p.what}). Do not paste the value back to me.`,
            problem: `This file contains ${p.what}. It ships to the browser, so anyone can read it in DevTools or by viewing the bundled JavaScript. Any value here must be treated as already compromised.`,
            goal: 'Move this secret out of all client-reachable code so it can never be served to a browser.',
            steps: [
              'Move the secret to a server-only environment variable (no NEXT_PUBLIC_/VITE_/REACT_APP_/EXPO_PUBLIC_ prefix).',
              'Access it only from server-side code (route handler, server action, or backend), never from a client component.',
              'Rotate/regenerate the exposed value at its provider, since the old value must be considered leaked.',
              'Confirm no client file references the secret after the change.'
            ]
          },
          test: {
            objective: 'Prove that the secret is no longer present in anything served to the browser.',
            steps: [
              'Build the app for production, then load the built client bundle (or fetch the deployed JS assets).',
              'Search the served output for any string matching the leaked secret value.',
              'Assert that no match is found anywhere in the client bundle.'
            ]
          }
        })
      )
    }
  }

  if (supabaseSeen) {
    findings.push(
      metaFinding({
        input,
        id: 'supabase-rls',
        category: 'Access Control',
        severity: 'high',
        cwe: 'CWE-639 — Authorization Bypass Through User-Controlled Key',
        references: ['OWASP API1:2023 — Broken Object Level Authorization', 'OWASP A01:2021 — Broken Access Control'],
        title: 'Supabase detected — verify Row Level Security',
        detail:
          'A Supabase client was found. The anon key is meant to be public, but it is only safe if Row Level Security (RLS) is enabled with policies on every table. With RLS off, that public key grants full read/write to all rows (the Moltbook breach).',
        fix: {
          task: 'Verify and enforce Row Level Security on every Supabase table',
          where: 'Supabase project tables and policies (the public anon key is used in this project).',
          problem:
            'The Supabase anon key is public by design and safe only when Row Level Security is ON with a policy on every table. If RLS is off on any table, that public key grants full read/write to all rows for anyone.',
          goal: 'Guarantee RLS is enabled on every table with policies that restrict each row to its owner.',
          steps: [
            'List every table and report which ones currently have RLS enabled vs. disabled.',
            'Give me the SQL to enable RLS on each table that is missing it.',
            'Give me the policies for a typical "users can only read/write their own rows" model (SELECT/INSERT/UPDATE/DELETE).',
            'Confirm no table is left world-readable or world-writable through the anon key.'
          ]
        },
        test: {
          objective: 'Prove the public anon key cannot reach another user\u2019s data when RLS is enforced.',
          steps: [
            'Authenticate as User A using only the public anon key.',
            'Attempt to SELECT, UPDATE, and DELETE a row owned by User B directly through the Supabase REST/JS API.',
            'Assert every cross-user operation is denied (no rows returned, write rejected).'
          ]
        }
      })
    )
  }

  return findings
}

/** CWE-639 (BOLA/IDOR): endpoints that return user-scoped data without proven authorization. */
function detectAuthorizationGaps(input: AuditRuleInput): AuditFinding[] {
  const jsRe =
    /\b(?:app|router|api|server)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  // FastAPI/Flask decorators and Django url/path routing.
  const pyRe =
    /@\w+\.(get|post|put|patch|delete|route)\s*\(\s*["']([^"']+)["']|\b(?:path|re_path|url)\s*\(\s*r?["']([^"']+)["']/g
  const hits: string[] = []
  for (const file of input.files) {
    const isPy = /\.py$/.test(file.path)
    if (!isServerish(file.path) && !/\.(ts|js|mjs|cjs)$/.test(file.path) && !isPy) continue
    const re = isPy ? pyRe : jsRe
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(file.content)) !== null) {
      const method = (m[1] ?? m[3] ?? 'GET').toUpperCase()
      const route = m[2] ?? m[4] ?? file.path
      hits.push(`${method} ${route}`)
      if (hits.length >= 25) break
    }
  }
  if (hits.length === 0) return []

  const unique = [...new Set(hits)].slice(0, 20)
  return [
    metaFinding({
      input,
      id: 'bola-idor',
      category: 'Access Control',
      severity: 'high',
      cwe: 'CWE-639 — Authorization Bypass Through User-Controlled Key (IDOR)',
      references: ['OWASP API1:2023 — Broken Object Level Authorization'],
      title: 'Verify object-level authorization on endpoints',
      detail: `Found ${unique.length} API endpoint(s). Scanners confirm these exist; they cannot confirm that each one checks the caller actually owns the requested object. BOLA/IDOR is the most common critical API vulnerability.`,
      evidence: unique.slice(0, 8).join('\n'),
      fix: {
        task: 'Add object-level authorization (ownership checks) to user-scoped endpoints',
        where: `These endpoints:\n${unique.join('\n')}`,
        problem:
          'Each endpoint accepts a resource identifier from the caller. Authenticating the user is not enough — the code must also prove that this user owns (or may access) that specific object. Without it, changing an id in the request returns another user\u2019s data (BOLA/IDOR).',
        goal: 'Ensure every request can only read or modify resources the authenticated caller is authorized for.',
        steps: [
          'For each endpoint, add a per-request check that the resource belongs to (or is shared with) the authenticated user before returning or mutating it.',
          'Centralize this in an authorization middleware/guard and show me exactly where to apply it.',
          'Return 403 (or 404 to avoid leaking existence) when the check fails — never 200 with someone else\u2019s data.',
          'List any endpoint where you could not determine the ownership model so I can confirm it.'
        ]
      },
      test: {
        objective: 'Prove no endpoint leaks or mutates another user\u2019s object (BOLA/IDOR).',
        steps: [
          'Create two users, User A and User B, each owning their own resource.',
          'Authenticate as User A and request/modify a resource id that belongs to User B, for each endpoint listed below.',
          'Assert every such response is 403 or 404 — never 200 with User B\u2019s data.'
        ],
        extra: [`Endpoints under test:\n${unique.join('\n')}`]
      }
    })
  ]
}

/** CWE-602: validation that lives only in the component and not at the API boundary. */
function detectFrontendOnlyValidation(input: AuditRuleInput): AuditFinding[] {
  const clientValidation = input.files.some(
    (f) => isClientFile(f.path) && /(zod|yup|joi|\.min\(|\.max\(|required\s*[:=]|pattern\s*[:=]|type=["']email["'])/i.test(f.content)
  )
  if (!clientValidation) return []
  const serverValidation = input.files.some(
    (f) => isServerish(f.path) && /(zod|yup|joi|valibot|class-validator|pydantic|schema\.validate|parse\()/i.test(f.content)
  )
  if (serverValidation) return []
  return [
    metaFinding({
      input,
      id: 'frontend-only-validation',
      category: 'Input Validation',
      severity: 'medium',
      cwe: 'CWE-602 — Client-Side Enforcement of Server-Side Security',
      references: ['OWASP API6:2023 — Unrestricted Access to Sensitive Business Flows', 'OWASP A04:2021 — Insecure Design'],
      title: 'Validation may be frontend-only',
      detail:
        'Client-side validation was found, but no matching server-side validation was detected. An attacker who calls the API directly bypasses frontend checks entirely.',
      fix: {
        task: 'Add server-side validation that mirrors the client-side rules',
        where: 'Every data-accepting API endpoint (the matching server-side validation is missing).',
        problem:
          'Validation currently appears to run only in the client. Anyone calling the API directly (curl, fetch, a script) skips the form entirely and sends whatever they want.',
        goal: 'Reject invalid input at the server boundary before any processing, mirroring the client rules.',
        steps: [
          'Define a validation schema (e.g. zod/yup/valibot/pydantic) for each endpoint\u2019s expected input.',
          'Validate at the start of every handler and reject invalid input with a clear 4xx error before touching the database or business logic.',
          'Keep the client checks for UX, but treat the server as the source of truth.'
        ]
      },
      test: {
        objective: 'Prove the server rejects invalid input even when the form is bypassed.',
        steps: [
          'POST invalid payloads directly to each endpoint: empty required fields, over-length strings, wrong types, script tags, and negative numbers.',
          'Assert the server responds with a 4xx and does not persist anything.',
          'Confirm a valid payload still succeeds.'
        ]
      }
    })
  ]
}

/** CWE-79: dangerous DOM sinks that AI code introduces 2.7x more often. */
function detectDangerousSinks(input: AuditRuleInput): AuditFinding[] {
  const re = /(dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\(|v-html|\{@html|\beval\(|new Function\()/
  const findings: AuditFinding[] = []
  for (const file of input.files) {
    if (!isClientFile(file.path)) continue
    const m = re.exec(file.content)
    if (!m) continue
    findings.push(
      fileFinding({
        input,
        file,
        index: m.index,
        id: `xss-sink-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        cwe: 'CWE-79 — Improper Neutralization of Input During Web Page Generation (XSS)',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Dangerous DOM/eval sink',
        detail: `\`${m[1]}\` can introduce XSS or code injection if it ever receives untrusted data.`,
        fix: {
          task: 'Replace a dangerous DOM/eval sink with safe rendering',
          where: `${file.path} — uses \`${m[1]}\` at the line marked above`,
          problem: `\`${m[1]}\` executes or injects raw markup/code. If the data it receives can ever be influenced by a user, this becomes XSS or code injection.`,
          goal: 'Render untrusted data inertly so it can never execute.',
          steps: [
            'Determine whether the data passed to this sink can ever be user-influenced (directly or via stored/fetched values).',
            'If it can, replace the sink with safe rendering: text nodes / framework text binding, or sanitize with a vetted library (e.g. DOMPurify) before insertion.',
            'Prefer eliminating the sink entirely over sanitizing where possible.'
          ],
          extraSafety: ['Do not "fix" this by sanitizing on the client only if the same data is also rendered elsewhere — sanitize at the point of insertion.']
        },
        test: {
          objective: 'Prove an injected payload is rendered as inert text and never executes.',
          steps: [
            'Submit a payload like `<img src=x onerror=alert(1)>` through the input that reaches this sink.',
            'Assert it appears as escaped/inert text in the DOM.',
            'Assert no script/handler from the payload executes (e.g. no dialog/side effect fires).'
          ]
        }
      })
    )
    if (findings.length >= 5) break
  }
  return findings
}

/** CWE-798: hard-coded credentials in any tracked file (covers server & Python code, not just the bundle). */
function detectHardcodedSecrets(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const patterns: Array<{ id: string; re: RegExp; what: string; severity: AuditFinding['severity'] }> = [
    { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, what: 'a hard-coded private key', severity: 'critical' },
    { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/, what: 'an AWS access key id', severity: 'critical' },
    { id: 'stripe-live', re: /sk_live_[A-Za-z0-9]{16,}/, what: 'a live Stripe secret key', severity: 'critical' },
    { id: 'gcp-key', re: /AIza[0-9A-Za-z_\-]{35}/, what: 'a Google API key', severity: 'high' },
    { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/, what: 'a GitHub access token', severity: 'high' },
    { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/, what: 'a Slack token', severity: 'high' },
    { id: 'generic-credential', re: /(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']([^"'\s]{8,})["']/i, what: 'a hard-coded credential assigned to a literal value', severity: 'high' }
  ]

  for (const file of input.files) {
    // Client-file secrets are handled by detectClientSecrets; skip tests/examples to avoid noise.
    if (isClientFile(file.path) || isTestOrExampleFile(file.path)) continue
    for (const p of patterns) {
      const m = p.re.exec(file.content)
      if (!m) continue
      if (p.id === 'generic-credential' && isPlaceholderSecret(m[1] ?? m[0])) continue
      findings.push(
        fileFinding({
          input,
          file,
          index: m.index,
          id: `hardcoded-${p.id}-${file.path}`,
          category: 'Exposed Secrets',
          severity: p.severity,
          cwe: 'CWE-798 — Use of Hard-coded Credentials',
          references: ['OWASP A07:2021 — Identification and Authentication Failures'],
          title: 'Hard-coded secret in source',
          detail: `Found ${p.what} committed directly in source. Anyone with repository access (or a leaked clone) gains this credential, and it lives in git history even after deletion.`,
          fix: {
            task: 'Remove a hard-coded secret from source and load it from the environment',
            where: `${file.path} — at the line marked above (${p.what}). Do not paste the value back to me.`,
            problem: `This file contains ${p.what} in plaintext. Committed secrets are exposed to everyone with repo access and remain recoverable from git history; the value must be treated as already compromised.`,
            goal: 'Load this secret from an environment variable or secrets manager and purge it from the repository.',
            steps: [
              'Replace the literal value with a read from an environment variable (or a secrets manager) at startup.',
              'Add a clear startup error if the variable is missing, so misconfiguration fails loudly instead of silently.',
              'Ensure the .env / secret file is gitignored and never committed.',
              'Rotate/regenerate the exposed value at its provider, then tell me how to purge it from git history.'
            ]
          },
          test: {
            objective: 'Prevent hard-coded secrets from re-entering the codebase.',
            steps: [
              'Add a CI step (e.g. gitleaks or a regex scan) that scans the repository for credential patterns.',
              'Assert the build fails if any high-entropy secret or known key format is committed.',
              'Confirm the previously committed value no longer appears anywhere in the working tree.'
            ]
          }
        })
      )
      break
    }
    if (findings.length >= 8) break
  }
  return findings
}

/** CWE-89: SQL built from user input via interpolation/concatenation instead of parameters. */
function detectSqlInjection(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const jsRe = /\b(?:query|execute|raw)\s*\(\s*`[^`]*\$\{|\b(?:query|execute)\s*\(\s*["'][^"']*["']\s*\+/
  const pyRe =
    /\b(?:execute|executemany|raw|text)\s*\(\s*f["']|\b(?:execute|executemany)\s*\(\s*["'][^"']*%[^"']*["']\s*%|\.execute\([^)]*\.format\(/
  for (const file of input.files) {
    if (isTestOrExampleFile(file.path)) continue
    const isPy = /\.py$/.test(file.path)
    const re = isPy ? pyRe : jsRe
    const m = re.exec(file.content)
    if (!m) continue
    findings.push(
      fileFinding({
        input,
        file,
        index: m.index,
        id: `sql-injection-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        cwe: 'CWE-89 — Improper Neutralization of Special Elements used in an SQL Command',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Possible SQL injection (query built from input)',
        detail:
          'A database query appears to be assembled with string interpolation or concatenation. If any interpolated value comes from a request, an attacker can rewrite the query (read/dump/drop data).',
        fix: {
          task: 'Convert a string-built SQL query to a parameterized query',
          where: `${file.path} — a query is built with interpolation/concatenation at the line marked above`,
          problem:
            'The query text is assembled from strings. If user input flows into it, the input becomes executable SQL — this is the classic SQL injection vulnerability.',
          goal: 'Send all values as bound parameters so input can never alter the query structure.',
          steps: [
            'Rewrite the query to use placeholders/bound parameters (or the ORM), passing values separately from the SQL text.',
            'For any dynamic identifier (table/column/ORDER BY) that cannot be parameterized, validate it against a fixed allowlist.',
            'Trace each interpolated value back to its source and confirm none of it reaches the SQL string directly.'
          ]
        },
        test: {
          objective: 'Prove the endpoint is not exploitable via SQL injection.',
          steps: [
            'Send injection payloads (e.g. `\' OR \'1\'=\'1`, `; DROP TABLE`, UNION SELECT) to the field that reaches this query.',
            'Assert the input is treated as data: the query returns no extra rows and no error reveals the SQL.',
            'Confirm a normal value still returns the correct result.'
          ]
        }
      })
    )
    if (findings.length >= 5) break
  }
  return findings
}

/** CWE-78: OS command built from input / shell=True with dynamic content. */
function detectCommandInjection(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const jsRe = /\b(?:exec|execSync)\s*\(\s*`[^`]*\$\{|\b(?:exec|execSync)\s*\(\s*["'][^"']*["']\s*\+/
  const pyRe = /\bos\.system\s*\(\s*f["']|\bos\.system\s*\([^)]*\+|subprocess\.\w+\([^)]*shell\s*=\s*True/
  for (const file of input.files) {
    if (isTestOrExampleFile(file.path)) continue
    const isPy = /\.py$/.test(file.path)
    const re = isPy ? pyRe : jsRe
    const m = re.exec(file.content)
    if (!m) continue
    findings.push(
      fileFinding({
        input,
        file,
        index: m.index,
        id: `command-injection-${file.path}`,
        category: 'Input Validation',
        severity: 'critical',
        cwe: 'CWE-78 — Improper Neutralization of Special Elements used in an OS Command',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Possible OS command injection',
        detail:
          'A shell command appears to be built from dynamic input (string interpolation/concatenation, or shell=True). If input reaches it, an attacker can run arbitrary commands on the server.',
        fix: {
          task: 'Eliminate OS command injection by avoiding the shell and passing args safely',
          where: `${file.path} — a command is built from dynamic input at the line marked above`,
          problem:
            'Building a shell command from input (or running with the shell enabled) lets an attacker inject extra commands via metacharacters (;, |, &&, $()). This is remote code execution.',
          goal: 'Run the program directly with an argument array and no shell, or remove the shell-out entirely.',
          steps: [
            'Replace the shell invocation with a call that passes the program and an explicit args array (no shell interpretation).',
            'If a value must be dynamic, validate it strictly against an allowlist; never pass raw input to a shell.',
            'Prefer a native library over shelling out where one exists.'
          ]
        },
        test: {
          objective: 'Prove command injection is not possible through this code path.',
          steps: [
            'Send payloads with shell metacharacters (e.g. `; id`, `&& whoami`, `$(touch /tmp/x)`) to the input that reaches the command.',
            'Assert no injected command executes (no side effect/file created) and the input is treated as a literal argument.'
          ]
        }
      })
    )
    if (findings.length >= 5) break
  }
  return findings
}

/** CWE-16 / CWE-295: dangerous runtime configuration (disabled TLS checks, wildcard CORS, debug on). */
function detectInsecureConfig(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const checks: Array<{
    id: string
    re: RegExp
    severity: AuditFinding['severity']
    cwe: string
    references: string[]
    title: string
    problem: string
    goal: string
    steps: string[]
  }> = [
    {
      id: 'tls-disabled',
      re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*["']?0|verify\s*=\s*False/,
      severity: 'high',
      cwe: 'CWE-295 — Improper Certificate Validation',
      references: ['OWASP A02:2021 — Cryptographic Failures'],
      title: 'TLS certificate verification disabled',
      problem: 'Certificate verification is turned off, so the connection accepts any certificate. This silently enables man-in-the-middle interception of traffic and credentials.',
      goal: 'Restore certificate verification for all outbound TLS connections.',
      steps: [
        'Remove the flag that disables verification (rejectUnauthorized: false / NODE_TLS_REJECT_UNAUTHORIZED=0 / verify=False).',
        'If a self-signed cert is genuinely needed for a specific host, pin that single CA certificate instead of disabling verification globally.',
        'Confirm no library is configured to ignore TLS errors elsewhere.'
      ]
    },
    {
      id: 'wildcard-cors-credentials',
      re: /credentials\s*:\s*true/,
      severity: 'high',
      cwe: 'CWE-942 — Permissive Cross-domain Policy with Untrusted Domains',
      references: ['OWASP A05:2021 — Security Misconfiguration'],
      title: 'Permissive CORS with credentials',
      problem: 'Credentialed CORS combined with a wildcard or reflected origin lets any site make authenticated requests on a user\u2019s behalf.',
      goal: 'Restrict CORS to an explicit allowlist of trusted origins when credentials are enabled.',
      steps: [
        'Confirm the allowed origin is not "*" or a reflected request origin when credentials are sent.',
        'Replace any wildcard/reflected origin with an explicit allowlist of trusted origins.',
        'Allow only the methods and headers actually required.'
      ]
    },
    {
      id: 'debug-on',
      re: /DEBUG\s*=\s*True|app\.run\([^)]*debug\s*=\s*True|debug\s*:\s*true/,
      severity: 'medium',
      cwe: 'CWE-489 — Active Debug Code',
      references: ['OWASP A05:2021 — Security Misconfiguration'],
      title: 'Debug mode may be enabled',
      problem: 'Debug mode exposes stack traces, internal paths, and sometimes an interactive console to clients — a major information-disclosure and RCE risk in production.',
      goal: 'Ensure debug mode is driven by environment and is off in production.',
      steps: [
        'Drive the debug flag from an environment variable that defaults to off.',
        'Confirm production deployments never enable it.',
        'Ensure detailed error pages and stack traces are never returned to clients in production.'
      ]
    }
  ]

  for (const file of input.files) {
    if (isTestOrExampleFile(file.path)) continue
    for (const c of checks) {
      // CORS check only matters when a wildcard/reflected origin is also nearby.
      if (c.id === 'wildcard-cors-credentials') {
        if (!c.re.test(file.content)) continue
        if (!/origin\s*:\s*(?:true|["']\*["']|req\.|request\.)/i.test(file.content) && !/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i.test(file.content)) {
          continue
        }
      }
      const m = c.re.exec(file.content)
      if (!m) continue
      findings.push(
        fileFinding({
          input,
          file,
          index: m.index,
          id: `config-${c.id}-${file.path}`,
          category: 'Config',
          severity: c.severity,
          cwe: c.cwe,
          references: c.references,
          title: c.title,
          detail: c.problem,
          fix: {
            task: `Fix insecure configuration: ${c.title.toLowerCase()}`,
            where: `${file.path} — at the line marked above`,
            problem: c.problem,
            goal: c.goal,
            steps: c.steps
          },
          test: {
            objective: `Prove the insecure configuration (${c.title.toLowerCase()}) is not present at runtime.`,
            steps: [
              'Start the app with production settings.',
              'Assert the insecure behavior is gone (TLS errors are enforced / CORS rejects untrusted origins / debug responses are not returned).'
            ]
          }
        })
      )
      break
    }
    if (findings.length >= 6) break
  }
  return findings
}

/** Electron hardening regressions: the renderer-to-RCE settings the security checklist forbids. */
function detectElectronMisconfig(input: AuditRuleInput): AuditFinding[] {
  if (!isElectron(input.ctx)) return []
  const findings: AuditFinding[] = []
  const re =
    /nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webSecurity\s*:\s*false|allowRunningInsecureContent\s*:\s*true/
  for (const file of input.files) {
    if (isTestOrExampleFile(file.path)) continue
    const m = re.exec(file.content)
    if (!m) continue
    findings.push(
      fileFinding({
        input,
        file,
        index: m.index,
        id: `electron-misconfig-${file.path}`,
        category: 'Config',
        severity: 'critical',
        cwe: 'CWE-829 — Inclusion of Functionality from Untrusted Control Sphere',
        references: ['Electron Security Checklist'],
        title: 'Electron security setting weakened',
        detail: `\`${m[0]}\` weakens Electron\u2019s renderer sandbox. With this set, any XSS in the renderer can escalate to full code execution on the user\u2019s machine.`,
        fix: {
          task: 'Restore Electron security defaults on the affected BrowserWindow',
          where: `${file.path} — uses \`${m[0]}\` at the line marked above`,
          problem: `\`${m[0]}\` removes a core renderer protection. A single XSS or compromised dependency in the renderer can then reach Node APIs and run arbitrary code on the host.`,
          goal: 'Re-enable the secure defaults and route all privileged work through the typed preload bridge.',
          steps: [
            'Set contextIsolation: true, nodeIntegration: false, and sandbox: true on every BrowserWindow.',
            'Do not disable webSecurity or enable allowRunningInsecureContent.',
            'Move any functionality that needed the weakened setting into a typed, validated contextBridge IPC method.'
          ]
        },
        test: {
          objective: 'Prove the renderer cannot reach Node/host APIs directly.',
          steps: [
            'From the renderer (or a test harness), attempt to access `require`, `process`, or a Node module.',
            'Assert they are undefined / unavailable because contextIsolation and sandbox are enforced.'
          ]
        }
      })
    )
    if (findings.length >= 4) break
  }
  return findings
}

/** CWE-338: Math.random() used for security-sensitive values (tokens, ids, passwords). */
function detectWeakRandomness(input: AuditRuleInput): AuditFinding[] {
  const findings: AuditFinding[] = []
  const sensitive = /token|secret|password|otp|api[_-]?key|session|csrf|nonce|reset|verify|uuid|salt/i
  for (const file of input.files) {
    if (isTestOrExampleFile(file.path)) continue
    const idx = file.content.search(/Math\.random\s*\(/)
    if (idx === -1) continue
    // Only flag when the surrounding code suggests a security-sensitive use.
    const around = file.content.slice(Math.max(0, idx - 160), idx + 160)
    if (!sensitive.test(around)) continue
    findings.push(
      fileFinding({
        input,
        file,
        index: idx,
        id: `weak-random-${file.path}`,
        category: 'Auth Flow',
        severity: 'medium',
        cwe: 'CWE-338 — Use of Cryptographically Weak Pseudo-Random Number Generator',
        references: ['OWASP A02:2021 — Cryptographic Failures'],
        title: 'Insecure randomness for a security value',
        detail:
          'Math.random() is not cryptographically secure — its output is predictable. Using it for tokens, ids, or secrets lets an attacker guess or forge them.',
        fix: {
          task: 'Replace insecure randomness with a cryptographically secure generator',
          where: `${file.path} — Math.random() used near a security-sensitive value at the line marked above`,
          problem:
            'Math.random() is a non-cryptographic PRNG; its sequence can be predicted. Any token, id, or secret derived from it can be guessed or forged.',
          goal: 'Generate security-sensitive values with a CSPRNG.',
          steps: [
            'Use crypto.randomBytes / crypto.randomUUID (Node) or crypto.getRandomValues (browser) — or secrets in Python — for the value.',
            'Ensure enough entropy (e.g. at least 128 bits for tokens).',
            'Confirm no other security value in the file still uses Math.random().'
          ]
        },
        test: {
          objective: 'Prove generated tokens are unpredictable and unique.',
          steps: [
            'Generate a large batch of tokens and assert there are no collisions.',
            'Assert the values come from the CSPRNG path, not Math.random().'
          ]
        }
      })
    )
    if (findings.length >= 4) break
  }
  return findings
}

/** Supply-chain hygiene: unpinned ranges and missing lockfile (silent compromised-update risk). */
function detectSupplyChain(input: AuditRuleInput): AuditFinding[] {
  const pkg = input.packageJson
  if (!pkg) return []
  const findings: AuditFinding[] = []
  const deps: Record<string, string> = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {})
  }
  const unpinned = Object.entries(deps)
    .filter(([, v]) => /^[\^~]|[*x]|latest|>=|</.test(v))
    .map(([k, v]) => `${k}@${v}`)

  if (unpinned.length > 0) {
    findings.push(
      metaFinding({
        input,
        id: 'unpinned-deps',
        category: 'Supply Chain',
        severity: 'medium',
        cwe: 'CWE-1104 — Use of Unmaintained Third Party Components',
        references: ['OWASP A06:2021 — Vulnerable and Outdated Components'],
        title: `${unpinned.length} unpinned dependenc${unpinned.length === 1 ? 'y' : 'ies'}`,
        detail:
          'Version ranges let a compromised or breaking update enter without any code change on your side. AI tools tend to leave versions unpinned.',
        evidence: unpinned.slice(0, 12).join('\n'),
        fix: {
          task: 'Pin unpinned dependency versions and lock the dependency tree',
          where: `These dependencies use range specifiers:\n${unpinned.slice(0, 30).join('\n')}`,
          problem:
            'Caret/tilde/star/latest ranges let a compromised or breaking update enter on the next install with no code change on your side. This is a primary supply-chain attack vector.',
          goal: 'Make installs deterministic by pinning to known-good versions and committing a lockfile.',
          steps: [
            'Pin each listed dependency to the version currently installed — do NOT blindly upgrade.',
            'Generate and commit the lockfile for my package manager.',
            'Explain briefly why exact pins + a committed lockfile reduce supply-chain risk.'
          ]
        },
        test: {
          objective: 'Prevent unpinned production dependencies from re-entering the project.',
          steps: [
            'Add a CI check that fails if package.json contains range specifiers (^, ~, *, latest) for production dependencies.',
            'Add a CI check that fails if the lockfile is out of sync with package.json.'
          ]
        }
      })
    )
  }

  if (!input.hasLockfile) {
    findings.push(
      metaFinding({
        input,
        id: 'missing-lockfile',
        category: 'Supply Chain',
        severity: 'high',
        cwe: 'CWE-1104 — Use of Unmaintained Third Party Components',
        references: ['OWASP A06:2021 — Vulnerable and Outdated Components'],
        title: 'No lockfile committed',
        detail:
          'Without a lockfile, installs are non-deterministic and a compromised transitive update can slip in silently.',
        fix: {
          task: 'Generate and commit a lockfile',
          where: 'Project root (no package-lock.json / pnpm-lock.yaml / yarn.lock / bun.lockb found).',
          problem:
            'With no lockfile, every install can resolve different transitive versions, so a compromised update can slip in silently and the build is not reproducible.',
          goal: 'Make dependency resolution deterministic and reproducible.',
          steps: [
            'Tell me which lockfile my package manager should produce and the exact command to generate it.',
            'Confirm the lockfile must be committed and never gitignored.',
            'Confirm CI should install with a frozen lockfile.'
          ]
        },
        test: {
          objective: 'Guarantee installs are reproducible and fail on dependency drift.',
          steps: [
            'Add a CI step that runs a clean, frozen-lockfile install (e.g. npm ci / pnpm install --frozen-lockfile / yarn --immutable).',
            'Assert the build fails if the lockfile is missing or out of sync.'
          ]
        }
      })
    )
  }

  return findings
}

/** Misconfiguration: a committed .gitignore that does not exclude env/secret files. */
function detectGitignoreGaps(input: AuditRuleInput): AuditFinding[] {
  const gi = input.gitignore
  if (gi == null) return []
  if (/\.env/i.test(gi)) return []
  return [
    metaFinding({
      input,
      id: 'gitignore-env-gap',
      category: 'Config',
      severity: 'medium',
      cwe: 'CWE-312 — Cleartext Storage of Sensitive Information',
      references: ['OWASP A05:2021 — Security Misconfiguration'],
      title: '.gitignore does not exclude .env files',
      detail:
        'Your .gitignore does not mention .env. A single accidental `git add` can commit your real secrets, and they then live in history permanently.',
      file: '.gitignore',
      fix: {
        task: 'Add env and secret files to .gitignore',
        where: '.gitignore (no .env exclusion found)',
        problem:
          'Without an .env rule, environment files containing real secrets can be committed by accident and become part of git history.',
        goal: 'Guarantee local secret files can never be committed.',
        steps: [
          'Add patterns for .env, .env.local, and other local secret files to .gitignore.',
          'Confirm no .env file is already tracked; if one is, tell me how to untrack and purge it.',
          'Keep a committed .env.example with placeholder (non-secret) values for onboarding.'
        ]
      },
      test: {
        objective: 'Prevent secret files from being committed.',
        steps: [
          'Add a pre-commit hook or CI check that fails if a tracked file matches .env*.',
          'Assert the check rejects an attempt to commit a .env file.'
        ]
      }
    })
  ]
}

const SEVERITY_RANK: Record<AuditFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

/**
 * Runs every pure rule over the gathered inputs and returns findings sorted by severity. No
 * I/O here — the AuditService reads the files and passes them in, which keeps the rules unit
 * testable and keeps all filesystem access in one audited place.
 */
export function runAuditRules(input: AuditRuleInput): AuditFinding[] {
  const findings = [
    ...detectClientSecrets(input),
    ...detectHardcodedSecrets(input),
    ...detectAuthorizationGaps(input),
    ...detectFrontendOnlyValidation(input),
    ...detectDangerousSinks(input),
    ...detectSqlInjection(input),
    ...detectCommandInjection(input),
    ...detectInsecureConfig(input),
    ...detectElectronMisconfig(input),
    ...detectWeakRandomness(input),
    ...detectSupplyChain(input),
    ...detectGitignoreGaps(input)
  ]
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}
