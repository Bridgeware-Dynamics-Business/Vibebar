import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import fg from 'fast-glob'
import { compileIgnoreMatchers, getIgnoreGlobList, isIgnoredRel } from '@vibebar/codesync'

/** Parses Code Sync ignore textarea (newline- or comma-separated). Inlined here so main IPC does not import codesync parsers separately from the packer. */
function parseUserIgnoreLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Resolves user ignore patterns from Code Sync config text. */
export function packIgnorePatternsFromIgnoreText(ignoreText: string): string[] {
  return parseUserIgnoreLines(ignoreText)
}
import type { PackNode, ScanResult } from '@shared/types.js'
import { scanText } from '../scanner/secretScanner.js'

const DEFAULT_MAX_FILE_BYTES = 256 * 1024

/** Default total bundle char budget before trimming lower-priority files. */
export const PACK_CHAR_BUDGET = 32_000

export type PackPathCategory = 'changed' | 'tests' | 'config' | 'import' | 'stack' | 'other'

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  py: 'python',
  rs: 'rust',
  go: 'go',
  php: 'php',
  java: 'java',
  rb: 'ruby',
  css: 'css',
  scss: 'scss',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  sql: 'sql'
}

function fenceLang(rel: string): string {
  const ext = rel.split('.').pop()?.toLowerCase() ?? ''
  return LANG_BY_EXT[ext] ?? ''
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/')
}

/**
 * Resolves a caller-supplied path against the project root, returning the absolute path only if
 * it stays inside the root. Rejects absolute inputs and any path that escapes via `..` or a
 * different drive — `path.join` does not reset on an absolute segment, so an absolute Windows
 * path would otherwise be silently mangled into (or out of) the root.
 */
export function resolveWithinRoot(rootPath: string, raw: string): string | null {
  if (isAbsolute(raw)) return null
  const rel = normalizeRel(raw)
  if (!rel || rel.includes('..')) return null
  const abs = join(rootPath, rel)
  const back = relative(rootPath, abs)
  if (back.startsWith('..') || isAbsolute(back)) return null
  return abs
}

export interface BundleFile {
  rel: string
  content: string
}

