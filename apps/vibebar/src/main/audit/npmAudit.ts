import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import fg from 'fast-glob'
import type { AuditFinding } from '@shared/types.js'
import type { AuditContext } from './engine/context.js'
import { metaFinding } from './engine/prompts.js'

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']
const TIMEOUT_MS = 30_000

/** Declared as devDependencies but bundled into the shipped Electron runtime. */
const SHIPPED_RUNTIME_PACKAGES = new Set(['electron', 'electron-builder', 'electron-updater'])

interface NpmAuditVuln {
  severity?: string
  title?: string
  url?: string
  via?: unknown[]
  isDirect?: boolean
}

interface NpmAuditJson {
  vulnerabilities?: Record<string, NpmAuditVuln>
  metadata?: { vulnerabilities?: Record<string, number> }
}

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

export type NpmDepScope = 'shipped' | 'production' | 'dev-tooling'

function hasLockfile(root: string): boolean {
  return LOCKFILES.some((f) => existsSync(join(root, f)))
}

function readManifest(path: string): PackageManifest | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
  } catch {
    return null
  }
}

/** Loads root + workspace package.json files so scope classification covers monorepos. */
export function loadWorkspaceManifests(root: string): PackageManifest[] {
  const rootManifest = readManifest(join(root, 'package.json'))
  if (!rootManifest) return []

  const manifests: PackageManifest[] = [rootManifest]
  const workspaceField = rootManifest.workspaces
  const patterns: string[] = []
  if (Array.isArray(workspaceField)) {
    patterns.push(...workspaceField.map((p) => `${p}/package.json`))
  } else if (workspaceField && Array.isArray(workspaceField.packages)) {
    patterns.push(...workspaceField.packages.map((p) => `${p}/package.json`))
  }

  if (patterns.length > 0) {
    try {
      const paths = fg.sync(patterns, { cwd: root, onlyFiles: true, suppressErrors: true })
      for (const rel of paths) {
        const m = readManifest(join(root, rel))
        if (m) manifests.push(m)
      }
    } catch {
      // Best-effort workspace discovery.
    }
  }

  return manifests
}

function directDepSets(manifests: PackageManifest[]): { prod: Set<string>; dev: Set<string> } {
  const prod = new Set<string>()
  const dev = new Set<string>()
  for (const m of manifests) {
    for (const name of Object.keys(m.dependencies ?? {})) prod.add(name)
    for (const name of Object.keys(m.devDependencies ?? {})) dev.add(name)
  }
  return { prod, dev }
}

function isDirectDependency(name: string, manifests: PackageManifest[]): boolean {
  const { prod, dev } = directDepSets(manifests)
  return prod.has(name) || dev.has(name)
}

/**
 * Walks `via` links upward to the nearest direct dependency (or shipped runtime package).
 * Used to collapse transitive npm audit noise into one finding per dependency tree.
 */
export function npmAuditDirectRoot(
  name: string,
  vulns: Record<string, NpmAuditVuln>,
  manifests: PackageManifest[]
): string {
  if (SHIPPED_RUNTIME_PACKAGES.has(name)) return name
  const { prod, dev } = directDepSets(manifests)
  if (prod.has(name) || dev.has(name)) return name

  const visited = new Set<string>()
  const queue = viaParents(vulns[name] ?? {})
  while (queue.length > 0) {
    const pkg = queue.shift()!
    if (visited.has(pkg)) continue
    visited.add(pkg)
    if (SHIPPED_RUNTIME_PACKAGES.has(pkg)) return pkg
    if (prod.has(pkg) || dev.has(pkg)) return pkg
    const parentVuln = vulns[pkg]
    if (parentVuln) queue.push(...viaParents(parentVuln))
  }
  return name
}

function viaParents(vuln: NpmAuditVuln): string[] {
  const parents: string[] = []
  for (const entry of vuln.via ?? []) {
    if (typeof entry === 'string') parents.push(entry)
    else if (entry && typeof entry === 'object' && 'name' in entry) {
      const name = (entry as { name?: string }).name
      if (name) parents.push(name)
    }
  }
  return parents
}

