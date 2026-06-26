import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import fg from 'fast-glob'
import pLimit from 'p-limit'
import Store from 'electron-store'
import { buildContext } from '@vibebar/prompt-engine'
import type { AuditExportResult, AuditReport, AuditAcceptRiskResult, AuditConfigView } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { type AuditContext, type ScanFile, runAuditRulesWithStats } from './auditRules.js'
import {
  addBaselineFingerprint,
  applyAuditConfig,
  CONFIG_FILE,
  loadAuditConfig,
  saveAuditConfig,
  setRuleDisabled
} from './auditConfig.js'
import { FileFindingsCache } from './cache.js'
import { DEFAULT_GLOB_IGNORE, isScannableFile } from './engine/scanScope.js'
import { computeScore } from './scoring.js'
import { diffFindings } from './diff.js'
import { toSarif } from './export/sarif.js'
import { toMarkdown } from './export/markdown.js'
import { npmAuditFindings } from './npmAudit.js'
import { ALL_RULES } from './rules/registry.js'

const MAX_FILES = 1200
const MAX_FILE_BYTES = 200_000
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']

const GLOB_IGNORE = DEFAULT_GLOB_IGNORE

interface AuditStoreSchema {
  /** Last scan's finding fingerprints, keyed by project root path, for new-vs-resolved diffing. */
  lastFingerprints: Record<string, string[]>
}

/**
 * Read-only security auditor. Reads a bounded sample of source files (JS/TS/Vue/Svelte/Astro/
 * Python) plus the manifest and .gitignore, then runs the pure rule engine (AST + taint for JS/TS,
 * lexer heuristics for Python). It never executes project code; it only inspects file contents.
 *
 * Beyond raw findings it computes a posture score/grade, diffs against the previous scan
 * (new vs resolved), honours a project `.vibebar-audit.json` (disabled rules, severity overrides,
 * baseline, extra ignores), and reuses an incremental per-file cache so repeated/auto scans are
 * cheap. Each finding still carries a precise, context-rich fix prompt and a behavioral-test prompt.
 */
export class AuditService {
  private readonly projects: ProjectService
  /** Coalesces overlapping scans: the panel and the terminal can both trigger a run at once. */
  private inFlight: Promise<AuditReport> | null = null
  /** Last completed report per project root — reused by export when still fresh. */
  private lastReport: AuditReport | null = null
  private lastReportRoot: string | null = null
  /** Reports older than this are re-scanned on export (default 30 min). */
  private static readonly EXPORT_CACHE_MS = 30 * 60 * 1000
  private readonly cache = new FileFindingsCache()
  /** Lazily created so the service constructs fine outside an Electron app (e.g. unit tests). */
  private store: Store<AuditStoreSchema> | null = null
  private storeTried = false
  /** Fallback when electron-store is unavailable: diffing still works within the session. */
  private readonly memoryFingerprints: Record<string, string[]> = {}

  constructor(projects: ProjectService) {
    this.projects = projects
  }

  private getStore(): Store<AuditStoreSchema> | null {
    if (!this.storeTried) {
      this.storeTried = true
      try {
        this.store = new Store<AuditStoreSchema>({
          name: 'vibebar-audit',
          defaults: { lastFingerprints: {} }
        })
      } catch {
        this.store = null
      }
    }
    return this.store
  }

  run(): Promise<AuditReport> {
    if (this.inFlight) return this.inFlight
    const pending = this.execute().finally(() => {
      this.inFlight = null
    })
    this.inFlight = pending
    return pending
  }

  /** Last completed report for the active project, if any (no freshness check). */
  getCachedReport(): AuditReport | null {
    const root = this.projects.getProfile()?.rootPath ?? null
    if (root && this.lastReport && this.lastReportRoot === root && !this.lastReport.noProject) {
      return this.lastReport
    }
    return null
  }

  private async execute(): Promise<AuditReport> {
    const startedAt = Date.now()
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
    const config = await loadAuditConfig(root)
    const packageJson = await this.readPackageJson(root)
    const hasLockfile = LOCKFILES.some((f) => existsSync(join(root, f)))
    const gitignore = await this.readGitignore(root)
    const { files, total } = await this.readSourceFiles(root, config.extraIgnoreGlobs ?? [])

    const c = buildContext(profile)
    const ctx: AuditContext = {
      label: `my ${String(c.framework)} project (${String(c.language)})`,
      framework: String(c.framework),
      language: String(c.language),
      testRunner: String(c.testRunner)
    }

    this.cache.beginScan()
    const { findings: raw, cachedFiles } = runAuditRulesWithStats(
      { ctx, files, packageJson, hasLockfile, gitignore },
      { cache: this.cache }
    )
    const npmFindings = await npmAuditFindings(root, ctx)
    const combined = [...raw, ...npmFindings]
    // Bound cache memory to the files seen this scan.
    this.cache.retain(new Set(files.map((f) => FileFindingsCache.keyFor(f.path, f.content))))

    const findings = applyAuditConfig(combined, config)

    const previous = this.readFingerprints(root)
    const delta = diffFindings(findings, previous)
    this.persistFingerprints(root, findings.map((f) => f.fingerprint))

    const report: AuditReport = {
      ranAt: Date.now(),
      projectName: profile.folderName,
      scannedFiles: files.length,
      totalCandidates: total,
      truncated: total > files.length,
      findings,
      noProject: false,
      score: computeScore(findings),
      delta,
      durationMs: Date.now() - startedAt,
      cachedFiles
    }
    this.lastReport = report
    this.lastReportRoot = root
    return report
  }

