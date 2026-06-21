export type ProjectLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'php'
  | 'unknown'

export type ProjectFramework =
  | 'electron'
  | 'next'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'fastapi'
  | 'flask'
  | 'django'
  | 'laravel'
  | 'unknown'

export type TestRunner = 'vitest' | 'jest' | 'pytest' | 'playwright' | 'unknown'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'pip' | 'cargo' | 'go' | 'composer' | 'unknown'

/**
 * A read-only fingerprint of the user's active project. Every field is derived from
 * signal files only — project code is never executed.
 */
export interface ProjectProfile {
  rootPath: string
  folderName: string
  gitBranch: string | null
  language: ProjectLanguage
  framework: ProjectFramework
  isElectron: boolean
  testRunner: TestRunner
  packageManager: PackageManager
  entryFile: string | null
  rendererDir: string | null
  hasDb: boolean
  isMonorepo: boolean
  /** True when an AI context folder already exists at the project root. */
  hasContextFolder: boolean
  /** Short tags used to gate prompt visibility, e.g. ['electron', 'typescript', 'vite']. */
  stacks: string[]
}

export function emptyProfile(rootPath: string, folderName: string): ProjectProfile {
  return {
    rootPath,
    folderName,
    gitBranch: null,
    language: 'unknown',
    framework: 'unknown',
    isElectron: false,
    testRunner: 'unknown',
    packageManager: 'unknown',
    entryFile: null,
    rendererDir: null,
    hasDb: false,
    isMonorepo: false,
    hasContextFolder: false,
    stacks: ['any']
  }
}
