import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyProfile } from '@vibebar/project-detector'
import { computeProjectMemoryDiff, formatProjectMemoryOneLiner } from './projectMemoryDiff.js'

describe('computeProjectMemoryDiff', () => {
  it('warns when AGENTS.md is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mem-'))
    try {
      const profile = emptyProfile(dir, 'demo')
      profile.framework = 'next'
      profile.language = 'typescript'
      profile.packageManager = 'pnpm'
      profile.hasRootManifest = true
      const diff = await computeProjectMemoryDiff({
        profile,
        agentsMd: null,
        cursorRulesCount: 0,
        contextReadme: null
      })
      expect(diff.agentsMdExists).toBe(false)
      expect(diff.warnings.some((w) => w.id === 'no-agents-md')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('detects framework mismatch between profile and AGENTS.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mem-'))
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
      const profile = emptyProfile(dir, 'demo')
      profile.framework = 'next'
      profile.language = 'typescript'
      profile.hasRootManifest = true
      const agentsMd = '# Project\n\nThis is a Create React App project using react hooks.'
      const diff = await computeProjectMemoryDiff({
        profile,
        agentsMd,
        cursorRulesCount: 1,
        contextReadme: 'readme'
      })
      expect(diff.warnings.some((w) => w.id === 'framework-mismatch')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('flags undocumented package.json scripts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mem-'))
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ scripts: { test: 'vitest', deploy: 'node deploy.js' } })
      )
      const profile = emptyProfile(dir, 'demo')
      profile.framework = 'next'
      profile.hasRootManifest = true
      const agentsMd = '# Agents\n\nRun npm test for unit tests.\n'
      const diff = await computeProjectMemoryDiff({
        profile,
        agentsMd,
        cursorRulesCount: 0,
        contextReadme: null
      })
      expect(diff.warnings.some((w) => w.id === 'scripts-not-documented')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('notes cursor rules growth vs last known count', async () => {
    const profile = emptyProfile('/tmp/x', 'demo')
    const diff = await computeProjectMemoryDiff({
      profile,
      agentsMd: '# Agents\nnext.js typescript src/',
      cursorRulesCount: 3,
      contextReadme: 'ok',
      lastKnownCursorRulesCount: 1
    })
    expect(diff.warnings.some((w) => w.id === 'cursor-rules-added')).toBe(true)
  })

  it('formatProjectMemoryOneLiner returns null when no warnings', () => {
    expect(
      formatProjectMemoryOneLiner({
        warnings: [],
        agentsMdExists: true,
        agentsMdAgeDays: 1,
        cursorRulesCount: 1,
        contextReadmeExists: true,
        codesyncConfigured: false
      })
    ).toBeNull()
  })
})

describe('top-level dir drift', () => {
  it('warns when src/ exists but AGENTS.md omits it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vb-mem-'))
    try {
      await mkdir(join(dir, 'src'))
      const profile = emptyProfile(dir, 'demo')
      const diff = await computeProjectMemoryDiff({
        profile,
        agentsMd: '# Agents\n\nGeneric project notes.',
        cursorRulesCount: 0,
        contextReadme: null
      })
      expect(diff.warnings.some((w) => w.id === 'dir-not-referenced-src')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