  /** Returns a cached report when fresh enough for export; otherwise runs a new scan. */
  private async reportForExport(): Promise<{ report: AuditReport; fromCache: boolean }> {
    const root = this.projects.getProfile()?.rootPath ?? null
    if (
      root &&
      this.lastReport &&
      this.lastReportRoot === root &&
      !this.lastReport.noProject &&
      Date.now() - this.lastReport.ranAt < AuditService.EXPORT_CACHE_MS
    ) {
      return { report: this.lastReport, fromCache: true }
    }
    const report = await this.run()
    return { report, fromCache: false }
  }

  /** Runs the audit, serializes it (SARIF or Markdown), and prompts the user to save it to disk. */
  async exportTo(format: 'sarif' | 'markdown'): Promise<AuditExportResult> {
    const { report, fromCache } = await this.reportForExport()
    if (report.noProject) return { saved: false, reason: 'no-project' }

    const isSarif = format === 'sarif'
    const content = isSarif ? toSarif(report) : toMarkdown(report)
    const base = (report.projectName ?? 'project').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
    const ext = isSarif ? 'sarif' : 'md'
    const defaultDir = (() => {
      try {
        return app.getPath('downloads')
      } catch {
        return process.cwd()
      }
    })()

    const result = await dialog.showSaveDialog({
      title: isSarif ? 'Export audit as SARIF' : 'Export audit as Markdown',
      defaultPath: join(defaultDir, `${base}-security-audit.${ext}`),
      filters: isSarif
        ? [{ name: 'SARIF', extensions: ['sarif', 'json'] }]
        : [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false, reason: 'canceled' }

    try {
      await writeFile(result.filePath, content, 'utf8')
      return { saved: true, path: result.filePath, fromCache }
    } catch {
      return { saved: false, reason: 'write-failed', fromCache }
    }
  }

  private readFingerprints(root: string): string[] {
    const store = this.getStore()
    if (store) return store.get('lastFingerprints')?.[root] ?? []
    return this.memoryFingerprints[root] ?? []
  }

  private persistFingerprints(root: string, fingerprints: string[]): void {
    const store = this.getStore()
    if (store) {
      const all = store.get('lastFingerprints') ?? {}
      all[root] = fingerprints
      store.set('lastFingerprints', all)
      return
    }
    this.memoryFingerprints[root] = fingerprints
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

  private async readSourceFiles(
    root: string,
    extraIgnore: string[]
  ): Promise<{ files: ScanFile[]; total: number }> {
    let paths: string[]
    try {
      paths = await fg('**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,py,astro}', {
        cwd: root,
        ignore: [...GLOB_IGNORE, ...extraIgnore],
        dot: false,
        followSymbolicLinks: false,
        onlyFiles: true,
        suppressErrors: true
      })
    } catch {
      return { files: [], total: 0 }
    }

    const scannablePaths = paths
      .map((p) => p.replace(/\\/g, '/'))
      .filter((p) => isScannableFile(p))
    const scannableTotal = scannablePaths.length
    const limited = scannablePaths.slice(0, MAX_FILES)
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
    return { files: results.filter((f): f is ScanFile => f !== null && isScannableFile(f.path, f.content)), total: scannableTotal }
  }

  private projectRoot(): string | null {
    return this.projects.getProfile()?.rootPath ?? null
  }

  /** Builds the audit config view for the settings/panel UI. */
  async getConfigView(): Promise<AuditConfigView> {
    const root = this.projectRoot()
    if (!root) {
      return { noProject: true, rules: [], baselineCount: 0, disabledCount: 0 }
    }
    const config = await loadAuditConfig(root)
    const disabled = new Set(config.disabledRules ?? [])
    return {
      configPath: join(root, CONFIG_FILE),
      rules: ALL_RULES.map((r) => ({ id: r.id, disabled: disabled.has(r.id) })),
      baselineCount: config.baseline?.length ?? 0,
      disabledCount: disabled.size
    }
  }

  /** Adds a finding fingerprint to the accepted-risk baseline in `.vibebar-audit.json`. */
  async acceptRisk(fingerprint: string): Promise<AuditAcceptRiskResult> {
    const root = this.projectRoot()
    if (!root) {
      return { ok: false, config: { noProject: true, rules: [], baselineCount: 0, disabledCount: 0 } }
    }
    const config = await loadAuditConfig(root)
    const next = addBaselineFingerprint(config, fingerprint)
    await saveAuditConfig(root, next)
    return { ok: true, config: await this.getConfigView() }
  }

  /** Enables or disables a rule in `.vibebar-audit.json`. */
  async setRuleDisabled(ruleId: string, disabled: boolean): Promise<AuditConfigView> {
    const root = this.projectRoot()
    if (!root) {
      return { noProject: true, rules: [], baselineCount: 0, disabledCount: 0 }
    }
    const config = await loadAuditConfig(root)
    const next = setRuleDisabled(config, ruleId, disabled)
    await saveAuditConfig(root, next)
    return this.getConfigView()
  }
}
