import type { AuditFinding } from '@shared/types.js'
import { depMap, hasServerSurface, isElectron, isServerish, isTestOrExampleFile } from '../engine/context.js'
import { fileFinding, metaFinding } from '../engine/prompts.js'
import type { FileRule, ProjectRule } from './types.js'

/** CWE-16 / CWE-295: dangerous runtime configuration (disabled TLS checks, wildcard CORS, debug on). */
export const insecureConfigRule: FileRule = {
  id: 'config',
  category: 'Config',
  scope: 'file',
  cap: 6,
  prefilter: (c) =>
    /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|credentials\s*:\s*true|DEBUG\s*=\s*True|debug\s*[:=]\s*[tT]rue|app\.run\(/.test(
      c
    ),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
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

    const masked = ctx.masked()
    for (const c of checks) {
      if (c.id === 'wildcard-cors-credentials') {
        if (!c.re.test(masked)) continue
        if (!/origin\s*:\s*(?:true|["']\*["']|req\.|request\.)/i.test(file.content) && !/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i.test(file.content)) {
          continue
        }
      }
      const m = c.re.exec(masked)
      if (!m) continue
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `config-${c.id}-${file.path}`,
          category: 'Config',
          severity: c.severity,
          confidence: 'high',
          remediationEffort: 'trivial',
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
      ]
    }
    return []
  }
}

/** Electron hardening regressions: the renderer-to-RCE settings the security checklist forbids. */
export const electronMisconfigRule: FileRule = {
  id: 'electron-misconfig',
  category: 'Config',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /nodeIntegration|contextIsolation|sandbox|webSecurity|allowRunningInsecureContent/.test(c),
  appliesTo: ({ file, input }) => isElectron(input.ctx) && !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const re =
      /nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webSecurity\s*:\s*false|allowRunningInsecureContent\s*:\s*true/
    const m = re.exec(ctx.masked())
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `electron-misconfig-${file.path}`,
        category: 'Config',
        severity: 'critical',
        confidence: 'high',
        remediationEffort: 'moderate',
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
    ]
  }
}

/** CWE-1004 / CWE-614: cookies set without HttpOnly / Secure / SameSite. */
export const insecureCookieRule: FileRule = {
  id: 'insecure-cookie',
  category: 'Config',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /\.cookie\s*\(|cookie\s*:\s*\{|setCookie|res\.setHeader\(\s*["']Set-Cookie/i.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    const m = /(\.cookie\s*\(|cookie\s*:\s*\{|res\.setHeader\(\s*["']Set-Cookie["'])/i.exec(masked)
    if (!m) return []
    // Only flag when the security attributes are absent in the file (cheap, file-level heuristic).
    const hasHttpOnly = /httpOnly\s*:\s*true|HttpOnly/i.test(file.content)
    const hasSecure = /secure\s*:\s*true|;\s*Secure/i.test(file.content)
    const hasSameSite = /sameSite/i.test(file.content)
    if (hasHttpOnly && hasSecure && hasSameSite) return []
    const missing = [
      !hasHttpOnly ? 'HttpOnly' : null,
      !hasSecure ? 'Secure' : null,
      !hasSameSite ? 'SameSite' : null
    ].filter(Boolean)
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `insecure-cookie-${file.path}`,
        category: 'Config',
        severity: 'medium',
        confidence: 'low',
        remediationEffort: 'trivial',
        cwe: 'CWE-1004 — Sensitive Cookie Without HttpOnly Flag',
        references: ['OWASP A05:2021 — Security Misconfiguration'],
        title: `Cookie may be missing ${missing.join(' / ')}`,
        detail: `A cookie is set in this file but ${missing.join(', ')} could not be confirmed. Without HttpOnly a cookie is readable by XSS; without Secure it leaks over HTTP; without SameSite it is exposed to CSRF.`,
        fix: {
          task: 'Set HttpOnly, Secure, and SameSite on session/auth cookies',
          where: `${file.path} — a cookie is set at the line marked above`,
          problem:
            'Cookies that carry session or auth state must be HttpOnly (not script-readable), Secure (HTTPS only), and SameSite (CSRF-resistant). Missing any of these widens the attack surface.',
          goal: 'Ensure every sensitive cookie is HttpOnly + Secure + SameSite=Lax/Strict.',
          steps: [
            'Add httpOnly: true and secure: true to the cookie options (gate Secure behind a prod check if you develop over HTTP).',
            'Set sameSite to "lax" (or "strict" for the most sensitive cookies).',
            'Confirm non-sensitive cookies that genuinely need JS access are clearly separated from session/auth cookies.'
          ]
        },
        test: {
          objective: 'Prove session/auth cookies carry the right attributes.',
          steps: [
            'Log in and inspect the Set-Cookie response header for the session/auth cookie.',
            'Assert it includes HttpOnly, Secure, and SameSite.'
          ]
        }
      })
    ]
  }
}

