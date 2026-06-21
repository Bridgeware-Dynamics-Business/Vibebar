/**
 * Local, dependency-free redaction for error text shown in the in-app error console.
 *
 * Error messages and stack traces are *untrusted*: they can contain user input, environment
 * values, tokens, or full file paths. This module masks the sensitive-looking shapes BEFORE any
 * value leaves the originating renderer, so neither IPC, the console window, nor the clipboard
 * ever sees a live secret. It favors over-redaction (false positives) over leaking.
 *
 * Nothing here is network-bound and it must never throw — callers wrap it defensively, but it is
 * also internally guarded so a bad input degrades to "return the original string".
 */

interface RedactRule {
  readonly label: string
  readonly regex: RegExp
  /** When set, mask only this capture group rather than the whole match. */
  readonly group?: number
}

// Each rule targets a credential/PII shape. Order is not significant: rules are applied in turn
// and a value already masked by an earlier rule simply won't match later ones.
const RULES: readonly RedactRule[] = [
  // JWTs (header.payload.signature).
  { label: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g },
  // Authorization: Bearer <token> / Basic <token>.
  { label: 'auth-header', regex: /\b(bearer|basic)\s+[A-Za-z0-9._\-+/=]{8,}/gi, group: 0 },
  // Known provider key prefixes.
  { label: 'aws-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { label: 'github-pat', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: 'openai-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { label: 'google-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'stripe-key', regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: 'private-key', regex: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  // Connection strings with embedded credentials (scheme://user:pass@host).
  {
    label: 'connection-string',
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:'"@/]+:[^\s'"@/]+@[^\s'"]+/gi
  },
  // key/secret/token/password = value (env-var or assignment style), masking only the value.
  {
    label: 'assignment',
    regex:
      /\b(?:[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS|PWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?KEY|AUTH)[A-Z0-9_]*)\s*[=:]\s*["']?([^\s"'`,;]{4,})["']?/gi,
    group: 1
  },
  // cookie: a=b; c=d  /  document.cookie = "..."
  { label: 'cookie', regex: /\b(cookie|set-cookie)\s*[:=]\s*["']?([^\n"']{4,})["']?/gi, group: 2 },
  // Windows user paths — keep the shape, drop the username and everything after it.
  { label: 'win-userpath', regex: /([A-Za-z]:\\Users\\)[^\\/\s"']+/g, group: 0 },
  // POSIX home paths.
  { label: 'home-path', regex: /(\/(?:home|Users)\/)[^/\s"':]+/g, group: 0 }
]

function maskValue(value: string): string {
  if (value.length <= 4) return '\u2022'.repeat(value.length)
  return `${value.slice(0, 2)}\u2026[redacted]`
}

/** Applies one rule, masking either the whole match or a single capture group. */
function applyRule(text: string, rule: RedactRule): string {
  return text.replace(rule.regex, (match, ...groups) => {
    if (rule.group && rule.group > 0) {
      const captured = groups[rule.group - 1]
      if (typeof captured !== 'string' || captured.length === 0) return match
      return match.replace(captured, `[redacted:${rule.label}]`)
    }
    return `[redacted:${rule.label}:${maskValue(match)}]`
  })
}

/**
 * Returns a copy of `text` with sensitive-looking values masked. Pure, local, and fail-safe:
 * any internal error falls back to the original input rather than throwing.
 */
export function redactSecrets(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text
  try {
    let out = text
    for (const rule of RULES) out = applyRule(out, rule)
    return out
  } catch {
    return text
  }
}
