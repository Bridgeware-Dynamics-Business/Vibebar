import type { AiRiskFinding, AiRiskSeverity } from '@shared/types.js'

interface RiskPattern {
  kind: string
  severity: AiRiskSeverity
  regex: RegExp
}

const RISK_PATTERNS: RiskPattern[] = [
  { kind: 'Force flag', severity: 'error', regex: /--force\b/g },
  { kind: 'Legacy peer deps', severity: 'warn', regex: /--legacy-peer-deps\b/g },
  { kind: 'Elevated privileges', severity: 'error', regex: /\b(run as admin|sudo\s)/gi },
  { kind: 'Skipped test', severity: 'warn', regex: /\b(it|test|describe)\.skip\b/g },
  {
    kind: 'Test file removal',
    severity: 'error',
    regex: /\b(rm|del|unlink|remove-Item)\b[^\n]*\.test\.[a-z]+/gi
  },
  { kind: 'TypeScript any', severity: 'warn', regex: /:\s*any\b/g },
  { kind: 'TS suppress', severity: 'warn', regex: /@ts-(ignore|expect-error)\b/g },
  { kind: 'ESLint disable', severity: 'warn', regex: /eslint-disable(?:-next-line|-line)?\b/g }
]

const NPM_INSTALL_RE = /\bnpm\s+(?:i|install)\s+(.+)/gi

function isPackageToken(token: string): boolean {
  return /^[@a-z][\w./-]*$/i.test(token)
}

function hasVersionPin(token: string): boolean {
  return /^[@a-z][\w./-]*@[\d^~>=]/.test(token)
}

/** Heuristic: npm install/add without an explicit version pin on any package token. */
export function findUnpinnedNpmInstalls(text: string): AiRiskFinding[] {
  const findings: AiRiskFinding[] = []
  NPM_INSTALL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NPM_INSTALL_RE.exec(text)) !== null) {
    const argsLine = m[1] ?? ''
    const tokens = argsLine.split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      if (token.startsWith('-')) continue
      if (!isPackageToken(token)) continue
      if (hasVersionPin(token)) continue
      const index = m.index + m[0].indexOf(token)
      findings.push({
        kind: 'Unpinned npm install',
        severity: 'warn',
        match: token,
        index
      })
      break
    }
    if (m.index === NPM_INSTALL_RE.lastIndex) NPM_INSTALL_RE.lastIndex++
  }
  return findings
}

/**
 * Local regex/heuristic scan for risky patterns in pasted AI output — no LLM, fully offline.
 */
export function scanAiOutputRisks(text: string): AiRiskFinding[] {
  const findings: AiRiskFinding[] = []

  for (const pattern of RISK_PATTERNS) {
    pattern.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.regex.exec(text)) !== null) {
      const match = m[0]
      findings.push({
        kind: pattern.kind,
        severity: pattern.severity,
        match: match.length > 48 ? `${match.slice(0, 45)}…` : match,
        index: m.index
      })
      if (m.index === pattern.regex.lastIndex) pattern.regex.lastIndex++
    }
  }

  findings.push(...findUnpinnedNpmInstalls(text))

  findings.sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind))

  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.kind}|${f.index}|${f.match}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
