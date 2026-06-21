import { describe, expect, it } from 'vitest'
import type { ProjectProfile } from '@vibebar/project-detector'
import { analyzeOutput } from './outputAnalyzer.js'

const profile: ProjectProfile = {
  rootPath: '/app',
  folderName: 'app',
  gitBranch: 'main',
  language: 'typescript',
  framework: 'next',
  isElectron: false,
  testRunner: 'vitest',
  packageManager: 'pnpm',
  entryFile: null,
  rendererDir: 'src',
  hasDb: true,
  isMonorepo: false,
  hasContextFolder: false,
  stacks: ['next', 'react', 'typescript']
}

describe('analyzeOutput', () => {
  it('returns nothing for empty output', () => {
    expect(analyzeOutput({ command: 'ls', output: '   ', exitCode: 0, profile })).toEqual([])
  })

  it('detects a missing module and produces a project-aware prompt', () => {
    const issues = analyzeOutput({
      command: 'npm run dev',
      output: "Error: Cannot find module 'express'\n    at Module._resolveFilename",
      exitCode: 1,
      profile
    })
    const issue = issues.find((i) => i.id === 'missing-node-module')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('error')
    expect(issue?.prompt).toContain('Next.js')
    expect(issue?.prompt).toContain('pnpm')
    expect(issue?.prompt).toContain('Cannot find module')
  })

  it('detects TypeScript errors', () => {
    const issues = analyzeOutput({
      command: 'tsc',
      output: "src/a.ts(3,5): error TS2345: Argument of type 'string' is not assignable.",
      exitCode: 2,
      profile
    })
    expect(issues.some((i) => i.id === 'typescript-error')).toBe(true)
  })

  it('detects failing tests and references the test runner', () => {
    const issues = analyzeOutput({
      command: 'npm test',
      output: 'FAIL src/x.test.ts\n  AssertionError: expected 1 to be 2',
      exitCode: 1,
      profile
    })
    const issue = issues.find((i) => i.id === 'test-failure')
    expect(issue).toBeDefined()
    expect(issue?.prompt).toContain('Vitest')
  })

  it('detects a port collision', () => {
    const issues = analyzeOutput({
      command: 'npm run dev',
      output: 'Error: listen EADDRINUSE: address already in use :::3000',
      exitCode: 1,
      profile
    })
    expect(issues.some((i) => i.id === 'port-in-use')).toBe(true)
  })

  it('falls back to a generic prompt on non-zero exit with no signature', () => {
    const issues = analyzeOutput({
      command: 'do-thing',
      output: 'something unexpected happened',
      exitCode: 3,
      profile
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.id).toBe('generic-failure')
    expect(issues[0]?.prompt).toContain('exited with code 3')
  })

  it('does not flag a generic failure when the command succeeded', () => {
    const issues = analyzeOutput({
      command: 'echo hi',
      output: 'hi',
      exitCode: 0,
      profile
    })
    expect(issues).toEqual([])
  })

  it('works without a project profile', () => {
    const issues = analyzeOutput({
      command: 'python app.py',
      output: "ModuleNotFoundError: No module named 'flask'",
      exitCode: 1,
      profile: null
    })
    expect(issues.some((i) => i.id === 'python-module-not-found')).toBe(true)
    expect(issues[0]?.prompt).toContain('my project')
  })
})
