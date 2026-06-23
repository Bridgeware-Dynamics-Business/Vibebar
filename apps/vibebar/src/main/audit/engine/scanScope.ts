/**
 * Scan scope: which files enter the auditor and which are excluded before rules run.
 * Centralizing this keeps false positives low across any project layout (monorepos,
 * Electron, Next, stray debug bundles, etc.).
 */

/** fast-glob ignore patterns — build output, deps, caches, and scratch dirs. */
export const DEFAULT_GLOB_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/release/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.vite/**',
  '**/.cache/**',
  '**/.parcel-cache/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/debug-out/**',
  '**/debug-out-*/**',
  '**/temp-out/**',
  '**/*.min.js',
  '**/*.bundle.js',
  '**/*.chunk.js',
  '**/*-*.js.map'
]

/** Path segments that indicate generated or vendored output, not hand-written source. */
const ARTIFACT_PATH =
  /(?:^|\/)(?:out|dist|build|coverage|release|\.next|\.turbo|\.vite|\.cache|\.nuxt|\.svelte-kit|node_modules|vendor|tmp|temp|debug-out|debug-out-[\w-]+|storybook-static|playwright-report|test-results)(?:\/|$)/i

/** Known source roots where plain `.js` files are still authored (not only compiled). */
const JS_SOURCE_ROOT =
  /(?:^|\/)(?:src|lib|app|server|api|electron|functions|packages\/[^/]+\/src|scripts|tools|bin|main|preload|renderer)(?:\/|$)/i

/** Root-level config / tooling scripts worth scanning when small. */
const ROOT_JS_CONFIG = /^(?:[\w@./-]+\.(?:js|mjs|cjs)|eslint\.config\.(?:js|mjs|cjs)|vite\.config\.(?:js|ts|mjs))$/i

const COMPILED_EXT = /\.(ts|tsx|vue|svelte|astro|py)$/

const PLAIN_JS_EXT = /\.(js|jsx|mjs|cjs)$/

/** True when the relative path lives under a build artifact or cache directory. */
export function isArtifactPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  if (ARTIFACT_PATH.test(norm)) return true
  if (/^debug-[\w.-]+\.(js|mjs|cjs|ts)$/i.test(norm)) return true
  if (/\/debug-[\w.-]+\.(js|mjs|cjs)$/i.test(norm)) return true
  return false
}

/** Heuristic: Vite/Rollup/esbuild bundle output inlined into a single file. */
export function isBundledOutputContent(content: string): boolean {
  if (content.length > 120_000) return true
  const markers = [
    /@__PURE__/,
    /__vite__/,
    /__defProp\s*=|__publicField\s*=|getDefaultExportFromCjs/,
    /\/\/ -- CommonJS Shims --/,
    /__esModule\s*&&\s*Object\.prototype\.hasOwnProperty\.call\(/
  ]
  let hits = 0
  for (const re of markers) {
    if (re.test(content)) hits++
  }
  if (hits >= 2) return true
  return content.length > 40_000 && hits >= 1
}

/** Whether a plain JS-family file path is likely hand-written source (not compiler output). */
export function isAuthoredJsPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  if (isArtifactPath(norm)) return false
  if (JS_SOURCE_ROOT.test(norm)) return true
  if (ROOT_JS_CONFIG.test(norm)) return true
  // Monorepo package entry at packages/foo/index.js (no src/) — rare but allow one level deep
  if (/^packages\/[^/]+\/[^/]+\.(js|mjs|cjs)$/.test(norm)) return true
  return false
}

/**
 * Final gate after glob: TS/Vue/Svelte/Python always pass (unless artifact path).
 * Plain JS only passes when path looks authored or content is clearly not a bundle.
 */
export function isScannableFile(path: string, content?: string): boolean {
  const norm = path.replace(/\\/g, '/')
  if (isArtifactPath(norm)) return false

  if (COMPILED_EXT.test(norm)) return true

  if (PLAIN_JS_EXT.test(norm)) {
    if (content != null && isBundledOutputContent(content)) return false
    return isAuthoredJsPath(norm)
  }

  return true
}

/** Files excluded from file-scoped rules (project rules + npm audit still run). */
export function isExcludedFromFileRules(path: string, content?: string): boolean {
  if (!isScannableFile(path, content)) return true
  return false
}
