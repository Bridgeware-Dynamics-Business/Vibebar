import { describe, expect, it } from 'vitest'
import { type AuditContext, type AuditRuleInput, runAuditRules } from './auditRules.js'

const ctx: AuditContext = {
  label: 'my Next.js project (TypeScript)',
  framework: 'Next.js',
  language: 'TypeScript',
  testRunner: 'Playwright'
}

function input(partial: Partial<AuditRuleInput>): AuditRuleInput {
  return { ctx, files: [], packageJson: null, hasLockfile: true, ...partial }
}

describe('runAuditRules', () => {
  it('flags a public env secret in a client file as critical', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'src/lib/config.ts', content: 'export const k = process.env.NEXT_PUBLIC_API_SECRET_KEY' }
        ]
      })
    )
    const f = findings.find((x) => x.category === 'Exposed Secrets')
    expect(f).toBeDefined()
    expect(f?.severity).toBe('critical')
    expect(f?.fixPrompt).toContain('server-only')
    expect(f?.testPrompt).toContain('bundle')
  })

  it('adds an RLS finding when supabase is present', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/db.ts', content: "import { createClient } from '@supabase/supabase-js'" }]
      })
    )
    expect(findings.some((f) => f.id === 'supabase-rls')).toBe(true)
  })

  it('detects endpoints and emits a BOLA/IDOR test prompt', () => {
    const findings = runAuditRules(
      input({
        files: [
          {
            path: 'src/api/invoices.ts',
            content: "router.get('/api/invoices/:id', handler)\nrouter.post('/api/invoices', create)"
          }
        ]
      })
    )
    const f = findings.find((x) => x.id === 'bola-idor')
    expect(f).toBeDefined()
    expect(f?.testPrompt).toContain('User A')
    expect(f?.testPrompt).toContain('403')
  })

  it('flags frontend-only validation when no server validation exists', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/components/Form.tsx', content: 'const schema = z.object({ email: z.string().min(3) })' }]
      })
    )
    expect(findings.some((f) => f.id === 'frontend-only-validation')).toBe(true)
  })

  it('does not flag frontend-only validation when the server also validates', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'src/components/Form.tsx', content: 'z.object({ email: z.string().min(3) })' },
          { path: 'src/api/submit.ts', content: 'const parsed = schema.parse(req.body)' }
        ]
      })
    )
    expect(findings.some((f) => f.id === 'frontend-only-validation')).toBe(false)
  })

  it('flags dangerous DOM sinks', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/View.tsx', content: '<div dangerouslySetInnerHTML={{ __html: data }} />' }]
      })
    )
    expect(findings.some((f) => f.category === 'Input Validation' && f.title.includes('sink'))).toBe(true)
  })

  it('flags unpinned deps and missing lockfile', () => {
    const findings = runAuditRules(
      input({
        packageJson: { dependencies: { react: '^19.0.0', left: '*' }, devDependencies: { vite: '5.4.11' } },
        hasLockfile: false
      })
    )
    expect(findings.some((f) => f.id === 'unpinned-deps')).toBe(true)
    expect(findings.some((f) => f.id === 'missing-lockfile')).toBe(true)
  })

  it('sorts findings by severity (critical first)', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/c.ts', content: 'NEXT_PUBLIC_TOKEN_SECRET' }],
        packageJson: { dependencies: { react: '^19' } },
        hasLockfile: true
      })
    )
    expect(findings[0]?.severity).toBe('critical')
  })

  it('flags a hard-coded private key in a server file as critical', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'server/keys.ts', content: 'const key = `-----BEGIN RSA PRIVATE KEY-----\\nMIIEow...`' }
        ]
      })
    )
    const f = findings.find((x) => x.id.startsWith('hardcoded-private-key'))
    expect(f).toBeDefined()
    expect(f?.severity).toBe('critical')
    expect(f?.category).toBe('Exposed Secrets')
  })

  it('flags a hard-coded credential literal but ignores placeholders', () => {
    const real = runAuditRules(
      input({ files: [{ path: 'server/db.py', content: 'password = "S3cr3tP@ssw0rd!"' }] })
    )
    expect(real.some((f) => f.id.startsWith('hardcoded-generic-credential'))).toBe(true)

    const placeholder = runAuditRules(
      input({ files: [{ path: 'server/db.py', content: 'password = "your-password-here"' }] })
    )
    expect(placeholder.some((f) => f.id.startsWith('hardcoded-generic-credential'))).toBe(false)
  })

  it('does not flag secrets inside test/example files', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'server/keys.test.ts', content: 'AKIAIOSFODNN7EXAMPLE0' }]
      })
    )
    expect(findings.some((f) => f.category === 'Exposed Secrets')).toBe(false)
  })

  it('detects string-built SQL as a possible injection', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'server/users.py', content: 'cur.execute(f"SELECT * FROM users WHERE id = {user_id}")' }
        ]
      })
    )
    expect(findings.some((f) => f.id.startsWith('sql-injection'))).toBe(true)
  })

  it('detects OS command injection from interpolation', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'server/run.ts', content: 'exec(`convert ${userFile} out.png`)' }]
      })
    )
    const f = findings.find((x) => x.id.startsWith('command-injection'))
    expect(f).toBeDefined()
    expect(f?.severity).toBe('critical')
  })

  it('flags disabled TLS verification as a config issue', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'server/client.ts', content: 'const agent = new https.Agent({ rejectUnauthorized: false })' }]
      })
    )
    expect(findings.some((f) => f.category === 'Config' && f.id.includes('tls-disabled'))).toBe(true)
  })

  it('flags weakened Electron security settings for electron projects', () => {
    const electronCtx: AuditContext = { ...ctx, framework: 'Electron' }
    const findings = runAuditRules({
      ctx: electronCtx,
      files: [{ path: 'src/main/index.ts', content: 'new BrowserWindow({ webPreferences: { nodeIntegration: true } })' }],
      packageJson: null,
      hasLockfile: true
    })
    const f = findings.find((x) => x.id.startsWith('electron-misconfig'))
    expect(f).toBeDefined()
    expect(f?.severity).toBe('critical')
  })

  it('does not flag electron settings for non-electron projects', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/main/index.ts', content: 'const opts = { nodeIntegration: true }' }]
      })
    )
    expect(findings.some((f) => f.id.startsWith('electron-misconfig'))).toBe(false)
  })

  it('flags Math.random used for a security-sensitive value', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'server/token.ts', content: 'const token = Math.random().toString(36)' }]
      })
    )
    expect(findings.some((f) => f.id.startsWith('weak-random'))).toBe(true)
  })

  it('does not flag Math.random for non-sensitive use', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/anim.ts', content: 'const jitter = Math.random() * 10' }]
      })
    )
    expect(findings.some((f) => f.id.startsWith('weak-random'))).toBe(false)
  })

  it('flags a .gitignore that does not exclude .env', () => {
    const findings = runAuditRules(input({ gitignore: 'node_modules\ndist\n' }))
    expect(findings.some((f) => f.id === 'gitignore-env-gap')).toBe(true)
  })

  it('does not flag a .gitignore that already excludes .env', () => {
    const findings = runAuditRules(input({ gitignore: 'node_modules\n.env\n.env.local\n' }))
    expect(findings.some((f) => f.id === 'gitignore-env-gap')).toBe(false)
  })

  it('attaches rich context (line, code frame, CWE) to file-based findings and embeds it in the prompt', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'src/View.tsx', content: 'const x = 1\nconst y = 2\n<div dangerouslySetInnerHTML={{ __html: data }} />' }
        ]
      })
    )
    const f = findings.find((x) => x.id.startsWith('xss-sink'))
    expect(f).toBeDefined()
    expect(f?.line).toBe(3)
    expect(f?.cwe).toContain('CWE-79')
    expect(f?.codeContext).toContain('>')
    expect(f?.codeContext).toContain('dangerouslySetInnerHTML')
    // The fix prompt must carry the structured finding context for the LLM.
    expect(f?.fixPrompt).toContain('Security finding')
    expect(f?.fixPrompt).toContain('Location: line 3')
    expect(f?.fixPrompt).toContain('CWE-79')
  })

  it('detects Python FastAPI endpoints for BOLA/IDOR review', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'app/main.py', content: '@app.get("/users/{user_id}")\ndef get_user(user_id): ...' }]
      })
    )
    expect(findings.some((f) => f.id === 'bola-idor')).toBe(true)
  })
})
