import picomatch from 'picomatch'

/** Default globs — skipped for copy and delete so deps, caches, and VCS are not mirrored. */
export const DEFAULT_IGNORES: string[] = [
  '**/.git/**',
  '**/node_modules/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.pytest_cache/**',
  '**/.mypy_cache/**',
  '**/.ruff_cache/**',
  '**/.tox/**',
  '**/.nox/**',
  '**/target/**',
  '**/.cargo/registry/**',
  '**/.cargo/git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.eslintcache',
  '**/*.tsbuildinfo',
  '**/.DS_Store',
  '**/Thumbs.db'
]

export function parseUserIgnoreLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Same list for fast-glob `ignore` and picomatch. */
export function getIgnoreGlobList(extraPatterns: string[]): string[] {
  return [...DEFAULT_IGNORES, ...extraPatterns.map((p) => normalizeRel(p))]
}

export function compileIgnoreMatchers(extraPatterns: string[]): picomatch.Matcher {
  const patterns = getIgnoreGlobList(extraPatterns)
  return picomatch(patterns, { dot: true })
}

export function isIgnoredRel(rel: string, match: picomatch.Matcher): boolean {
  const n = normalizeRel(rel)
  if (!n || n === '.') return false
  return match(n)
}

export function isIgnoredAbs(
  sourceRoot: string,
  absPath: string,
  match: picomatch.Matcher
): boolean {
  const rel = normalizeRel(absPath.slice(sourceRoot.length).replace(/^[/\\]/, ''))
  return isIgnoredRel(rel, match)
}
