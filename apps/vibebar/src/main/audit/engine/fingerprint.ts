import { createHash } from 'node:crypto'

/**
 * A stable, line-independent identity for a finding. We deliberately exclude the line number and
 * collapse whitespace in the matched code, so that inserting an unrelated import (which shifts every
 * line below it) does not make every finding look "new" on the next scan. The fingerprint is the
 * key for diffing scans (new vs resolved) and for baseline-muting specific findings.
 */
export function computeFingerprint(parts: {
  ruleId: string
  file?: string
  /** A short, representative slice of the offending code (will be whitespace-normalized). */
  code?: string
}): string {
  const normalizedCode = (parts.code ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const basis = `${parts.ruleId}\u0000${parts.file ?? ''}\u0000${normalizedCode}`
  return createHash('sha1').update(basis).digest('hex').slice(0, 16)
}
