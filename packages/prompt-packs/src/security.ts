import type { PromptTemplate } from '@vibebar/prompt-engine'

/**
 * Behavioral-security pack. Scanners answer "does this code contain known bad patterns?";
 * these prompts drive the missing layer — "does this app actually behave safely at runtime?" —
 * by generating end-to-end tests for the failure modes AI-generated code reliably ships:
 * BOLA/IDOR, frontend-only validation, broken auth flows, client-exposed secrets, and
 * supply-chain drift. They are written to give an LLM enough context to act precisely and map
 * to the OWASP Top 10 / OWASP API Security Top 10.
 */
export const SECURITY_PROMPTS: PromptTemplate[] = [
  {
    id: 'sec-behavioral-suite',
    title: 'Generate a behavioral security test suite',
    categories: ['Testing', 'Security'],
    stacks: ['any'],
    description: 'Builds runtime tests that catch what static scanners cannot — ordered by blast radius.',
    variables: [
      { key: 'testRunner', source: 'testRunner', default: 'Playwright', label: 'Runner' }
    ],
    guardrails: ['validate-input', 'no-secrets'],
    builtIn: true,
    body: [
      'You are an application security engineer hardening my {{framework}} project ({{language}}). Static analysis already checks the source; I need behavioral tests that prove the running app enforces its security rules. These map to the OWASP API Security Top 10.',
      '',
      'First, map the attack surface: list the routes/handlers, which require authentication, which return or mutate user-owned data, and which are admin-only. Show me this map before writing tests so I can correct it.',
      '',
      'Then, using {{testRunner}}, generate an end-to-end suite ordered by blast radius (auth → payments/billing → user-data endpoints → admin → everything else). Drive the API directly with raw HTTP requests, not through the UI — UI tests inherit the frontend\u2019s assumptions and hide server-side gaps.',
      '',
      'Write a separate, independent test for each of:',
      '1. **Authentication (API2)** — protected routes return 401 with no session, with a malformed token, and with an expired token.',
      '2. **Object-level authz / BOLA (API1)** — User A cannot read or modify User B\u2019s resources by changing an id; expect 403/404, never 200 with B\u2019s data.',
      '3. **Function-level authz (API5)** — a normal user cannot reach admin-only actions even if they know the route.',
      '4. **Server-side validation (API6)** — invalid/oversized/wrong-type input sent straight to the API is rejected with 4xx before any side effect.',
      '5. **Mass assignment** — extra fields like `role`, `isAdmin`, `ownerId` in a request body are ignored, not persisted.',
      '6. **Workflow integrity** — multi-step flows (checkout, onboarding) cannot be completed by calling a later step directly.',
      '7. **Rate limiting (API4)** — sensitive endpoints throttle rapid repeated calls.',
      '',
      'For each test: a one-line comment naming the real-world vulnerability it prevents, fixtures that create the needed users/resources, and assertions on status code AND response body. Make each test FAIL if the protection is missing and PASS once it holds. Finish with the command to run the suite and a note on wiring it into CI on every deploy.'
    ].join('\n')
  },
  {
    id: 'sec-bola-idor',
    title: 'Test for broken object-level authorization (IDOR)',
    categories: ['Security', 'Auth', 'Testing'],
    stacks: ['any'],
    description: 'The single most effective test for OWASP API #1 — the most common critical API flaw.',
    variables: [
      { key: 'testRunner', source: 'testRunner', default: 'Playwright', label: 'Runner' }
    ],
    guardrails: ['validate-input'],
    builtIn: true,
    body: [
      'For my {{framework}} project, prove that object-level authorization (BOLA/IDOR — OWASP API #1) is enforced on every endpoint that touches user-scoped data.',
      '',
      'Step 1 — Inventory. Scan the codebase and list every endpoint that accepts a resource identifier (path param, query param, or body field like `id`, `userId`, `orderId`, slug, or UUID) and returns or mutates data tied to a specific user. Show the method, path, and the file/handler for each.',
      '',
      'Step 2 — Generate tests with {{testRunner}}. For each endpoint: create User A and User B with their own resources; authenticate as User A; obtain an id that belongs to User B; then call the endpoint as User A against B\u2019s id.',
      '',
      'Assert that:',
      '- Read endpoints return 403 or 404 — never 200 with User B\u2019s data.',
      '- Write/delete endpoints reject the request AND leave User B\u2019s resource unchanged (verify with a follow-up read).',
      '- A 404 (not 403) is used where revealing existence would itself leak information.',
      '',
      'Hit the API directly, not the UI. For any endpoint where the ownership model is unclear or the check is missing, stop and point me to the exact handler, then show the minimal guard to add (an ownership check or scoped query) before the resource is read or written.'
    ].join('\n')
  },
  {
    id: 'sec-auth-flow',
    title: 'Test the auth flow dynamically',
    categories: ['Auth', 'Security', 'Testing'],
    stacks: ['any'],
    description: 'Catches token reuse, missing expiry, and sessions that survive a password reset.',
    variables: [
      { key: 'testRunner', source: 'testRunner', default: 'Playwright', label: 'Runner' }
    ],
    guardrails: ['no-secrets', 'validate-input'],
    builtIn: true,
    body: [
      'Write behavioral tests with {{testRunner}} for the authentication, session, and password-reset flows in my {{framework}} project. A static review may confirm a "secure" token function is used; I need to verify the lifecycle actually behaves correctly (OWASP API2 — broken authentication).',
      '',
      'First, identify the auth mechanism in use (sessions, JWT, provider/OAuth) and where tokens are issued, stored, and validated. State your findings, then test against the real endpoints:',
      '',
      '- **Credentials** — login fails with wrong password; the same error is returned for unknown vs. known users (no account enumeration); repeated failures trigger lockout/throttling.',
      '- **Session/token expiry** — a token is genuinely rejected after it expires, not just hidden in the UI; tampered/forged tokens are rejected.',
      '- **Password reset** — a reset token is single-use, time-limited, and is invalidated the moment the password changes.',
      '- **Session invalidation** — changing the password or logging out invalidates existing sessions/tokens server-side, not just client-side.',
      '- **Rotation** — issuing a new token/refresh invalidates the previous one (no replay).',
      '',
      'For every assertion that fails today, name the exact file and the minimal fix. Drive everything through real requests so the test reflects production behavior, and make each test fail when the protection is absent.'
    ].join('\n')
  },
  {
    id: 'sec-server-validation',
    title: 'Enforce validation server-side',
    categories: ['Security', 'Testing'],
    stacks: ['any'],
    description: 'Frontend validation is not a security control — prove the API enforces it too.',
    variables: [],
    guardrails: ['validate-input', 'parameterized-queries'],
    builtIn: true,
    body: [
      'My {{framework}} project may validate input only in the UI, which is a security gap (OWASP API6): anyone calling the API directly with curl/fetch/a script skips the form entirely. Add server-side validation as the source of truth and prove it.',
      '',
      'Step 1 — Add validation. For every endpoint that accepts data, define an explicit schema {{#if isPython}}(e.g. a Pydantic model){{else}}(e.g. zod / valibot / yup){{/if}} describing the allowed shape, types, ranges, and lengths. Validate at the very start of each handler and reject invalid input with a clear 4xx before any database, filesystem, or business logic runs. Keep client checks for UX, but never rely on them.',
      '',
      'Step 2 — Prevent over-posting. Accept only the fields each endpoint expects; strip or reject unknown fields so an attacker cannot set `role`, `isAdmin`, `ownerId`, or pricing fields via mass assignment.',
      '',
      'Step 3 — Write tests. POST directly to each endpoint with inputs the frontend would never send: empty required fields, over-length strings, wrong types, negative numbers where positive is required, malformed email/URL, SQL fragments, and `<script>` payloads. Assert each is rejected with a 4xx and that nothing is persisted; then assert a valid payload still succeeds.',
      '',
      '{{#if hasDb}}Use parameterized queries or the ORM for any database access you touch — never build queries by string concatenation.{{/if}} Show me each schema, where it is applied, and the test command.'
    ].join('\n')
  },
  {
    id: 'sec-client-secret-rls',
    title: 'Find client-exposed secrets & verify RLS',
    categories: ['Security', 'Database'],
    stacks: ['any'],
    description: 'The Moltbook pattern: a public key is only safe if row-level security is on.',
    variables: [],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Audit my {{framework}} project for credentials reachable from the client, and verify that any "public" key is actually constrained server-side. This is the Moltbook failure mode: a public anon key is harmless only when row-level rules are enforced.',
      '',
      '1. **Find exposed secrets.** Search the source and the *built* client bundle for API keys, tokens, connection strings, private keys, and high-entropy strings. Flag anything that reaches the browser — including values behind NEXT_PUBLIC_/VITE_/REACT_APP_/EXPO_PUBLIC_ prefixes. Anything in the bundle is public; for each, tell me how to move it server-side and that it must be rotated because it is already compromised.',
      '{{#if hasDb}}2. **Verify row-level security.** My project has a database. If I use Supabase/Firebase-style public keys, confirm Row Level Security (or security rules) is enabled on *every* table/collection, list which ones are missing it, and give me policies enforcing a "users can only read/write their own rows" model for SELECT/INSERT/UPDATE/DELETE.{{else}}2. **Constrain public keys.** For any service that uses a "public"/"anon" key, document exactly what that key can do and confirm server-side rules actually limit it to the intended access.{{/if}}',
      '3. **Prove it.** Write a test that, using only the public/anon key, attempts to read and modify another user\u2019s row directly through the API and asserts every attempt is denied.',
      '',
      'Do not print any secret value back to me — refer to each by file and line only.'
    ].join('\n')
  },
  {
    id: 'sec-supply-chain',
    title: 'Audit dependencies & supply chain',
    categories: ['Security', 'Deploy'],
    stacks: ['any'],
    description: 'Unpinned versions, missing lockfile, typosquats, and hallucinated packages.',
    variables: [
      { key: 'packageManager', source: 'packageManager', default: 'npm', label: 'Package manager' }
    ],
    guardrails: [],
    builtIn: true,
    body: [
      'Audit the dependencies of my {{framework}} project for supply-chain risk (OWASP A06 — vulnerable & outdated components). AI-assisted code frequently leaves versions unpinned and occasionally invents package names, so verify, do not assume.',
      '',
      '- **Existence & identity** — confirm every direct dependency actually exists on the registry and is the package I intend. Flag possible typosquats (lookalike names) and AI-hallucinated packages that do not resolve.',
      '- **Pinning** — flag unpinned ranges (^, ~, *, latest, >=) for production dependencies and show how to pin to the exact installed versions with {{packageManager}} (do not blindly upgrade).',
      '- **Lockfile** — confirm a lockfile is committed and that CI installs with a frozen/immutable lockfile so transitive versions cannot drift.',
      '- **Known vulnerabilities** — list any dependency with a known CVE or that is deprecated/unmaintained, with the severity and the safe upgrade path.',
      '- **Install scripts** — flag dependencies that run postinstall/preinstall scripts, since these execute on every install.',
      '',
      'Output a prioritized table [Package | Issue | Severity | Action] followed by the exact commands to run. Do not suggest --force or ignoring peer-dependency errors without explaining the risk.'
    ].join('\n')
  },
  {
    id: 'sec-iteration-regression',
    title: 'Re-audit before I ship this change',
    categories: ['Security', 'Debugging'],
    stacks: ['any'],
    description: 'Iterations compound risk — re-check security on every change, not just at launch.',
    variables: [],
    guardrails: ['no-secrets', 'validate-input'],
    builtIn: true,
    body: [
      'I just iterated on my {{framework}} project. Each AI edit can silently weaken authorization or validation, and risk compounds across revisions. Review the diff I share (or the latest commit) as a security-focused code reviewer.',
      '',
      'Compare before vs. after and answer precisely:',
      '- Did any authentication, authorization, or ownership check get weakened, bypassed, or removed?',
      '- Did any input validation move to the client, get loosened, or disappear?',
      '- Were any secrets, keys, debug routes, verbose error responses, or `console.log` of sensitive data introduced?',
      '- Did any new dependency get added unpinned or from an unfamiliar source?',
      '- Did permissions widen anywhere (CORS, file access, SQL scope, role checks)?',
      '',
      'For every regression you find, first explain the concrete attack it enables, then write a failing test that captures it, then give me the minimal fix that makes the test pass. Keep each test in the suite permanently so the regression cannot return. If you find nothing, say so explicitly and name what you checked.'
    ].join('\n')
  }
]
