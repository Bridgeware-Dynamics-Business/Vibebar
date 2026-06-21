import type { ScanResult, SecretFinding } from '@shared/types.js'

interface FullMatchPattern {
  kind: string
  regex: RegExp
  /** When set, redact only this capture group instead of the whole match. */
  group?: number
}

// Patterns intentionally favor precision over recall: each targets a credential shape that
// is costly to leak. The generic assignment rule catches the long tail behind known key names.
const PATTERNS: FullMatchPattern[] = [
  { kind: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { kind: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { kind: 'OpenAI key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'Stripe secret key', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  {
    kind: 'JWT',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
  },
  { kind: 'Private key block', regex: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  {
    kind: 'Database URL with credentials',
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:'"]+:[^\s@'"]+@[^\s'"]+/g
  },
  {
    kind: 'Hard-coded secret',
    regex:
      /\b(?:API[_-]?KEY|SECRET(?:[_-]?KEY)?|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)\b\s*[=:]\s*["']?([^\s"'`]{8,})["']?/gi,
    group: 1
  }
]

const PLACEHOLDER_HINTS = [
  'your',
  'example',
  'changeme',
  'change-me',
  'placeholder',
  'xxxx',
  'todo',
  'replace',
  'dummy',
  'sample',
  'test',
  'fake',
  'none',
  'null',
  '...'
]

function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase()
  if (PLACEHOLDER_HINTS.some((hint) => lower.includes(hint))) return true
  // All the same character (e.g. xxxxxxxx, ********).
  if (/^(.)\1{5,}$/.test(value)) return true
  return false
}

function maskSecret(value: string): string {
  if (value.length <= 6) return '*'.repeat(value.length)
  return `${value.slice(0, 3)}\u2026${'*'.repeat(Math.min(6, value.length - 3))}`
}

interface Range {
  start: number
  end: number
  kind: string
  secret: string
}

/**
 * Scans text for likely secrets and returns both the findings (with the matched value
 * masked) and a redacted copy of the text safe to share with an LLM. Runs fully locally.
 */
export function scanText(text: string): ScanResult {
  const ranges: Range[] = []

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.regex.exec(text)) !== null) {
      const secret = pattern.group ? m[pattern.group] : m[0]
      if (!secret) continue
      if (looksLikePlaceholder(secret)) continue
      const start = pattern.group ? m.index + m[0].indexOf(secret) : m.index
      ranges.push({ start, end: start + secret.length, kind: pattern.kind, secret })
      if (m.index === pattern.regex.lastIndex) pattern.regex.lastIndex++
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const findings: SecretFinding[] = []
  let redactedText = ''
  let cursor = 0
  let lastEnd = -1

  for (const range of ranges) {
    if (range.start < lastEnd) continue // skip overlapping match
    findings.push({ kind: range.kind, match: maskSecret(range.secret), index: range.start })
    redactedText += text.slice(cursor, range.start)
    redactedText += `[REDACTED:${range.kind}]`
    cursor = range.end
    lastEnd = range.end
  }
  redactedText += text.slice(cursor)

  return { findings, redactedText }
}

export function hasSecrets(text: string): boolean {
  return scanText(text).findings.length > 0
}
