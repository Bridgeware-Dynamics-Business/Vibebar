import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fg from 'fast-glob'
import pLimit from 'p-limit'
import { buildContext } from '@vibebar/prompt-engine'
import type { AuditReport } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { type AuditContext, type ScanFile, runAuditRules } from './auditRules.js'

const MAX_FILES = 500
const MAX_FILE_BYTES = 200_000
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']

const GLOB_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/release/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/*.min.js'
]

/**
 * Read-only security auditor. Reads a bounded sample of source files (JS/TS/Vue/Svelte/Astro/
 * Python) plus the manifest and .gitignore, then runs the pure rule set. It never executes
 * project code; it only inspects file contents to surface behavioral- and structural-risk
 * signals — client- and server-side secrets, missing RLS, BOLA/IDOR surfaces, frontend-only
 * validation, dangerous DOM/eval sinks, SQL/command injection, insecure TLS/CORS/debug config,
 * Electron hardening regressions, weak randomness, supply-chain drift, and .gitignore gaps —
 * pairing each finding with a precise, context-rich fix prompt and a runtime behavioral-test prompt.
 */
export class AuditService {
  private readonly projects: ProjectService
  /** Coalesces overlapping scans: the panel and the terminal can both trigger a run at once. */
  private inFlight: Promise<AuditReport> | null = null

  constructor(projects: ProjectService) {
    this.projects = projects
  }

  run(): Promise<AuditReport> {
    if (this.inFlight) return this.inFlight
    const pending = this.execute().finally(() => {
      this.inFlight = null
    })
    this.inFlight = pending
    return pending
  }

  private async execute(): Promise<AuditReport> {
    const profile = this.projects.getProfile()
    if (!profile?.rootPath) {
      return {
        ranAt: Date.now(),
        projectName: null,
        scannedFiles: 0,
        totalCandidates: 0,
        truncated: false,
        findings: [],
        noProject: true
      }
    }

    const root = profile.rootPath
    const packageJson = await this.readPackageJson(root)
    const hasLockfile = LOCKFILES.some((f) => existsSync(join(root, f)))
    const gitignore = await this.readGitignore(root)
    const { files, total } = await this.readSourceFiles(root)

    const c = buildContext(profile)
    const ctx: AuditContext = {
      label: `my ${String(c.framework)} project (${String(c.language)})`,
      framework: String(c.framework),
      language: String(c.language),
      testRunner: String(c.testRunner)
    }

    const findings = runAuditRules({ ctx, files, packageJson, hasLockfile, gitignore })

    return {
      ranAt: Date.now(),
      projectName: profile.folderName,
      scannedFiles: files.length,
      totalCandidates: total,
      truncated: total > files.length,
      findings,
      noProject: false
    }
  }

  private async readPackageJson(root: string): Promise<Record<string, unknown> | null> {
    const path = join(root, 'package.json')
    if (!existsSync(path)) return null
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private async readGitignore(root: string): Promise<string | null> {
    const path = join(root, '.gitignore')
    if (!existsSync(path)) return null
    try {
      return await readFile(path, 'utf8')
    } catch {
      return null
    }
  }

  private async readSourceFiles(root: string): Promise<{ files: ScanFile[]; total: number }> {
    let paths: string[]
    try {
      paths = await fg('**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,py,astro}', {
        cwd: root,
        ignore: GLOB_IGNORE,
        dot: false,
        followSymbolicLinks: false,
        onlyFiles: true,
        suppressErrors: true
      })
    } catch {
      return { files: [], total: 0 }
    }

    const total = paths.length
    const limited = paths.slice(0, MAX_FILES)
    const limit = pLimit(16)
    const results = await Promise.all(
      limited.map((rel) =>
        limit(async (): Promise<ScanFile | null> => {
          try {
            const buf = await readFile(join(root, rel), 'utf8')
            const content = buf.length > MAX_FILE_BYTES ? buf.slice(0, MAX_FILE_BYTES) : buf
            return { path: rel.replace(/\\/g, '/'), content }
          } catch {
            return null
          }
        })
      )
    )
    return { files: results.filter((f): f is ScanFile => f !== null), total }
  }
}
