import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SyncInstanceConfig } from '@vibebar/codesync'
import { AI_CONTEXT_DIR, findContextFolder } from '@vibebar/project-detector'
import type { ProjectProfile } from '@vibebar/project-detector'

export type ProjectMemoryWarningSeverity = 'info' | 'warning'

export interface ProjectMemoryWarning {
  id: string
  message: string
  severity: ProjectMemoryWarningSeverity
}

export interface ProjectMemoryDiff {
  warnings: ProjectMemoryWarning[]
  agentsMdExists: boolean
  /** Whole days since AGENTS.md mtime; null when missing. */
  agentsMdAgeDays: number | null
  cursorRulesCount: number
  contextReadmeExists: boolean
  codesyncConfigured: boolean
}

export interface ProjectMemoryDiffInput {
  profile: ProjectProfile
  agentsMd: string | null
  cursorRulesCount: number
  contextReadme: string | null
  /** Previous cursor rules count from persistence; triggers drift when count grows. */
  lastKnownCursorRulesCount?: number | null
  codesyncInstances?: SyncInstanceConfig[]
}

const TOP_LEVEL_DIRS = ['src', 'apps', 'packages', 'lib', 'server', 'client'] as const

const FRAMEWORK_KEYWORDS: Record<string, string[]> = {
  next: ['next', 'nextjs', 'next.js'],
  react: ['react'],
  vue: ['vue'],
  svelte: ['svelte'],
  electron: ['electron'],
  fastapi: ['fastapi'],
  flask: ['flask'],
  django: ['django'],
  laravel: ['laravel']
}

function agentsLower(agentsMd: string | null): string {
  return (agentsMd ?? '').toLowerCase()
}

function mentionsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000))
}

async function readPackageScripts(rootPath: string): Promise<string[]> {
  const path = join(rootPath, 'package.json')
  if (!existsSync(path)) return []
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> }
    return Object.keys(parsed.scripts ?? {})
  } catch {
    return []
  }
}

async function topLevelDirsPresent(rootPath: string): Promise<string[]> {
  try {
    const names = await readdir(rootPath)
    return TOP_LEVEL_DIRS.filter((d) => names.includes(d))
  } catch {
    return []
  }
}

function codesyncTargetsAiContext(
  instances: SyncInstanceConfig[],
  aiContextPath: string | null
): boolean {
  if (!aiContextPath || instances.length === 0) return false
  const norm = aiContextPath.replace(/\\/g, '/').toLowerCase()
  return instances.some(
    (i) =>
      i.syncPath.replace(/\\/g, '/').toLowerCase() === norm ||
      i.syncPath.replace(/\\/g, '/').toLowerCase().endsWith(`/${AI_CONTEXT_DIR.toLowerCase()}`)
  )
}

/**
 * Compares AI-facing docs vs live repo signals. Pure aside from filesystem reads on rootPath.
 */
