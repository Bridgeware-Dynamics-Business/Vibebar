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

  it('adds an RLS finding when supabase is an actual dependency', () => {
    // Updated for Fix D: the RLS meta-finding now requires @supabase/supabase-js to be a real
    // dependency, not merely a `createClient`/"supabase" string match (which fixture text triggers).
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/db.ts', content: "import { createClient } from '@supabase/supabase-js'" }],
        packageJson: { dependencies: { '@supabase/supabase-js': '^2.45.0' } }
      })
    )
    expect(findings.some((f) => f.id === 'supabase-rls')).toBe(true)
  })

  it('does not add an RLS finding when supabase is only fixture/string text', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/db.ts', content: "const x = 'supabase'\nconst c = createClient(url, key)" }]
      })
    )
    expect(findings.some((f) => f.id === 'supabase-rls')).toBe(false)
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

/**
 * Regression suite encoding the 16 false positives VibeBar's audit produced against its own repo.
 * Each case asserts NON-detection of a false positive (or accurate detection of the real version),
 * mirroring the real file paths/content that triggered the noise.
 */
describe('runAuditRules — self-audit false-positive regressions', () => {
  const electron: AuditContext = {
    label: 'my Electron project (TypeScript)',
    framework: 'Electron',
    language: 'TypeScript',
    testRunner: 'Vitest'
  }
  const node: AuditContext = { ...electron, framework: 'Node' }

  function withCtx(c: AuditContext, partial: Partial<AuditRuleInput>): AuditRuleInput {
    return { ctx: c, files: [], packageJson: null, hasLockfile: true, ...partial }
  }

  // #1-5: fake/example keys inside test files must never be flagged as exposed secrets.
  it('does not flag fake AWS keys living in test files (Fix B)', () => {
    const findings = runAuditRules(
      input({
        files: [
          { path: 'src/main/audit/auditRules.test.ts', content: 'const k = "AKIA1234567890ABCDEF"' },
          { path: 'packages/core/src/secretScanner.test.ts', content: 'const k = "AKIAIOSFODNN7EXAMPLE0"' },
          { path: 'src/lib/contextPacker.test.ts', content: 'process.env.NEXT_PUBLIC_FOO_SECRET' }
        ]
      })
    )
    expect(findings.some((f) => f.category === 'Exposed Secrets')).toBe(false)
  })

  // #1-5 hardening: obviously-fake keys in a real (non-test) client file are filtered out (Fix E).
  it('does not flag an obviously-fake AWS key in a real client file (Fix E)', () => {
    const findings = runAuditRules(
      input({ files: [{ path: 'src/config.ts', content: 'const k = "AKIA1234567890ABCDEF"' }] })
    )
    expect(findings.some((f) => f.category === 'Exposed Secrets')).toBe(false)
  })

  // #2/#5: Electron main process is not browser-reachable, so a NEXT_PUBLIC_* ref there is not a
  // client-bundle secret.
  it('does not treat the Electron main process as a client bundle (Fix C)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/main/index.ts', content: 'const k = process.env.NEXT_PUBLIC_API_SECRET_KEY' }]
      })
    )
    expect(findings.some((f) => f.title.includes('client bundle'))).toBe(false)
  })

  // ...but a renderer file IS browser-reachable.
  it('still flags a real exposed secret reference in the Electron renderer (Fix C)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/renderer/config.ts', content: 'const k = process.env.NEXT_PUBLIC_API_SECRET_KEY' }]
      })
    )
    expect(findings.some((f) => f.category === 'Exposed Secrets')).toBe(true)
  })

  // #8-12: dangerous-sink keywords inside string literals / comments must not be flagged.
  it('does not flag a dangerous sink that only appears in a string literal (Fix A)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [
          {
            path: 'src/renderer/help.ts',
            content: 'export const guidance = "never use dangerouslySetInnerHTML or eval( on untrusted data"'
          }
        ]
      })
    )
    expect(findings.some((f) => f.title.includes('sink'))).toBe(false)
  })

  it('does not flag a dangerous sink that only appears in a comment (Fix A)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/renderer/help.ts', content: '// avoid dangerouslySetInnerHTML here\nconst x = 1' }]
      })
    )
    expect(findings.some((f) => f.title.includes('sink'))).toBe(false)
  })

  it('still flags a real dangerous sink in a renderer component (Fix A)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/renderer/View.tsx', content: '<div dangerouslySetInnerHTML={{ __html: data }} />' }]
      })
    )
    expect(findings.some((f) => f.title.includes('sink'))).toBe(true)
  })

  // #13: the TLS flag inside a remediation string / comment must not be flagged, real code must be.
  it('does not flag rejectUnauthorized:false inside a string or comment (Fix A)', () => {
    const str = runAuditRules(
      input({ files: [{ path: 'src/main/steps.ts', content: "const step = 'Remove the flag rejectUnauthorized: false from the agent'" }] })
    )
    expect(str.some((f) => f.id.includes('tls-disabled'))).toBe(false)

    const comment = runAuditRules(
      input({ files: [{ path: 'src/main/steps.ts', content: '// rejectUnauthorized: false is dangerous\nconst x = 1' }] })
    )
    expect(comment.some((f) => f.id.includes('tls-disabled'))).toBe(false)
  })

  it('still flags real rejectUnauthorized:false code (Fix A)', () => {
    const findings = runAuditRules(
      input({ files: [{ path: 'src/main/net.ts', content: 'new https.Agent({ rejectUnauthorized: false })' }] })
    )
    expect(findings.some((f) => f.id.includes('tls-disabled'))).toBe(true)
  })

  // #15: Math.random mentioned only in a doc comment / string near "token" must not be flagged.
  it('does not flag Math.random mentioned only in a comment (Fix A)', () => {
    const findings = runAuditRules(
      input({
        files: [{ path: 'src/main/util.ts', content: '// Math.random() is not safe for a token or secret\nconst x = 1' }]
      })
    )
    expect(findings.some((f) => f.id.startsWith('weak-random'))).toBe(false)
  })

  // #6: Supabase RLS must not fire on fixture text without the real dependency (also see updated test).
  it('does not flag Supabase RLS from a string match alone (Fix D)', () => {
    const findings = runAuditRules(
      input({ files: [{ path: 'src/db.ts', content: "const note = 'we considered supabase + createClient once'" }] })
    )
    expect(findings.some((f) => f.id === 'supabase-rls')).toBe(false)
  })

  // #7: a desktop Electron app with no HTTP server emits no BOLA/IDOR finding.
  it('does not flag BOLA/IDOR for an Electron app with no server surface (Fix D)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/main/index.ts', content: "router.get('/x/:id', h)\nrouter.post('/x', c)" }]
      })
    )
    expect(findings.some((f) => f.id === 'bola-idor')).toBe(false)
  })

  // #14: frontend-only validation is unsatisfiable without a server surface — suppress it.
  it('does not flag frontend-only validation when there is no server surface (Fix D)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [{ path: 'src/renderer/Form.tsx', content: 'const schema = z.object({ email: z.string().min(3) })' }]
      })
    )
    expect(findings.some((f) => f.id === 'frontend-only-validation')).toBe(false)
  })

  // #16: unpinned dev deps with a committed lockfile should not produce a (misleading) finding.
  it('does not flag unpinned dev-only deps when a lockfile is committed (Fix F)', () => {
    const findings = runAuditRules(
      withCtx(node, {
        packageJson: {
          devDependencies: { '@types/node': '^22.10.1', typescript: '^5.7.2', vitest: '^2.1.8' }
        },
        hasLockfile: true
      })
    )
    expect(findings.some((f) => f.id === 'unpinned-deps')).toBe(false)
    expect(findings.some((f) => f.id === 'missing-lockfile')).toBe(false)
  })

  it('downgrades unpinned PROD deps to low severity when a lockfile is committed (Fix F)', () => {
    const findings = runAuditRules(
      withCtx(node, { packageJson: { dependencies: { react: '^19.0.0' } }, hasLockfile: true })
    )
    const f = findings.find((x) => x.id === 'unpinned-deps')
    expect(f).toBeDefined()
    expect(f?.severity).toBe('low')
  })

  it('skips workspace: protocol deps when reporting unpinned ranges (Fix F)', () => {
    const findings = runAuditRules(
      withCtx(node, {
        packageJson: { dependencies: { '@vibebar/shared': 'workspace:*' } },
        hasLockfile: false
      })
    )
    expect(findings.some((f) => f.id === 'unpinned-deps')).toBe(false)
  })

  // Fix E: the matched secret value must never be echoed back in evidence or the code frame.
  it('redacts the secret value in evidence and code context (Fix E)', () => {
    const realKey = 'AKIAZ7QW3E9R8T6Y1U2P'
    const findings = runAuditRules(
      input({ files: [{ path: 'src/config.ts', content: `const k = "${realKey}"` }] })
    )
    const f = findings.find((x) => x.category === 'Exposed Secrets')
    expect(f).toBeDefined()
    expect(f?.evidence).not.toContain(realKey)
    expect(f?.codeContext).not.toContain(realKey)
    expect(f?.fixPrompt).not.toContain(realKey)
    expect(f?.evidence).toContain('redacted')
  })

  it('redacts hard-coded server secrets too (Fix E)', () => {
    const findings = runAuditRules(
      input({ files: [{ path: 'server/db.py', content: 'password = "S3cr3tP@ssw0rd!"' }] })
    )
    const f = findings.find((x) => x.id.startsWith('hardcoded-generic-credential'))
    expect(f).toBeDefined()
    expect(f?.evidence).not.toContain('S3cr3tP@ssw0rd!')
  })

  // Fix G: an inline `vibebar-ignore` directive suppresses the finding on that line (or the one below).
  it('suppresses a finding via a vibebar-ignore comment on the line above (Fix G)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [
          {
            path: 'src/renderer/View.tsx',
            content: '// vibebar-ignore\n<div dangerouslySetInnerHTML={{ __html: data }} />'
          }
        ]
      })
    )
    expect(findings.some((f) => f.title.includes('sink'))).toBe(false)
  })

  it('suppresses only the named rule when vibebar-ignore has a rule id (Fix G)', () => {
    const findings = runAuditRules(
      withCtx(electron, {
        files: [
          {
            path: 'src/renderer/View.tsx',
            content: '<div dangerouslySetInnerHTML={{ __html: data }} /> // vibebar-ignore xss-sink'
          }
        ]
      })
    )
    expect(findings.some((f) => f.title.includes('sink'))).toBe(false)
  })
})
