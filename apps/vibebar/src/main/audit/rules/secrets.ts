import type { AuditFinding } from '@shared/types.js'
import { hasDep, isClientFile, isElectron, isTestOrExampleFile } from '../engine/context.js'
import { isPlaceholderSecret, looksLikeFakeSecret } from '../engine/lexer.js'
import { fileFinding, metaFinding } from '../engine/prompts.js'
import type { FileRule, ProjectRule } from './types.js'

/** CWE-798 / the Moltbook pattern: secrets reachable from the client bundle. */
export const clientSecretRule: FileRule = {
  id: 'secret',
  category: 'Exposed Secrets',
  scope: 'file',
  cap: 30,
  prefilter: (content) =>
    /NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|sk_live_|AKIA|apiKey|bearer|authorization/i.test(content),
  appliesTo: ({ file, input }) => isClientFile(file.path, input.ctx),
  run(ctx) {
    const { file, input } = ctx
    const electron = isElectron(input.ctx)
    const reach = electron
      ? 'It ships in the Electron renderer bundle, so anyone who opens the renderer DevTools or unpacks the app can read it.'
      : 'It ships to the browser, so anyone can read it in DevTools or in the bundled JavaScript.'

    const patterns: Array<{ id: string; re: RegExp; what: string; valueLike: boolean }> = [
      { id: 'public-env-secret', re: /(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)\w*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE)\w*/i, what: 'a server secret exposed through a client-public env var', valueLike: false },
      { id: 'stripe-live', re: /sk_live_[A-Za-z0-9]{16,}/, what: 'a live Stripe secret key', valueLike: true },
      { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/, what: 'an AWS access key id', valueLike: true },
      { id: 'firebase-apikey', re: /apiKey\s*:\s*["']([A-Za-z0-9_\-]{20,})["']/, what: 'a hard-coded Firebase/web apiKey', valueLike: true },
      { id: 'generic-bearer', re: /(?:bearer|authorization)\s*[:=]\s*["']([A-Za-z0-9._\-]{20,})["']/i, what: 'a hard-coded auth token', valueLike: true }
    ]

    const findings: AuditFinding[] = []
    for (const p of patterns) {
      const m = p.re.exec(file.content)
      if (!m) continue
      const value = m[1] ?? m[0]
      if (p.valueLike && (isPlaceholderSecret(value) || looksLikeFakeSecret(value))) continue
      findings.push(
        fileFinding({
          input,
          file,
          index: m.index,
          id: `secret-${p.id}-${file.path}`,
          category: 'Exposed Secrets',
          severity: 'critical',
          confidence: 'high',
          remediationEffort: 'moderate',
          cwe: 'CWE-798 — Use of Hard-coded Credentials',
          references: ['OWASP A07:2021 — Identification and Authentication Failures', 'OWASP A05:2021 — Security Misconfiguration'],
          title: 'Secret reachable from the client bundle',
          detail: `Found ${p.what} in a file that ships to the client. ${reach}`,
          redact: p.valueLike ? [m[0], value] : [],
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
    return findings
  }
}

/** CWE-798: hard-coded credentials in any tracked file (covers server & Python code, not just the bundle). */
export const hardcodedSecretRule: FileRule = {
  id: 'hardcoded',
  category: 'Exposed Secrets',
  scope: 'file',
  cap: 8,
  prefilter: (content) =>
    /PRIVATE KEY|AKIA|sk_live_|AIza|gh[pousr]_|xox[baprs]-|password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret/i.test(
      content
    ),
  appliesTo: ({ file, input }) => !isClientFile(file.path, input.ctx) && !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const patterns: Array<{ id: string; re: RegExp; what: string; severity: AuditFinding['severity'] }> = [
      { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, what: 'a hard-coded private key', severity: 'critical' },
      { id: 'aws-key', re: /AKIA[0-9A-Z]{16}/, what: 'an AWS access key id', severity: 'critical' },
      { id: 'stripe-live', re: /sk_live_[A-Za-z0-9]{16,}/, what: 'a live Stripe secret key', severity: 'critical' },
      { id: 'gcp-key', re: /AIza[0-9A-Za-z_\-]{35}/, what: 'a Google API key', severity: 'high' },
      { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/, what: 'a GitHub access token', severity: 'high' },
      { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/, what: 'a Slack token', severity: 'high' },
      { id: 'generic-credential', re: /(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']([^"'\s]{8,})["']/i, what: 'a hard-coded credential assigned to a literal value', severity: 'high' }
    ]
    for (const p of patterns) {
      const m = p.re.exec(file.content)
      if (!m) continue
      const value = m[1] ?? m[0]
      if (p.id === 'generic-credential' && isPlaceholderSecret(value)) continue
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `hardcoded-${p.id}-${file.path}`,
          category: 'Exposed Secrets',
          severity: p.severity,
          confidence: p.id === 'generic-credential' ? 'medium' : 'high',
          remediationEffort: 'moderate',
          cwe: 'CWE-798 — Use of Hard-coded Credentials',
          references: ['OWASP A07:2021 — Identification and Authentication Failures'],
          title: 'Hard-coded secret in source',
          detail: `Found ${p.what} committed directly in source. Anyone with repository access (or a leaked clone) gains this credential, and it lives in git history even after deletion.`,
          redact: [m[0], value],
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
      ]
    }
    return []
  }
}

/** Supabase detected — verify Row Level Security (the Moltbook breach class). */
export const supabaseRlsRule: ProjectRule = {
  id: 'supabase-rls',
  category: 'Access Control',
  scope: 'project',
  run({ input }) {
    if (!hasDep(input.packageJson, '@supabase/supabase-js')) return []
    return [
      metaFinding({
        input,
        id: 'supabase-rls',
        category: 'Access Control',
        severity: 'high',
        confidence: 'medium',
        remediationEffort: 'involved',
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
    ]
  }
}
