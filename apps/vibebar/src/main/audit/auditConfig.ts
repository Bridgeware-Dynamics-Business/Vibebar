import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { AuditFinding, AuditSeverity } from '@shared/types.js'

/** The optional `.vibebar-audit.json` a project can commit to tune the audit to its needs. */
const severitySchema = z.enum(['critical', 'high', 'medium', 'low'])

const configSchema = z
  .object({
    /** Rule ids (e.g. "xss-sink", "ssrf", "bola-idor") to disable entirely. */
    disabledRules: z.array(z.string()).optional(),
    /** Per-rule severity overrides, e.g. { "unpinned-deps": "low" }. */
    severityOverrides: z.record(z.string(), severitySchema).optional(),
    /** Drop anything below this severity from the report. */
    minSeverity: severitySchema.optional(),
    /** Extra glob patterns to exclude from scanning, on top of the built-in ignores. */
    extraIgnoreGlobs: z.array(z.string()).optional(),
    /** Finding fingerprints to mute (an accepted-risk baseline). */
    baseline: z.array(z.string()).optional()
  })
  .strict()

export type AuditConfig = z.infer<typeof configSchema>

export const CONFIG_FILE = '.vibebar-audit.json'

const SEVERITY_RANK: Record<AuditSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** Reads + validates the project's audit config, or returns an empty config when absent/invalid. */
export async function loadAuditConfig(root: string): Promise<AuditConfig> {
  const path = join(root, CONFIG_FILE)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    const result = configSchema.safeParse(parsed)
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

/** Persists the audit config to `.vibebar-audit.json` in the project root. */
export async function saveAuditConfig(root: string, config: AuditConfig): Promise<void> {
  const path = join(root, CONFIG_FILE)
  const parsed = configSchema.safeParse(config)
  const safe = parsed.success ? parsed.data : {}
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, 'utf8')
}

/** Adds a fingerprint to the baseline (accepted-risk) list; returns the updated config. */
export function addBaselineFingerprint(config: AuditConfig, fingerprint: string): AuditConfig {
  const baseline = [...(config.baseline ?? [])]
  if (!baseline.includes(fingerprint)) baseline.push(fingerprint)
  return { ...config, baseline }
}

/** Toggles a rule id in disabledRules; returns the updated config. */
export function setRuleDisabled(config: AuditConfig, ruleId: string, disabled: boolean): AuditConfig {
  const disabledRules = new Set(config.disabledRules ?? [])
  if (disabled) disabledRules.add(ruleId)
  else disabledRules.delete(ruleId)
  return { ...config, disabledRules: [...disabledRules] }
}

/** Whether a finding belongs to a given rule id (finding ids are `<ruleId>-<path>` or exactly `<ruleId>`). */
function findingMatchesRule(finding: AuditFinding, ruleId: string): boolean {
  return finding.id === ruleId || finding.id.startsWith(`${ruleId}-`)
}

/**
 * Applies disabledRules, severityOverrides, the baseline mute-list, and minSeverity to a finished
 * finding list. Returns a new array; never mutates inputs except via the returned objects.
 */
export function applyAuditConfig(findings: AuditFinding[], config: AuditConfig): AuditFinding[] {
  const disabled = config.disabledRules ?? []
  const baseline = new Set(config.baseline ?? [])
  const overrides = config.severityOverrides ?? {}
  const minRank = config.minSeverity ? SEVERITY_RANK[config.minSeverity] : Infinity

  const out: AuditFinding[] = []
  for (const f of findings) {
    if (disabled.some((r) => findingMatchesRule(f, r))) continue
    if (baseline.has(f.fingerprint)) continue
    let next = f
    for (const [ruleId, sev] of Object.entries(overrides)) {
      if (findingMatchesRule(f, ruleId)) {
        next = { ...f, severity: sev }
        break
      }
    }
    if (config.minSeverity && SEVERITY_RANK[next.severity] > minRank) continue
    out.push(next)
  }
  return out
}
