import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PackageManager, ProjectProfile } from '@vibebar/project-detector'
import type { ProjectCommand } from '@shared/types.js'

/** How each package manager runs a named script and installs deps. */
const PM: Record<string, { run: (s: string) => string; install: string }> = {
  npm: { run: (s) => `npm run ${s}`, install: 'npm install' },
  pnpm: { run: (s) => `pnpm run ${s}`, install: 'pnpm install' },
  yarn: { run: (s) => `yarn ${s}`, install: 'yarn' }
}

/** Friendlier labels for the most common script names. */
const SCRIPT_LABEL: Record<string, string> = {
  dev: 'Start dev server',
  start: 'Start',
  build: 'Build',
  test: 'Run tests',
  lint: 'Lint',
  typecheck: 'Type-check',
  format: 'Format',
  preview: 'Preview build'
}

/** Scripts that are most useful to surface first, in this order. */
const SCRIPT_PRIORITY = ['dev', 'start', 'build', 'test', 'typecheck', 'lint']

/** Leading tokens that mark a README code line as a runnable shell command. */
const COMMAND_LEADERS =
  /^(npm|pnpm|yarn|npx|node|python|python3|pip|pip3|pytest|uvicorn|flask|django-admin|cargo|go|php|composer|artisan|docker|docker-compose|make|git|deno|bun|\.\/|sh|bash)\b/

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function findReadme(rootPath: string): Promise<string | null> {
  try {
    const entries = await readdir(rootPath)
    const match = entries.find((e) => /^readme(\.(md|markdown|txt|rst))?$/i.test(e))
    if (!match) return null
    return await readFile(join(rootPath, match), 'utf8')
  } catch {
    return null
  }
}

function pmFor(profile: ProjectProfile): { run: (s: string) => string; install: string } {
  const key: PackageManager = profile.packageManager
  return PM[key] ?? PM.npm
}

/** Package.json scripts → run commands, most useful first. */
function scriptCommands(pkg: Record<string, unknown>, profile: ProjectProfile): ProjectCommand[] {
  const scripts = pkg.scripts
  if (!scripts || typeof scripts !== 'object') return []
  const names = Object.keys(scripts as Record<string, unknown>)
  const ordered = [
    ...SCRIPT_PRIORITY.filter((s) => names.includes(s)),
    ...names.filter((s) => !SCRIPT_PRIORITY.includes(s))
  ]
  const pm = pmFor(profile)
  return ordered.map((name) => ({
    id: `script:${name}`,
    label: SCRIPT_LABEL[name] ?? name,
    command: pm.run(name),
    description: String((scripts as Record<string, unknown>)[name] ?? ''),
    group: 'Scripts',
    source: 'scripts' as const
  }))
}

/** Stack-derived install/run/test commands inferred from the detected profile. */
function detectedCommands(profile: ProjectProfile): ProjectCommand[] {
  const out: ProjectCommand[] = []
  const add = (id: string, label: string, command: string, description?: string): void => {
    out.push({ id: `detected:${id}`, label, command, description, group: 'Detected', source: 'detected' })
  }

  switch (profile.language) {
    case 'typescript':
    case 'javascript': {
      add('install', 'Install dependencies', pmFor(profile).install)
      break
    }
    case 'python': {
      add('venv', 'Create virtual env', 'python -m venv .venv')
      add('install', 'Install requirements', 'pip install -r requirements.txt')
      if (profile.framework === 'fastapi') add('run', 'Run FastAPI (dev)', 'uvicorn main:app --reload')
      if (profile.framework === 'flask') add('run', 'Run Flask', 'flask run')
      if (profile.framework === 'django') add('run', 'Run Django', 'python manage.py runserver')
      if (profile.testRunner === 'pytest') add('test', 'Run tests', 'pytest')
      break
    }
    case 'rust': {
      add('build', 'Build', 'cargo build')
      add('run', 'Run', 'cargo run')
      add('test', 'Run tests', 'cargo test')
      break
    }
    case 'go': {
      add('build', 'Build', 'go build ./...')
      add('run', 'Run', 'go run .')
      add('test', 'Run tests', 'go test ./...')
      break
    }
    case 'php': {
      add('install', 'Install dependencies', 'composer install')
      if (profile.framework === 'laravel') add('run', 'Serve (Laravel)', 'php artisan serve')
      break
    }
    default:
      break
  }
  return out
}

/** Extracts plausible shell commands from README fenced code blocks. */
function readmeCommands(readme: string): ProjectCommand[] {
  const out: ProjectCommand[] = []
  const seen = new Set<string>()
  const blocks = readme.match(/```[\s\S]*?```/g) ?? []
  for (const block of blocks) {
    const lines = block.replace(/```[^\n]*\n?/, '').replace(/```$/, '').split(/\r?\n/)
    for (const raw of lines) {
      // Strip common shell prompt prefixes ("$ ", "> ", "PS> ").
      const line = raw.replace(/^\s*(\$|>|PS[^>]*>|#)\s+/, '').trim()
      if (!line || !COMMAND_LEADERS.test(line) || line.length > 200) continue
      if (seen.has(line)) continue
      seen.add(line)
      out.push({
        id: `readme:${seen.size}`,
        label: line.length > 48 ? `${line.slice(0, 48)}\u2026` : line,
        command: line,
        group: 'From README',
        source: 'readme'
      })
      if (out.length >= 12) return out
    }
  }
  return out
}

/**
 * Builds a deduplicated list of suggested, copy/run-able commands for the active project by
 * combining package.json scripts, stack-derived defaults, and commands parsed from the README.
 * Read-only: inspects signal files only, never executes anything.
 */
export async function generateProjectCommands(
  profile: ProjectProfile | null
): Promise<ProjectCommand[]> {
  if (!profile?.rootPath) return []

  const pkg = await readJson(join(profile.rootPath, 'package.json'))
  const readme = await findReadme(profile.rootPath)

  const all: ProjectCommand[] = [
    ...detectedCommands(profile),
    ...(pkg ? scriptCommands(pkg, profile) : []),
    ...(readme ? readmeCommands(readme) : [])
  ]

  // Dedupe by command string, keeping the first (highest-signal) occurrence.
  const seen = new Set<string>()
  return all.filter((c) => {
    const key = c.command.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
