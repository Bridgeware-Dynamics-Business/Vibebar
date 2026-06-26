import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import fg from 'fast-glob'
import { parseUserIgnoreLines } from '@vibebar/codesync'
import type { ProjectProfile } from '@vibebar/project-detector'
import { readChangedFilePaths } from '../git/gitDiff.js'
import {
  type PackPathCategory,
  PACK_CHAR_BUDGET,
  PRESET_GLOBS,
  packContext,
  relativeWithin,
  resolveWithinRoot,
  trimPathsToCharBudget
} from './contextPacker.js'

const MAX_IMPORT_HOP_FILES = 20

const IMPORT_RES =
  /(?:from\s+['"](\.[^'"]+)['"]|require\s*\(\s*['"](\.[^'"]+)['"]\s*\)|import\s*\(\s*['"](\.[^'"]+)['"]\s*\))/g

export interface MvcPackInput {
  rootPath: string
  headerLabel: string
  /** Extra seed paths (stack frames, failure files). */
  seedPaths?: string[]
  ignoreText?: string
  charBudget?: number
}

export interface MvcPackResult {
  text: string
  fileCount: number
  skipped: number
  paths: string[]
  trimmedPaths: string[]
  categories: Record<string, PackPathCategory>
}

function ignorePatterns(ignoreText?: string): string[] {
  return parseUserIgnoreLines(ignoreText ?? '')
}

function resolveImport(rootPath: string, fromFile: string, spec: string): string | null {
  const dir = dirname(fromFile)
  const base = join(dir, spec).replace(/\\/g, '/')
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '']
  for (const ext of exts) {
    const candidate = ext && !base.endsWith(ext) ? `${base}${ext}` : base
    const abs = resolveWithinRoot(rootPath, candidate)
    if (abs) return candidate.replace(/\\/g, '/')
  }
  return null
}

/** One-hop import/require expansion from seed files, intra-repo only. */
export async function expandImportNeighbors(
  rootPath: string,
  seedPaths: string[],
  cap = MAX_IMPORT_HOP_FILES
): Promise<string[]> {
  const found = new Set<string>()
  for (const rel of seedPaths) {
    const abs = resolveWithinRoot(rootPath, rel)
    if (!abs) continue
    let content: string
    try {
      content = await readFile(abs, 'utf8')
    } catch {
      continue
    }
    IMPORT_RES.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RES.exec(content)) !== null) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (!spec) continue
      const resolved = resolveImport(rootPath, rel, spec)
      if (resolved) found.add(resolved)
      if (found.size >= cap) return [...found]
    }
  }
  return [...found]
}

/** Finds test files related to a source path via basename matching and preset globs. */
export async function findRelatedTests(rootPath: string, paths: string[], ignore: string[]): Promise<string[]> {
  const tests = new Set<string>()
  const allTests = await fg(PRESET_GLOBS.tests, {
    cwd: rootPath,
    onlyFiles: true,
    followSymbolicLinks: false,
    suppressErrors: true
  })
  const testList = allTests.map((p) => p.replace(/\\/g, '/'))

  for (const src of paths) {
    const base = src.replace(/\\/g, '/').replace(/\.[^.]+$/, '')
    const name = base.split('/').pop() ?? base
    for (const t of testList) {
      if (t.includes(name) && (t.includes('.test.') || t.includes('.spec.') || t.includes('__tests__'))) {
        tests.add(t)
      }
    }
  }

  if (tests.size === 0 && paths.length > 0) {
    const dir = dirname(paths[0].replace(/\\/g, '/'))
    for (const t of testList) {
      if (t.startsWith(dir)) tests.add(t)
    }
  }

  return [...tests].slice(0, 8)
}

function nearestTestFile(testPaths: string[], failureFiles: string[]): string | null {
  if (testPaths.length === 0) return null
  if (failureFiles.length === 0) return testPaths[0] ?? null
  const fail = failureFiles[0].replace(/\\/g, '/')
  const failDir = dirname(fail)
  const sameDir = testPaths.find((t) => dirname(t) === failDir)
  return sameDir ?? testPaths[0] ?? null
}

export { nearestTestFile }

/**
 * Minimum Viable Context pack: git-changed files + 1-hop imports + related tests, trimmed to
 * char budget with changed > stack/import > tests > config priority.
 */
export async function packMvcContext(input: MvcPackInput): Promise<MvcPackResult> {
  const ignore = ignorePatterns(input.ignoreText)
  const budget = input.charBudget ?? PACK_CHAR_BUDGET
  const changed = await readChangedFilePaths(input.rootPath)
  const seeds = [...new Set([...changed, ...(input.seedPaths ?? [])])]
  const imports = await expandImportNeighbors(input.rootPath, seeds)
  const tests = await findRelatedTests(input.rootPath, seeds, ignore)

  const categories: Record<string, PackPathCategory> = {}
  for (const p of changed) categories[p] = 'changed'
  for (const p of input.seedPaths ?? []) categories[p] = 'stack'
  for (const p of imports) categories[p] = categories[p] ?? 'import'
  for (const p of tests) categories[p] = categories[p] ?? 'tests'

  const allPaths = [...new Set([...changed, ...imports, ...tests, ...(input.seedPaths ?? [])])]
  const { kept, trimmed } = await trimByReading(input.rootPath, allPaths, categories, budget, ignore)

  const out = await packContext({
    rootPath: input.rootPath,
    relPaths: kept,
    headerLabel: input.headerLabel,
    ignorePatterns: ignore,
    pathCategories: categories
  })

  return {
    text: out.redactedText,
    fileCount: out.fileCount,
    skipped: out.skipped,
    paths: kept,
    trimmedPaths: trimmed,
    categories
  }
}

async function trimByReading(
  rootPath: string,
  paths: string[],
  categories: Record<string, PackPathCategory>,
  budget: number,
  ignore: string[]
): Promise<{ kept: string[]; trimmed: string[] }> {
  const charByPath = new Map<string, number>()
  for (const p of paths) {
    const abs = resolveWithinRoot(rootPath, p)
    if (!abs) {
      charByPath.set(p, 0)
      continue
    }
    try {
      const content = await readFile(abs, 'utf8')
      charByPath.set(p, content.length)
    } catch {
      charByPath.set(p, 0)
    }
  }
  const total = [...charByPath.values()].reduce((a, b) => a + b, 0)
  if (total <= budget) return { kept: paths, trimmed: [] }
  const result = trimPathsToCharBudget(paths, charByPath, categories, budget)
  return { kept: result.kept, trimmed: result.trimmed }
}

export function stackPathsFromProfile(rootPath: string, frames: { file: string }[]): string[] {
  const rels: string[] = []
  for (const frame of frames) {
    const raw = frame.file.replace(/\\/g, '/')
    if (/^[a-zA-Z]:/.test(raw) || raw.startsWith('/')) {
      const rel = relativeWithin(rootPath, raw.replace(/^file:\/\//, ''))
      if (rel) rels.push(rel)
    } else if (!raw.startsWith('..') && !raw.includes('node:')) {
      rels.push(raw)
    }
  }
  return [...new Set(rels)]
}

export function describeStackForProfile(_profile: ProjectProfile | null, paths: string[]): string {
  if (paths.length === 0) return ''
  return paths.slice(0, 12).join(', ')
}
