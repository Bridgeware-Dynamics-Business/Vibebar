import type { PromptTemplate } from '@vibebar/prompt-engine'

/** Python-stack prompts (FastAPI, Flask, Django) with backend security guardrails. */
export const PYTHON_PROMPTS: PromptTemplate[] = [
  {
    id: 'python-sql-injection',
    title: 'Audit for SQL injection',
    categories: ['Security', 'Database'],
    stacks: ['python', 'fastapi', 'flask', 'django'],
    description: 'Finds string-built queries and converts them to parameterized or ORM calls.',
    variables: [],
    guardrails: ['parameterized-queries', 'no-secrets'],
    builtIn: true,
    body: [
      'Audit my {{framework}} project for SQL injection (OWASP A03). Inspect every place the code talks to a database and trace whether user input reaches the query string.',
      '',
      'Find:',
      '- Queries built with f-strings, `%`, `.format()`, or `+` concatenation that include request data.',
      '- `cursor.execute` / `executemany` calls where values are interpolated into the SQL text instead of passed as parameters.',
      '- Raw SQL escape hatches in the ORM (`.raw()`, `RawSQL`, `text()`, `.extra()`) that embed user input.',
      '- Dynamic identifiers (table/column/ORDER BY built from input) — these cannot be parameterized and need an allowlist.',
      '',
      'For each finding: show the file/line, the before/after, and convert it to a parameterized query or proper ORM call (use a strict allowlist for dynamic identifiers). Explain the exact injection payload each fix prevents. Also confirm database credentials come from environment variables, not source. Do not introduce new query-building helpers that re-open the hole.'
    ].join('\n')
  },
  {
    id: 'python-input-validation',
    title: 'Add request validation',
    categories: ['Security', 'Auth'],
    stacks: ['python', 'fastapi', 'flask', 'django'],
    description: 'Validates and narrows request input at every endpoint boundary.',
    variables: [],
    guardrails: ['validate-input', 'no-secrets'],
    builtIn: true,
    body: [
      'Add rigorous input validation to my {{framework}} endpoints (OWASP API6). Treat every request as untrusted: validate the body, query params, path params, and headers before any of them are used.',
      '',
      '- Define an explicit schema per endpoint {{#if isPython}}(Pydantic models for FastAPI; serializers/forms for Django; a schema library like marshmallow/pydantic for Flask){{/if}} with types, ranges, lengths, and required/optional fields.',
      '- Reject invalid input early with a clear 4xx; do not partially process or coerce silently.',
      '- Prevent over-posting: accept only expected fields so a client cannot set privileged fields like `is_staff`, `role`, or `owner_id`.',
      '- Validate file uploads (size, type, name) and any pagination/sort params against an allowlist.',
      '',
      'Return safe error responses — never echo secrets, internal paths, or stack traces to the client. Show me each schema, where it is wired in, and order the work so the highest-risk endpoints (auth, payments, admin, anything writing to the DB) come first.'
    ].join('\n')
  },
  {
    id: 'python-secret-config',
    title: 'Secure config and secret keys',
    categories: ['Security', 'Deploy'],
    stacks: ['python', 'fastapi', 'flask', 'django'],
    description: 'Moves secret keys and config out of source and locks down production settings.',
    variables: [],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Review how my {{framework}} app loads configuration and secret keys (OWASP A05 — security misconfiguration). Inspect settings/config modules and anywhere credentials are referenced.',
      '',
      '- Move any hard-coded SECRET_KEY, database URL, API token, or password into environment variables or a secrets manager, loaded at startup with a clear failure if a required value is missing.',
      '- Confirm `.env` and local credential files are gitignored and not committed; if one is in history, tell me how to purge and rotate it.',
      '{{#if hasDb}}- Confirm DB credentials and connection strings are env-driven and not logged.{{/if}}',
      '- Lock down production: DEBUG/development mode off, ALLOWED_HOSTS/trusted hosts set, verbose error pages and stack traces disabled for clients, secure cookie flags and HTTPS-only where applicable.',
      '',
      'Output: a list of every value currently hard-coded or unsafe, each with the exact change to make it safe, and confirm none of the secret values appear in your response.'
    ].join('\n')
  }
]