/** Walks the npm audit graph to infer whether a transitive package only reaches dev tooling. */
export function classifyNpmPackageScope(
  name: string,
  vulns: Record<string, NpmAuditVuln>,
  manifests: PackageManifest[]
): NpmDepScope {
  if (SHIPPED_RUNTIME_PACKAGES.has(name)) return 'shipped'

  const { prod, dev } = directDepSets(manifests)
  const inProd = prod.has(name)
  const inDev = dev.has(name)

  if (inProd) return 'production'
  if (inDev) return SHIPPED_RUNTIME_PACKAGES.has(name) ? 'shipped' : 'dev-tooling'

  const visited = new Set<string>()
  const queue = [name]
  let reachesProd = false
  let reachesShipped = false
  let reachesDev = false

  while (queue.length > 0) {
    const pkg = queue.shift()!
    if (visited.has(pkg)) continue
    visited.add(pkg)

    if (SHIPPED_RUNTIME_PACKAGES.has(pkg)) {
      reachesShipped = true
      continue
    }
    if (prod.has(pkg)) reachesProd = true
    if (dev.has(pkg)) reachesDev = true

    const vuln = vulns[pkg]
    if (!vuln) continue
    for (const parent of viaParents(vuln)) {
      if (parent !== pkg) queue.push(parent)
    }
  }

  if (reachesShipped) return 'shipped'
  if (reachesProd) return 'production'
  if (reachesDev) return 'dev-tooling'
  return 'dev-tooling'
}

export function scopeLabel(scope: NpmDepScope): string {
  switch (scope) {
    case 'shipped':
      return 'shipped runtime (bundled into your Electron app)'
    case 'production':
      return 'production dependency'
    case 'dev-tooling':
      return 'dev tooling (local development/build only)'
  }
}

function mapSeverity(raw: string | undefined): 'critical' | 'high' | null {
  const s = (raw ?? '').toLowerCase()
  if (s === 'critical') return 'critical'
  if (s === 'high') return 'high'
  return null
}

/** Lowers severity for dev-only advisories so posture score reflects user-facing risk. */
export function adjustSeverityForScope(
  base: 'critical' | 'high',
  scope: NpmDepScope
): AuditFinding['severity'] {
  if (scope === 'shipped' || scope === 'production') return base
  if (base === 'critical') return 'medium'
  return 'low'
}

function runNpmAuditJson(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['audit', '--json'], {
      cwd: root,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(null)
    }, TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(stdout.trim() || stderr.trim() || null)
    })
  })
}

/**
 * Runs `npm audit --json` at the project root (bounded timeout) and maps high/critical
 * advisories into supply-chain audit findings. Skips gracefully when npm or a lockfile
 * is unavailable.
 */
