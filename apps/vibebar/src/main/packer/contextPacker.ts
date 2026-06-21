import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import fg from 'fast-glob'
import { compileIgnoreMatchers, getIgnoreGlobList, isIgnoredRel } from '@vibebar/codesync'
import type { PackNode, ScanResult } from '@shared/types.js'
import { scanText } from '../scanner/secretScanner.js'

const DEFAULT_MAX_FILE_BYTES = 256 * 1024

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
function resolveWithinRoot(rootPath: string, raw: string): string | null {
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
}

export interface PackContextOutput extends ScanResult {
  fileCount: number
  skipped: number
}

/**
 * Reads the selected files (read-only), bundles them into a prompt-shaped block, and runs
 * the secret scanner so the returned text is already redacted before it leaves the machine.
 */
export async function packContext(opts: PackContextOptions): Promise<PackContextOutput> {
  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const match = compileIgnoreMatchers([])
  const files: BundleFile[] = []
  let skipped = 0

  for (const raw of opts.relPaths) {
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
export async function listTree(rootPath: string, relDir: string): Promise<PackNode[]> {
  const match = compileIgnoreMatchers([])
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
    ignore: getIgnoreGlobList([])
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
