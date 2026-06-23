import type { AuditFinding } from '@shared/types.js'
import { isTestOrExampleFile } from '../engine/context.js'
import { isPlaceholderSecret } from '../engine/lexer.js'
import { fileFinding } from '../engine/prompts.js'
import type { FileRule } from './types.js'

/** JWT misuse: `alg:none`, a hard-coded signing secret, or decoding without verifying. */
export const jwtRule: FileRule = {
  id: 'jwt-misuse',
  category: 'Auth Flow',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /jwt|jsonwebtoken|jose|algorithms?\s*[:=]|\.decode\(|\.verify\(|\.sign\(/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    const checks: Array<{
      re: RegExp
      against?: 'masked' | 'raw'
      severity: AuditFinding['severity']
      title: string
      detail: string
      problem: string
      goal: string
      steps: string[]
      capture?: number
      skipPlaceholder?: boolean
    }> = [
      {
        re: /algorithms?\s*[:=]\s*\[?\s*["']none["']/i,
        against: 'raw',
        severity: 'critical',
        title: 'JWT verification accepts the "none" algorithm',
        detail: 'Allowing the "none" algorithm means a token with no signature is accepted, so anyone can forge any token and impersonate any user.',
        problem: 'With "none" permitted, an attacker submits an unsigned token with arbitrary claims (e.g. a different user id or admin role) and it is accepted as valid.',
        goal: 'Only accept tokens signed with a strong, explicitly-allowed algorithm.',
        steps: [
          'Remove "none" from the allowed algorithms and pin an explicit allowlist (e.g. ["HS256"] or ["RS256"]).',
          'Always pass the expected algorithm(s) to verify(); never let the token header choose the algorithm.',
          'Confirm no code path decodes-and-trusts a token without verifying its signature.'
        ]
      },
      {
        re: /\b(?:jwt|jsonwebtoken)\.sign\s*\([^)]*,\s*["']([^"']{4,})["']/,
        against: 'raw',
        severity: 'high',
        capture: 1,
        skipPlaceholder: true,
        title: 'Hard-coded JWT signing secret',
        detail: 'The JWT signing secret is a string literal in source. Anyone with the code (or git history) can forge valid tokens for any user.',
        problem: 'A committed signing secret can be used by anyone who sees the repo to mint valid tokens, completely bypassing authentication.',
        goal: 'Load the signing secret from the environment and rotate the exposed one.',
        steps: [
          'Move the secret to an environment variable / secrets manager and read it at startup, failing loudly if missing.',
          'Rotate the secret at its source — the committed value must be treated as compromised, invalidating existing tokens.',
          'Use a long, high-entropy secret (or an asymmetric key pair for RS256).'
        ]
      },
      {
        re: /\b(?:jwt|jsonwebtoken)\.decode\s*\(/,
        against: 'masked',
        severity: 'medium',
        title: 'JWT decoded without verification',
        detail: 'jwt.decode() reads a token\u2019s claims WITHOUT checking its signature. If those claims drive an authorization decision, an attacker can forge them freely.',
        problem: 'decode() does not validate the signature, so any claim it returns (user id, role) is attacker-controllable if used for trust decisions.',
        goal: 'Verify the signature before trusting any claim.',
        steps: [
          'Replace decode() with verify() (with an explicit algorithm allowlist and the correct key) anywhere the claims affect authorization.',
          'Only use decode() for non-security purposes (e.g. reading an already-verified token), and document that clearly.',
          'Confirm every protected route validates the signature before reading claims.'
        ]
      }
    ]

    for (const c of checks) {
      const haystack = c.against === 'masked' ? masked : file.content
      const m = c.re.exec(haystack)
      if (!m) continue
      if (c.skipPlaceholder && c.capture != null) {
        const val = m[c.capture]
        if (val && isPlaceholderSecret(val)) continue
      }
      const redact = c.capture != null && m[c.capture] ? [m[c.capture]] : []
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `jwt-misuse-${file.path}`,
          category: 'Auth Flow',
          severity: c.severity,
          confidence: 'high',
          remediationEffort: 'moderate',
          cwe: 'CWE-347 — Improper Verification of Cryptographic Signature',
          references: ['OWASP API2:2023 — Broken Authentication', 'OWASP A07:2021 — Identification and Authentication Failures'],
          title: c.title,
          detail: c.detail,
          redact,
          fix: {
            task: 'Fix a JWT verification weakness',
            where: `${file.path} — at the line marked above`,
            problem: c.problem,
            goal: c.goal,
            steps: c.steps
          },
          test: {
            objective: 'Prove forged or unsigned tokens are rejected.',
            steps: [
              'Submit an unsigned token (alg "none"), a token signed with the wrong key, and a token with tampered claims.',
              'Assert each is rejected (401) and never grants access.',
              'Confirm a correctly-signed token still works.'
            ]
          }
        })
      ]
    }
    return []
  }
}
