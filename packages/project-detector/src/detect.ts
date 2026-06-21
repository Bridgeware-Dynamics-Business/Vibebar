import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { readGitBranch } from './git.js'
import {
  emptyProfile,
  type PackageManager,
  type ProjectFramework,
  type ProjectLanguage,
  type ProjectProfile,
  type TestRunner
} from './types.js'

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

/** Canonical name used when creating the AI context folder. */
export const AI_CONTEXT_DIR = 'AI Context'

/**
 * Names that count as an existing AI context folder when scanning a project. Includes plain
 * "context" variants so a context folder a user created by hand is still recognized.
 */
const AI_CONTEXT_VARIANTS = [
  'AI Context',
  'ai-context',
  'ai_context',
  'aicontext',
  '.ai-context',
  '.ai',
  'context',
  'Context',
  '.context'
]

/**
 * Returns the path of the first recognized AI context folder at the project root, or null
 * when none exists. The canonical `AI_CONTEXT_DIR` is checked first so a freshly created
 * folder always wins over a hand-made variant.
 */
export async function findContextFolder(rootPath: string): Promise<string | null> {
  for (const name of AI_CONTEXT_VARIANTS) {
    const dir = join(rootPath, name)
    if (await dirExists(dir)) return dir
  }
  return null
}

/** True when any recognized AI context folder already exists at the project root. */
async function hasAiContextFolder(rootPath: string): Promise<boolean> {
  return (await findContextFolder(rootPath)) !== null
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8')
  } catch {
    return null
  }
}

const DB_DEP_HINTS = [
  'prisma',
  '@prisma/client',
  'typeorm',
  'sequelize',
  'mongoose',
  'pg',
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'drizzle-orm',
  'knex',
  'redis',
  'ioredis'
]

function collectDeps(pkg: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const block = pkg[key]
    if (block && typeof block === 'object') {
      for (const [name, version] of Object.entries(block as Record<string, unknown>)) {
        if (typeof version === 'string') out[name] = version
      }
    }
  }
  return out
}

function detectNodeFramework(deps: Record<string, string>, hasElectronConfig: boolean): {
  framework: ProjectFramework
  isElectron: boolean
} {
  if (deps.electron || hasElectronConfig) return { framework: 'electron', isElectron: true }
  if (deps.next) return { framework: 'next', isElectron: false }
  if (deps.nuxt || deps.vue) return { framework: 'vue', isElectron: false }
  if (deps.svelte || deps['@sveltejs/kit']) return { framework: 'svelte', isElectron: false }
  if (deps.react || deps['react-dom']) return { framework: 'react', isElectron: false }
  return { framework: 'unknown', isElectron: false }
}

function detectNodeTestRunner(deps: Record<string, string>): TestRunner {
  if (deps['@playwright/test'] || deps.playwright) return 'playwright'
  if (deps.vitest) return 'vitest'
  if (deps.jest) return 'jest'
  return 'unknown'
}

async function detectPackageManager(rootPath: string): Promise<PackageManager> {
  if (await fileExists(join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await fileExists(join(rootPath, 'yarn.lock'))) return 'yarn'
  if (await fileExists(join(rootPath, 'package-lock.json'))) return 'npm'
  return 'npm'
}

function pythonFrameworkFromText(text: string): ProjectFramework {
  const lower = text.toLowerCase()
  if (lower.includes('fastapi')) return 'fastapi'
  if (lower.includes('django')) return 'django'
  if (lower.includes('flask')) return 'flask'
  return 'unknown'
}

/**
 * Builds a ProjectProfile from a folder by inspecting its signal files. Read-only:
 * never writes, never executes project code, and walks only the project root plus a
 * few well-known config files.
 */
export async function detectProject(rootPath: string): Promise<ProjectProfile> {
  const folderName = basename(rootPath) || rootPath
  const profile = emptyProfile(rootPath, folderName)
  profile.gitBranch = await readGitBranch(rootPath)
  profile.hasContextFolder = await hasAiContextFolder(rootPath)

  const stacks = new Set<string>()

  const hasElectronConfig =
    (await fileExists(join(rootPath, 'electron.vite.config.ts'))) ||
    (await fileExists(join(rootPath, 'electron.vite.config.js'))) ||
    (await fileExists(join(rootPath, 'electron-builder.yml')))

  const pkg = await readJson(join(rootPath, 'package.json'))

  if (pkg) {
    const deps = collectDeps(pkg)
    const hasTsConfig = await fileExists(join(rootPath, 'tsconfig.json'))
    const language: ProjectLanguage = deps.typescript || hasTsConfig ? 'typescript' : 'javascript'
    profile.language = language

    const { framework, isElectron } = detectNodeFramework(deps, hasElectronConfig)
    profile.framework = framework
    profile.isElectron = isElectron
    profile.testRunner = detectNodeTestRunner(deps)
    profile.packageManager = await detectPackageManager(rootPath)
    profile.entryFile = typeof pkg.main === 'string' ? pkg.main : null
    profile.hasDb = DB_DEP_HINTS.some((hint) => hint in deps)

    profile.isMonorepo =
      'workspaces' in pkg ||
      (await fileExists(join(rootPath, 'pnpm-workspace.yaml'))) ||
      ((await dirExists(join(rootPath, 'packages'))) && (await dirExists(join(rootPath, 'apps'))))

    if (await dirExists(join(rootPath, 'src', 'renderer'))) profile.rendererDir = 'src/renderer'
    else if (await dirExists(join(rootPath, 'src'))) profile.rendererDir = 'src'

    stacks.add(language === 'typescript' ? 'typescript' : 'javascript')
    if (framework !== 'unknown') stacks.add(framework)
    if (deps.vite || isElectron) stacks.add('vite')
    if (deps['react-dom'] && framework !== 'next') stacks.add('react')
  } else {
    // Non-Node stacks.
    const pyproject = await readText(join(rootPath, 'pyproject.toml'))
    const requirements = await readText(join(rootPath, 'requirements.txt'))
    if (pyproject || requirements) {
      profile.language = 'python'
      profile.packageManager = 'pip'
      const combined = `${pyproject ?? ''}\n${requirements ?? ''}`
      profile.framework = pythonFrameworkFromText(combined)
      profile.testRunner = combined.toLowerCase().includes('pytest') ? 'pytest' : 'unknown'
      profile.hasDb = /sqlalchemy|psycopg|django|asyncpg|pymongo|sqlite/i.test(combined)
      stacks.add('python')
      if (profile.framework !== 'unknown') stacks.add(profile.framework)
    } else if (await fileExists(join(rootPath, 'Cargo.toml'))) {
      profile.language = 'rust'
      profile.packageManager = 'cargo'
      stacks.add('rust')
    } else if (await fileExists(join(rootPath, 'go.mod'))) {
      profile.language = 'go'
      profile.packageManager = 'go'
      stacks.add('go')
    } else {
      const composer = await readJson(join(rootPath, 'composer.json'))
      if (composer) {
        profile.language = 'php'
        profile.packageManager = 'composer'
        const cdeps = collectDeps(composer)
        profile.framework = 'laravel' in cdeps || 'laravel/framework' in cdeps ? 'laravel' : 'unknown'
        stacks.add('php')
        if (profile.framework !== 'unknown') stacks.add(profile.framework)
      }
    }
  }

  stacks.add('any')
  profile.stacks = [...stacks]
  return profile
}