/** Missing browser-safety headers (no Content-Security-Policy / helmet) on a web server. */
export const securityHeadersRule: ProjectRule = {
  id: 'security-headers',
  category: 'Config',
  scope: 'project',
  run({ input }) {
    if (!hasServerSurface(input)) return []
    if (isElectron(input.ctx)) return []
    // Only meaningful for HTTP server frameworks that render/serve to browsers.
    const deps = depMap(input.packageJson)
    const isHttpServer =
      Object.keys(deps).some((d) => /^(express|fastify|koa|@nestjs\/|next|nuxt|remix|hono|@sveltejs\/kit)/i.test(d)) ||
      /next|nuxt|remix|express|fastify|koa|nest|hono|sveltekit/i.test(input.ctx.framework)
    if (!isHttpServer) return []
    if (Object.prototype.hasOwnProperty.call(deps, 'helmet')) return []
    const hasHeaders = input.files.some(
      (f) =>
        isServerish(f.path) &&
        /Content-Security-Policy|helmet\s*\(|X-Frame-Options|Strict-Transport-Security|frameAncestors|contentSecurityPolicy/i.test(
          f.content
        )
    )
    if (hasHeaders) return []
    return [
      metaFinding({
        input,
        id: 'security-headers',
        category: 'Config',
        severity: 'medium',
        confidence: 'low',
        remediationEffort: 'moderate',
        cwe: 'CWE-693 — Protection Mechanism Failure',
        references: ['OWASP A05:2021 — Security Misconfiguration'],
        title: 'No security response headers detected',
        detail:
          'This project exposes an HTTP server but no Content-Security-Policy, HSTS, X-Frame-Options, or helmet usage was found. Without these headers the app is more exposed to XSS, clickjacking, and downgrade attacks.',
        fix: {
          task: 'Add a baseline set of HTTP security headers',
          where: 'The HTTP server setup (no CSP / helmet / security headers were detected).',
          problem:
            'Security response headers are a cheap, high-value defense layer. Their absence leaves XSS, clickjacking, and protocol-downgrade attacks easier to pull off.',
          goal: 'Send a sensible baseline of security headers on every response.',
          steps: [
            'Add a Content-Security-Policy that is as strict as the app allows (start in report-only if needed).',
            'Add Strict-Transport-Security, X-Content-Type-Options: nosniff, Referrer-Policy, and X-Frame-Options/frame-ancestors.',
            'For Node, consider the helmet middleware; for Next/Nuxt, set headers in the framework config.'
          ]
        },
        test: {
          objective: 'Prove the security headers are present on responses.',
          steps: [
            'Make a request to a representative route and inspect the response headers.',
            'Assert CSP, HSTS, X-Content-Type-Options, and a framing protection header are present.'
          ]
        }
      })
    ]
  }
}

/** Misconfiguration: a committed .gitignore that does not exclude env/secret files. */
export const gitignoreRule: ProjectRule = {
  id: 'gitignore-env-gap',
  category: 'Config',
  scope: 'project',
  run({ input }) {
    const gi = input.gitignore
    if (gi == null) return []
    if (/\.env/i.test(gi)) return []
    return [
      metaFinding({
        input,
        id: 'gitignore-env-gap',
        category: 'Config',
        severity: 'medium',
        confidence: 'high',
        remediationEffort: 'trivial',
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
}
