import { describe, expect, it } from 'vitest'
import {
  adjustSeverityForScope,
  classifyNpmPackageScope,
  loadWorkspaceManifests,
  npmAuditDirectRoot,
  scopeLabel
} from './npmAudit.js'

describe('npm audit scope classification', () => {
  const manifests = [
    {
      dependencies: { react: '^19.0.0' },
      devDependencies: { vitest: '^2.1.8', electron: '^38.8.6', vite: '^5.4.11' }
    },
    {
      dependencies: { zod: '^3.24.1' },
      devDependencies: { electron: '^38.8.6', vite: '^5.4.11' }
    }
  ]

  const vulns = {
    vitest: { via: ['@vitest/mocker', 'vite'] },
    '@vitest/mocker': { via: ['vite'] },
    vite: { via: ['esbuild'] },
    esbuild: { via: ['vite'] },
    electron: { via: [] },
    react: { via: [] }
  }

  it('classifies electron as shipped runtime despite devDependency declaration', () => {
    expect(classifyNpmPackageScope('electron', vulns, manifests)).toBe('shipped')
  })

  it('classifies vitest as dev-tooling', () => {
    expect(classifyNpmPackageScope('vitest', vulns, manifests)).toBe('dev-tooling')
  })

  it('classifies transitive vite-node path as dev-tooling', () => {
    expect(classifyNpmPackageScope('@vitest/mocker', vulns, manifests)).toBe('dev-tooling')
  })

  it('classifies production dependencies correctly', () => {
    expect(classifyNpmPackageScope('react', vulns, manifests)).toBe('production')
  })

  it('downgrades dev-tooling severities', () => {
    expect(adjustSeverityForScope('critical', 'dev-tooling')).toBe('medium')
    expect(adjustSeverityForScope('high', 'dev-tooling')).toBe('low')
    expect(adjustSeverityForScope('critical', 'shipped')).toBe('critical')
    expect(adjustSeverityForScope('high', 'production')).toBe('high')
  })

  it('labels scopes for findings', () => {
    expect(scopeLabel('dev-tooling')).toContain('dev tooling')
    expect(scopeLabel('shipped')).toContain('Electron')
  })

  it('loads workspace manifests from the repo root', () => {
    const loaded = loadWorkspaceManifests(process.cwd())
    expect(loaded.length).toBeGreaterThan(1)
    const names = loaded.flatMap((m) => [
      ...Object.keys(m.dependencies ?? {}),
      ...Object.keys(m.devDependencies ?? {})
    ])
    expect(names).toContain('vitest')
    expect(names).toContain('electron')
  })

  it('resolves transitive packages to their direct dependency root', () => {
    expect(npmAuditDirectRoot('@vitest/mocker', vulns, manifests)).toBe('vite')
    expect(npmAuditDirectRoot('esbuild', vulns, manifests)).toBe('vite')
    expect(npmAuditDirectRoot('electron', vulns, manifests)).toBe('electron')
  })
})