/** Pure: assembles the prompt-shaped markdown from already-read files. */
export function buildBundleText(headerLabel: string, files: BundleFile[]): string {
  const lines: string[] = [`## Project context: ${headerLabel}`, '']
  for (const file of files) {
    lines.push(`### ${file.rel}`)
    lines.push('```' + fenceLang(file.rel))
    lines.push(file.content.replace(/\s+$/, ''))
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function looksBinary(content: string): boolean {
  return content.includes('\u0000')
}

export interface PackContextOptions {
  rootPath: string
  relPaths: string[]
  headerLabel: string
  maxFileBytes?: number
  /** Extra ignore globs (e.g. Code Sync user rules). */
  ignorePatterns?: string[]
  /** Optional per-path category for budget trimming (lower priority dropped first). */
  pathCategories?: Record<string, PackPathCategory>
  /** Total char budget for file contents; trims config/tests before changed. */
  charBudget?: number
}

export interface PackContextOutput extends ScanResult {
  fileCount: number
  skipped: number
}

/** Trim priority when over char budget — first listed categories are kept longest. */
export const PACK_TRIM_PRIORITY: PackPathCategory[] = ['changed', 'stack', 'import', 'tests', 'config', 'other']

function categoryRank(cat: PackPathCategory): number {
  const idx = PACK_TRIM_PRIORITY.indexOf(cat)
  return idx === -1 ? PACK_TRIM_PRIORITY.length : idx
}

/**
 * Drops lower-priority paths when estimated content exceeds the char budget. Returns paths in
 * stable priority order (changed first).
 */
export function trimPathsToCharBudget(
  paths: string[],
  charByPath: Map<string, number>,
  categories: Record<string, PackPathCategory>,
  budget: number
): { kept: string[]; trimmed: string[]; totalChars: number } {
  const sorted = [...paths].sort((a, b) => {
    const ra = categoryRank(categories[a] ?? 'other')
    const rb = categoryRank(categories[b] ?? 'other')
    return ra - rb || a.localeCompare(b)
  })
  const kept: string[] = []
  const trimmed: string[] = []
  let total = 0
  for (const p of sorted) {
    const chars = charByPath.get(p) ?? 0
    if (total + chars <= budget || kept.length === 0) {
      kept.push(p)
      total += chars
    } else {
      trimmed.push(p)
    }
  }
  return { kept, trimmed, totalChars: total }
}

/**
 * Reads the selected files (read-only), bundles them into a prompt-shaped block, and runs
 * the secret scanner so the returned text is already redacted before it leaves the machine.
 */
export async function packContext(opts: PackContextOptions): Promise<PackContextOutput> {
  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const match = compileIgnoreMatchers(opts.ignorePatterns ?? [])
  const charBudget = opts.charBudget ?? PACK_CHAR_BUDGET
  const categories = opts.pathCategories ?? {}

  let relPaths = opts.relPaths
  if (charBudget > 0 && relPaths.length > 0) {
    const est = await estimatePaths(opts.rootPath, relPaths, maxBytes, opts.ignorePatterns)
    const charByPath = new Map<string, number>()
    let perFile = est.charCount / Math.max(est.fileCount, 1)
    for (const p of relPaths) {
      charByPath.set(p, perFile)
    }
    if (est.charCount > charBudget) {
      const trimmed = trimPathsToCharBudget(relPaths, charByPath, categories, charBudget)
      relPaths = trimmed.kept
    }
  }

  const files: BundleFile[] = []
  let skipped = 0

  for (const raw of relPaths) {
    const rel = normalizeRel(raw)
    const abs = resolveWithinRoot(opts.rootPath, raw)
    if (!abs || isIgnoredRel(rel, match)) {
      skipped++
      continue
    }
    try {
      const st = await stat(abs)
      if (!st.isFile() || st.size > maxBytes) {
        skipped++
        continue
      }
      const content = await readFile(abs, 'utf8')
      if (looksBinary(content)) {
        skipped++
        continue
      }
      files.push({ rel, content })
    } catch {
      skipped++
    }
  }

  const bundle = buildBundleText(opts.headerLabel, files)
  const scan = scanText(bundle)
  return {
    findings: scan.findings,
    redactedText: scan.redactedText,
    fileCount: files.length,
    skipped
  }
}

/**
 * Lists files and folders one level under `relDir` (rooted at the project), skipping ignored
 * paths. Used by the file-tree picker; depth is driven by the UI expanding folders on demand.
 */
export async function listTree(rootPath: string, relDir: string, ignorePatterns: string[] = []): Promise<PackNode[]> {
  const match = compileIgnoreMatchers(ignorePatterns)
  const cleanRel = normalizeRel(relDir).replace(/^\/+|\/+$/g, '')
  const cwd = cleanRel ? resolveWithinRoot(rootPath, cleanRel) : rootPath
  if (!cwd) return []

  const entries = await fg('*', {
    cwd,
    dot: true,
    onlyFiles: false,
    markDirectories: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    deep: 1,
    ignore: getIgnoreGlobList(ignorePatterns)
  })

  const nodes: PackNode[] = []
  for (const entry of entries) {
    const isDir = entry.endsWith('/')
    const name = (isDir ? entry.slice(0, -1) : entry).replace(/\\/g, '/')
    const rel = cleanRel ? `${cleanRel}/${name}` : name
    if (isIgnoredRel(rel, match)) continue
    nodes.push({ path: rel, name, isDir })
  }
  nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return nodes
}

export function relativeWithin(rootPath: string, absPath: string): string | null {
  const rel = relative(rootPath, absPath)
  if (!rel || rel.startsWith('..')) return null
  return normalizeRel(rel)
}

export interface PathEstimate {
  charCount: number
  fileCount: number
  skipped: number
}

/**
 * Estimates total characters for the given relative paths without building the full bundle.
 * Respects the same ignore rules and size limits as {@link packContext}.
 */
export async function estimatePaths(
  rootPath: string,
  relPaths: string[],
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  ignorePatterns: string[] = []
): Promise<PathEstimate> {
  const match = compileIgnoreMatchers(ignorePatterns)
  let charCount = 0
  let fileCount = 0
  let skipped = 0

  for (const raw of relPaths) {
    const rel = normalizeRel(raw)
    const abs = resolveWithinRoot(rootPath, raw)
    if (!abs || isIgnoredRel(rel, match)) {
      skipped++
      continue
    }
    try {
      const st = await stat(abs)
      if (!st.isFile() || st.size > maxFileBytes) {
        skipped++
        continue
      }
      const content = await readFile(abs, 'utf8')
      if (looksBinary(content)) {
        skipped++
        continue
      }
      charCount += content.length
      fileCount++
    } catch {
      skipped++
    }
  }

  return { charCount, fileCount, skipped }
}

export const PRESET_GLOBS: Record<'tests' | 'config' | 'entry', string[]> = {
  tests: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
  config: [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'tsconfig*.json',
    '**/vite.config.*',
    '**/electron.vite.config.*',
    '**/.vibebar-audit.json'
  ],
  entry: [
    '**/src/main/index.*',
    '**/src/main/main.*',
    '**/src/index.*',
    '**/src/app.*',
    '**/app.tsx',
    '**/App.tsx'
  ]
}

/** Resolves file paths matching a context-packer preset glob set. */
export async function resolvePresetPaths(
  rootPath: string,
  preset: 'tests' | 'config' | 'entry',
  ignorePatterns: string[] = []
): Promise<string[]> {
  const globs = PRESET_GLOBS[preset]
  const match = compileIgnoreMatchers(ignorePatterns)
  try {
    const paths = await fg(globs, {
      cwd: rootPath,
      onlyFiles: true,
      dot: preset === 'config',
      followSymbolicLinks: false,
      suppressErrors: true
    })
    return paths
      .map((p) => normalizeRel(p))
      .filter((rel) => !isIgnoredRel(rel, match))
      .sort()
  } catch {
    return []
  }
}