export async function computeProjectMemoryDiff(
  input: ProjectMemoryDiffInput
): Promise<ProjectMemoryDiff> {
  const warnings: ProjectMemoryWarning[] = []
  const { profile, agentsMd, cursorRulesCount, contextReadme } = input
  const root = profile.rootPath
  const agents = agentsLower(agentsMd)
  const agentsExists = Boolean(agentsMd)

  let agentsMdAgeDays: number | null = null
  const agentsPath = join(root, 'AGENTS.md')
  if (existsSync(agentsPath)) {
    try {
      const st = await stat(agentsPath)
      agentsMdAgeDays = daysSince(st.mtimeMs)
      if (agentsMdAgeDays > 90) {
        warnings.push({
          id: 'agents-stale',
          message: `AGENTS.md is ~${agentsMdAgeDays} days old — review stack and scripts.`,
          severity: 'info'
        })
      }
    } catch {
      /* ignore stat failure */
    }
  } else {
    warnings.push({
      id: 'no-agents-md',
      message: 'No AGENTS.md — add project conventions so agents stay aligned.',
      severity: 'warning'
    })
  }

  if (cursorRulesCount === 0) {
    warnings.push({
      id: 'no-cursor-rules',
      message: 'No .cursor/rules/ files — consider adding Cursor rules for recurring patterns.',
      severity: 'info'
    })
  }

  const lastKnown = input.lastKnownCursorRulesCount
  if (lastKnown != null && cursorRulesCount > lastKnown) {
    warnings.push({
      id: 'cursor-rules-added',
      message: `.cursor/rules/ grew (${lastKnown} → ${cursorRulesCount}) — sync AGENTS.md if rules encode new conventions.`,
      severity: 'info'
    })
  }

  if (!contextReadme) {
    warnings.push({
      id: 'no-context-readme',
      message: `No ${AI_CONTEXT_DIR}/README.md — create AI Context folder docs for assistants.`,
      severity: 'info'
    })
  }

  const ctxDir = await findContextFolder(root)
  const codesyncConfigured = codesyncTargetsAiContext(input.codesyncInstances ?? [], ctxDir)
  if ((input.codesyncInstances ?? []).length > 0 && !codesyncConfigured && ctxDir) {
    warnings.push({
      id: 'codesync-not-ai-context',
      message: 'Code Sync is configured but not mirroring into your AI Context folder.',
      severity: 'info'
    })
  }

  if (agentsExists && profile.framework !== 'unknown') {
    const expected = FRAMEWORK_KEYWORDS[profile.framework] ?? [profile.framework]
    const conflicting = Object.entries(FRAMEWORK_KEYWORDS).filter(
      ([fw, keys]) =>
        fw !== profile.framework &&
        fw !== 'unknown' &&
        mentionsKeyword(agents, keys) &&
        !mentionsKeyword(agents, expected)
    )
    if (conflicting.length > 0 && !mentionsKeyword(agents, expected)) {
      warnings.push({
        id: 'framework-mismatch',
        message: `Detected ${profile.framework} but AGENTS.md emphasizes ${conflicting[0]![0]} — update docs or stack override.`,
        severity: 'warning'
      })
    } else if (!mentionsKeyword(agents, expected)) {
      warnings.push({
        id: 'framework-not-documented',
        message: `AGENTS.md does not mention ${profile.framework} — document the stack for agents.`,
        severity: 'info'
      })
    }
  }

  if (agentsExists && profile.packageManager !== 'unknown') {
    const pm = profile.packageManager
    if (!agents.includes(pm) && pm !== 'npm') {
      warnings.push({
        id: 'package-manager-hint',
        message: `Project uses ${pm} but AGENTS.md may not — mention install/run commands.`,
        severity: 'info'
      })
    }
  }

  const scripts = await readPackageScripts(root)
  if (agentsExists && scripts.length > 0) {
    const missing = scripts.filter((name) => !agents.includes(name) && !agents.includes(`npm run ${name}`))
    if (missing.length > 0) {
      const sample = missing.slice(0, 4).join(', ')
      warnings.push({
        id: 'scripts-not-documented',
        message: `package.json scripts not referenced in AGENTS.md: ${sample}${missing.length > 4 ? '…' : ''}.`,
        severity: 'info'
      })
    }
  }

  const dirs = await topLevelDirsPresent(root)
  if (agentsExists) {
    for (const dir of dirs) {
      if (!agents.includes(dir)) {
        warnings.push({
          id: `dir-not-referenced-${dir}`,
          message: `Top-level \`${dir}/\` exists but is not mentioned in AGENTS.md.`,
          severity: 'info'
        })
      }
    }
  }

  return {
    warnings,
    agentsMdExists: agentsExists,
    agentsMdAgeDays,
    cursorRulesCount,
    contextReadmeExists: Boolean(contextReadme),
    codesyncConfigured
  }
}

/** One-line summary for Prepare Cursor when drift exists. */
export function formatProjectMemoryOneLiner(diff: ProjectMemoryDiff): string | null {
  const top = diff.warnings.filter((w) => w.severity === 'warning').slice(0, 2)
  const infos = diff.warnings.filter((w) => w.severity === 'info').slice(0, 1)
  const picked = [...top, ...infos].slice(0, 2)
  if (picked.length === 0) return null
  return picked.map((w) => w.message).join(' · ')
}
