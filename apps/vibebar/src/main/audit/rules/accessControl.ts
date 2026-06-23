import { hasServerSurface, isClientFile, isServerish } from '../engine/context.js'
import { metaFinding } from '../engine/prompts.js'
import type { ProjectRule } from './types.js'

/** CWE-639 (BOLA/IDOR): endpoints that return user-scoped data without proven authorization. */
export const bolaRule: ProjectRule = {
  id: 'bola-idor',
  category: 'Access Control',
  scope: 'project',
  run({ input }) {
    if (!hasServerSurface(input)) return []
    const jsRe =
      /\b(?:app|router|api|server)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
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
        confidence: 'medium',
        remediationEffort: 'involved',
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
}

/** CWE-602: validation that lives only in the component and not at the API boundary. */
export const frontendOnlyValidationRule: ProjectRule = {
  id: 'frontend-only-validation',
  category: 'Input Validation',
  scope: 'project',
  run({ input }) {
    if (!hasServerSurface(input)) return []
    const clientValidation = input.files.some(
      (f) => isClientFile(f.path, input.ctx) && /(zod|yup|joi|\.min\(|\.max\(|required\s*[:=]|pattern\s*[:=]|type=["']email["'])/i.test(f.content)
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
        confidence: 'medium',
        remediationEffort: 'moderate',
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
}
