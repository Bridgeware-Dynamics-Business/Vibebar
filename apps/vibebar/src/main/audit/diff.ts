import type { AuditDelta, AuditFinding } from '@shared/types.js'

/**
 * Diffs the current findings against the fingerprints seen in the previous scan of the same project.
 * Mutates each finding's `status` in place (new vs existing) and returns the new/resolved/existing
 * counts. Resolved = a fingerprint present last time that is absent now. Line-independent
 * fingerprints (see engine/fingerprint.ts) keep this stable across unrelated edits.
 */
export function diffFindings(
  current: AuditFinding[],
  previousFingerprints: readonly string[]
): AuditDelta {
  const prev = new Set(previousFingerprints)
  const currentPrints = new Set(current.map((f) => f.fingerprint))
  let added = 0
  let existing = 0
  for (const f of current) {
    if (prev.has(f.fingerprint)) {
      f.status = 'existing'
      existing++
    } else {
      f.status = 'new'
      added++
    }
  }
  let resolved = 0
  for (const fp of prev) {
    if (!currentPrints.has(fp)) resolved++
  }
  return { new: added, resolved, existing }
}
