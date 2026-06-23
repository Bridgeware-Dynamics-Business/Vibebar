import { isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import type { FileRule } from './types.js'

/** CWE-532: secrets/PII written to logs, where they persist in plaintext and aggregate to 3rd parties. */
export const sensitiveLoggingRule: FileRule = {
  id: 'sensitive-logging',
  category: 'Data Exposure',
  scope: 'file',
  cap: 4,
  prefilter: (c) =>
    /(console\.(log|info|warn|error|debug)|logger\.\w+|logging\.\w+|print)\s*\(/.test(c) &&
    /password|passwd|secret|token|api[_-]?key|authorization|credit[_-]?card|ssn|private[_-]?key/i.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    const masked = ctx.masked()
    const logger = isPython
      ? /\b(?:print|logging\.\w+|logger\.\w+)\s*\(/g
      : /\b(?:console\.(?:log|info|warn|error|debug)|logger\.\w+)\s*\(/g
    const sensitive = /\b(?:password|passwd|secret|token|api[_-]?key|apikey|authorization|auth[_-]?token|credit[_-]?card|ssn|private[_-]?key|session[_-]?id)\b/i
    let m: RegExpExecArray | null
    logger.lastIndex = 0
    while ((m = logger.exec(masked)) !== null) {
      // Look at the call's argument span (best-effort: until the next newline).
      const tail = masked.slice(m.index, m.index + 240)
      if (!sensitive.test(tail)) continue
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `sensitive-logging-${file.path}`,
          category: 'Data Exposure',
          severity: 'medium',
          confidence: 'low',
          remediationEffort: 'trivial',
          cwe: 'CWE-532 — Insertion of Sensitive Information into Log File',
          references: ['OWASP A09:2021 — Security Logging and Monitoring Failures'],
          title: 'Sensitive data may be logged',
          detail:
            'A log/print call references a password, token, key, or similar secret. Logged secrets persist in plaintext, are often shipped to third-party log aggregators, and frequently leak through error reporting.',
          fix: {
            task: 'Stop logging sensitive values',
            where: `${file.path} — a log call references a sensitive identifier at the line marked above`,
            problem:
              'Writing secrets/PII to logs creates durable, widely-replicated plaintext copies (local files, log aggregators, crash reports) that are easy to exfiltrate.',
            goal: 'Never log secret material; log only non-sensitive, redacted context.',
            steps: [
              'Remove the secret from the log statement, or replace it with a redacted placeholder / a non-reversible identifier.',
              'Add a logging redaction layer that masks known sensitive keys before output.',
              'Confirm error handlers and request loggers do not capture auth headers, tokens, or request bodies with secrets.'
            ]
          },
          test: {
            objective: 'Prove secrets do not reach the logs.',
            steps: [
              'Exercise the code path with a known secret value and capture the log output.',
              'Assert the secret value does not appear anywhere in the logs (a redacted marker is fine).'
            ]
          }
        })
      ]
    }
    return []
  }
}
