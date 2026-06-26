import type { ProjectProfile } from '@vibebar/project-detector'

/** Default char budget before the pack is considered oversized for model context. */
export const CONTEXT_HEALTH_CHAR_THRESHOLD = 32_000

export type ContextHealthWarningId =
  | 'stack-unknown'
  | 'subfolder-not-root'
  | 'pack-oversized'
  | 'changed-not-in-pack'
  | 'no-agents-md'

export interface ContextHealthWarning {
  id: ContextHealthWarningId
  message: string
}

export interface ContextHealthInput {
  profile: ProjectProfile | null
  /** When null and profile is set, triggers the no-AGENTS.md warning. */
  agentsMd?: string | null
  /** Character count of the pack bundle (not token estimate). */
  packCharCount?: number
  /** Paths currently selected for packing. */
  selectedPaths?: string[]
  /** Git-changed paths relative to repo root. */
  changedPaths?: string[]
}

export function isStackUnknown(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return profile.framework === 'unknown' && profile.language === 'unknown'
}

export function isSubfolderNotRoot(profile: ProjectProfile | null): boolean {
  if (!profile) return false
  return !profile.hasRootManifest
}

/**
 * Informational context warnings for Prompt Library and Context Packer. Never blocks copy —
 * surfaces risks that the AI may be working with incomplete or oversized context.
 */
export function buildContextHealthWarnings(input: ContextHealthInput): ContextHealthWarning[] {
  const warnings: ContextHealthWarning[] = []
  const { profile } = input

  if (!profile) return warnings

  if (isStackUnknown(profile)) {
    warnings.push({
      id: 'stack-unknown',
      message: 'Stack unknown — prompts and presets may be generic until detection succeeds.'
    })
  }

  if (isSubfolderNotRoot(profile)) {
    warnings.push({
      id: 'subfolder-not-root',
      message:
        'Selected folder has no package.json or project manifest — pick the repo root for best results.'
    })
  }

  if (input.agentsMd === null) {
    warnings.push({
      id: 'no-agents-md',
      message: 'No AGENTS.md found — consider adding project conventions for AI assistants.'
    })
  }

  const packChars = input.packCharCount ?? 0
  if (packChars > CONTEXT_HEALTH_CHAR_THRESHOLD) {
    warnings.push({
      id: 'pack-oversized',
      message: `Pack is ~${packChars.toLocaleString()} chars (>${CONTEXT_HEALTH_CHAR_THRESHOLD.toLocaleString()}) — trim selection to avoid model limits.`
    })
  }

  const changed = input.changedPaths ?? []
  const selected = new Set(input.selectedPaths ?? [])
  if (changed.length > 0 && selected.size > 0) {
    const missing = changed.filter((p) => !selected.has(p))
    if (missing.length > 0) {
      warnings.push({
        id: 'changed-not-in-pack',
        message: `${missing.length} changed file(s) not in your pack selection — AI may miss recent edits.`
      })
    }
  }

  return warnings
}
