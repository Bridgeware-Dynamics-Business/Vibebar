import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectProject } from './detect.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__')
const fixture = (name: string): string => join(fixturesDir, name)

describe('detectProject', () => {
  it('detects an Electron + TypeScript app', async () => {
    const p = await detectProject(fixture('electron-app'))
    expect(p.framework).toBe('electron')
    expect(p.isElectron).toBe(true)
    expect(p.language).toBe('typescript')
    expect(p.testRunner).toBe('vitest')
    expect(p.isMonorepo).toBe(true)
    expect(p.stacks).toContain('electron')
    expect(p.stacks).toContain('typescript')
    expect(p.stacks).toContain('any')
  })

  it('detects a Next.js app with Prisma and Playwright', async () => {
    const p = await detectProject(fixture('next-app'))
    expect(p.framework).toBe('next')
    expect(p.isElectron).toBe(false)
    expect(p.language).toBe('typescript')
    expect(p.testRunner).toBe('playwright')
    expect(p.hasDb).toBe(true)
    expect(p.stacks).toContain('next')
  })

  it('detects a Python FastAPI project', async () => {
    const p = await detectProject(fixture('python-fastapi'))
    expect(p.language).toBe('python')
    expect(p.framework).toBe('fastapi')
    expect(p.testRunner).toBe('pytest')
    expect(p.hasDb).toBe(true)
    expect(p.packageManager).toBe('pip')
    expect(p.stacks).toContain('python')
  })

  it('detects a Rust project', async () => {
    const p = await detectProject(fixture('rust-app'))
    expect(p.language).toBe('rust')
    expect(p.packageManager).toBe('cargo')
    expect(p.stacks).toContain('rust')
  })

  it('returns an unknown profile with the any stack for an empty folder', async () => {
    const p = await detectProject(fixturesDir)
    expect(p.stacks).toContain('any')
    expect(p.language).toBe('unknown')
  })
})
