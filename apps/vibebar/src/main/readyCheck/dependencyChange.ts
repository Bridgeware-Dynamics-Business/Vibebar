import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DependencyChangeEntry, DependencyChangeSummary } from '@shared/types.js'

const execFileAsync = promisify(execFile)

const GIT_OPTS = { windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 } as const

export interface PackageJsonDeps {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

export function parsePackageJsonDeps(raw: string): PackageJsonDeps | null {
  try {
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return {
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {}
    }
  } catch {
    return null
  }
}

export function isUnpinnedVersion(version: string): boolean {
  const v = version.trim()
  if (!v || v === '*' || v === 'latest') return true
  if (/^(file:|git\+|github:|link:|workspace:)/i.test(v)) return true
  return false
}

type Section = 'dependencies' | 'devDependencies'

function collectSectionChanges(
  section: Section,
  before: Record<string, string>,
  after: Record<string, string>
): DependencyChangeEntry[] {
  const changes: DependencyChangeEntry[] = []
  const names = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const name of names) {
    const b = before[name]
    const a = after[name]
    if (b === undefined && a !== undefined) {
      changes.push({
        name,
        section,
        after: a,
        unpinned: isUnpinnedVersion(a)
      })
    } else if (b !== undefined && a === undefined) {
      changes.push({ name, section, before: b })
    } else if (b !== undefined && a !== undefined && b !== a) {
      changes.push({
        name,
        section,
        before: b,
        after: a,
        unpinned: isUnpinnedVersion(a)
      })
    }
  }
  return changes
}

/** Compares two package.json dependency maps (pure). */
export function comparePackageJsonDeps(
  before: PackageJsonDeps,
  after: PackageJsonDeps
): Omit<DependencyChangeSummary, 'lockfileSignalActive'> {
  const depChanges = collectSectionChanges('dependencies', before.dependencies, after.dependencies)
  const devChanges = collectSectionChanges(
    'devDependencies',
    before.devDependencies,
    after.devDependencies
  )
  const all = [...depChanges, ...devChanges]

  return {
    added: all.filter((c) => c.before === undefined && c.after !== undefined),
    removed: all.filter((c) => c.after === undefined && c.before !== undefined),
    changed: all.filter((c) => c.before !== undefined && c.after !== undefined),
    unpinned: all.filter((c) => c.unpinned)
  }
}

async function readHeadPackageJson(root: string): Promise<PackageJsonDeps | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', 'HEAD:package.json'], {
      cwd: root,
      ...GIT_OPTS
    })
    return parsePackageJsonDeps(stdout)
  } catch {
    return null
  }
}

async function readWorkingPackageJson(root: string): Promise<PackageJsonDeps | null> {
  try {
    const raw = await readFile(join(root, 'package.json'), 'utf8')
    return parsePackageJsonDeps(raw)
  } catch {
    return null
  }
}

/** Builds dependency change summary when package.json is in changed paths. */
export async function buildDependencyChangeSummary(
  root: string,
  packageJsonChanged: boolean,
  lockfileSignalActive: boolean
): Promise<DependencyChangeSummary | null> {
  if (!packageJsonChanged) return null

  const [head, working] = await Promise.all([
    readHeadPackageJson(root),
    readWorkingPackageJson(root)
  ])
  if (!working) return null

  const before = head ?? { dependencies: {}, devDependencies: {} }
  const diff = comparePackageJsonDeps(before, working)

  if (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  ) {
    return null
  }

  return { ...diff, lockfileSignalActive }
}

export function formatDependencyReviewPrompt(summary: DependencyChangeSummary): string {
  const lines: string[] = [
    '# Dependency change review',
    '',
    'Review dependency manifest changes before commit.',
    ''
  ]

  if (summary.lockfileSignalActive) {
    lines.push(
      '⚠️ Lockfile also changed — run `npm audit` or Security Audit and confirm supply-chain impact.',
      ''
    )
  }

  const section = (title: string, entries: DependencyChangeEntry[]) => {
    if (entries.length === 0) return
    lines.push(`## ${title}`, '')
    for (const e of entries) {
      const pin = e.unpinned ? ' (unpinned)' : ''
      if (e.before && e.after) {
        lines.push(`- **${e.name}** [${e.section}]: \`${e.before}\` → \`${e.after}\`${pin}`)
      } else if (e.after) {
        lines.push(`- **${e.name}** [${e.section}] added: \`${e.after}\`${pin}`)
      } else if (e.before) {
        lines.push(`- **${e.name}** [${e.section}] removed (was \`${e.before}\`)`)
      }
    }
    lines.push('')
  }

  section('Added', summary.added)
  section('Removed', summary.removed)
  section('Changed', summary.changed)

  if (summary.unpinned.length > 0) {
    lines.push('## Unpinned / non-semver versions', '')
    for (const e of summary.unpinned) {
      lines.push(`- ${e.name}: \`${e.after ?? e.before}\``)
    }
    lines.push('')
  }

  lines.push(
    '### Ask',
    '',
    '1. Are these dependency changes intentional and scoped?',
    '2. Any security or license concerns?',
    '3. Should lockfile and CI verify steps be updated?',
    ''
  )

  return lines.join('\n').trimEnd() + '\n'
}