export async function npmAuditFindings(root: string, ctx: AuditContext): Promise<AuditFinding[]> {
  if (!existsSync(join(root, 'package.json')) || !hasLockfile(root)) return []

  const raw = await runNpmAuditJson(root)
  if (!raw) return []

  let parsed: NpmAuditJson
  try {
    parsed = JSON.parse(raw) as NpmAuditJson
  } catch {
    return []
  }

  const vulns = parsed.vulnerabilities ?? {}
  const manifests = loadWorkspaceManifests(root)
  const findings: AuditFinding[] = []
  const reportedRoots = new Set<string>()

  // Prefer shipped/production direct deps, then dev tooling — one finding per dependency tree.
  const candidates = Object.entries(vulns)
    .map(([name, vuln]) => {
      const baseSeverity = mapSeverity(vuln.severity)
      if (!baseSeverity) return null
      const scope = classifyNpmPackageScope(name, vulns, manifests)
      const root = npmAuditDirectRoot(name, vulns, manifests)
      return { name, vuln, baseSeverity, scope, root, direct: isDirectDependency(name, manifests) }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => {
      const scopeRank = { shipped: 0, production: 1, 'dev-tooling': 2 }
      const sr = scopeRank[a.scope] - scopeRank[b.scope]
      if (sr !== 0) return sr
      if (a.direct !== b.direct) return a.direct ? -1 : 1
      const sevRank = { critical: 0, high: 1 }
      return sevRank[a.baseSeverity] - sevRank[b.baseSeverity]
    })

  for (const { name, vuln, baseSeverity, scope, root, direct } of candidates) {
    if (!direct && reportedRoots.has(root)) continue
    reportedRoots.add(root)

    const severity = adjustSeverityForScope(baseSeverity, scope)
    const title = vuln.title ?? name
    const scopeText = scopeLabel(scope)
    const scopePrefix = scope === 'dev-tooling' ? ' (dev tooling)' : scope === 'shipped' ? ' (shipped runtime)' : ''

    const detailParts = [
      `npm audit reports a ${baseSeverity} severity vulnerability in ${name}${root !== name ? ` (via ${root})` : ''} (${scopeText}).`
    ]
    if (scope === 'dev-tooling') {
      detailParts.push(
        'This affects local development and test tooling — not the packaged app your end users run.'
      )
    } else if (scope === 'shipped') {
      detailParts.push('This package is part of your shipped Electron runtime — prioritize before release.')
    }

    const remediationEffort: AuditFinding['remediationEffort'] =
      scope === 'dev-tooling' ? 'moderate' : scope === 'shipped' ? 'involved' : 'moderate'

    findings.push(
      metaFinding({
        input: { ctx },
        id: `npm-audit-${name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48)}`,
        category: 'Supply Chain',
        severity,
        confidence: 'high',
        remediationEffort,
        cwe: 'CWE-1104 — Use of Unmaintained Third Party Components',
        references: ['OWASP A06:2021 — Vulnerable and Outdated Components', ...(vuln.url ? [vuln.url] : [])],
        title: `npm advisory${scopePrefix}: ${title}`,
        detail: detailParts.join(' '),
        file: 'package.json',
        evidence: `Scope: ${scopeText}${vuln.url ? `\nAdvisory: ${vuln.url}` : ''}`,
        fix: {
          task: `Remediate the ${baseSeverity} npm advisory for ${name}`,
          where: `Dependency: ${name} (${scopeText})\nAdvisory: ${vuln.url ?? title}`,
          problem:
            scope === 'dev-tooling'
              ? 'A known vulnerable dev-tool version is in the tree. Risk is mainly to developers running local servers or test UI — upgrade when convenient, but do not treat it like a production RCE.'
              : 'A known vulnerable package version is in the dependency tree. Attackers may exploit published CVEs without any change to application source code.',
          goal:
            scope === 'shipped'
              ? 'Upgrade Electron (or the shipped runtime package) to a patched version and verify the packaged app before release.'
              : 'Upgrade or replace the affected dependency to a patched version and verify the lockfile is updated.',
          steps: [
            `Run \`npm audit fix\` or manually upgrade ${name} to a non-vulnerable version.`,
            scope === 'shipped'
              ? 'Rebuild and smoke-test the packaged Electron app after upgrading.'
              : 'Re-run tests and confirm the lockfile reflects the upgrade.',
            'If no fix exists, document the risk and consider an alternative package or mitigation.'
          ]
        },
        test: {
          objective: 'Prevent reintroduction of the vulnerable dependency version.',
          steps: [
            scope === 'dev-tooling'
              ? 'Add a CI step that runs `npm audit --audit-level=high` on production dependencies or documents accepted dev-tool risk.'
              : 'Add a CI step that runs `npm audit --audit-level=high` and fails on high/critical advisories in shipped/production deps.',
            'Pin dependency versions and commit the lockfile.'
          ]
        }
      })
    )
  }

  return findings.slice(0, 25)
}
