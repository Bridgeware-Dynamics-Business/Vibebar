/**
 * Project- and file-classification helpers. These decide *where* a rule should even look —
 * e.g. a secret only "ships to the client" if the file is browser-reachable, and BOLA only
 * matters if the project actually exposes an HTTP surface. Getting this right is the single
 * biggest lever on false-positive rate, so it lives in one audited place.
 */

export interface ScanFile {
  /** Path relative to the project root, using forward slashes. */
  path: string
  content: string
}

export interface AuditContext {
  label: string
  framework: string
  language: string
  testRunner: string
}

export interface AuditRuleInput {
  ctx: AuditContext
  files: ScanFile[]
  packageJson: Record<string, unknown> | null
  hasLockfile: boolean
  /** Contents of the project's .gitignore, or null when none is committed. */
  gitignore?: string | null
}

export function isElectron(ctx: AuditContext): boolean {
  return /electron/i.test(ctx.framework)
}

/** True when the project targets a browser/web rendering framework (so `src/**` ships to a browser). */
export function isWebFramework(ctx: AuditContext): boolean {
  return /next|nuxt|remix|gatsby|vite|react|vue|svelte|sveltekit|astro|solid|angular|preact|qwik|web/i.test(
    ctx.framework
  )
}

export function isServerish(path: string): boolean {
  return /(^|\/)(api|server|routes?|backend|functions?|pages\/api|app\/api)\//.test(path)
}

/**
 * Files that ship to the browser — where a secret becomes truly public. Framework-aware:
 * - Electron: only `src/renderer/**` is browser-reachable; `src/main/**` and `src/preload/**` are not.
 * - Node/library packages with no web framework (e.g. a monorepo package src dir): not browser-shipped.
 * - Web frameworks (Next/Vite/React/Vue/Svelte/Astro…): the usual client dirs, minus server dirs.
 */
export function isClientFile(path: string, ctx: AuditContext): boolean {
  if (isServerish(path)) return false
  if (isElectron(ctx)) {
    return /(^|\/)src\/renderer\//.test(path) && /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue)$/.test(path)
  }
  if (!isWebFramework(ctx)) {
    // No browser-rendering framework detected: treat nothing as client-shipped (Node libs, CLIs).
    return false
  }
  if (/\.(tsx|jsx)$/.test(path)) return true
  if (/(^|\/)(src|app|components|pages|public|client)\//.test(path)) {
    return /\.(ts|js|mjs|cjs|svelte|vue)$/.test(path)
  }
  return false
}

const SERVER_FRAMEWORK_DEP =
  /^(express|fastify|koa|@koa\/|@hapi\/|hapi|next|nuxt|@nestjs\/|nest|remix|@remix-run\/|hono|@sveltejs\/kit|flask|fastapi|django|djangorestframework|starlette|sanic|tornado|aiohttp|bottle|connect|restify)/i

const SERVER_FRAMEWORK_CTX = /next|nuxt|remix|express|fastify|koa|nest|hapi|hono|sveltekit|astro|flask|fastapi|django/i

export function depMap(packageJson: Record<string, unknown> | null): Record<string, unknown> {
  if (!packageJson) return {}
  return {
    ...((packageJson.dependencies as Record<string, unknown>) ?? {}),
    ...((packageJson.devDependencies as Record<string, unknown>) ?? {})
  }
}

/** True when the project actually exposes a server/HTTP surface worth auditing for BOLA/validation. */
export function hasServerSurface(input: { packageJson: Record<string, unknown> | null; files: ScanFile[]; ctx: AuditContext }): boolean {
  const deps = depMap(input.packageJson)
  if (Object.keys(deps).some((d) => SERVER_FRAMEWORK_DEP.test(d))) return true
  if (input.files.some((f) => isServerish(f.path))) return true
  if (SERVER_FRAMEWORK_CTX.test(input.ctx.framework)) return true
  return false
}

/** True when a given package name is an actual declared dependency (not just fixture text). */
export function hasDep(packageJson: Record<string, unknown> | null, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(depMap(packageJson), name)
}

/** Tests/fixtures/examples are expected to contain "scary" strings — don't flag them as findings. */
export function isTestOrExampleFile(path: string): boolean {
  return /(\.(test|spec)\.|(^|\/)(tests?|__tests__|__mocks__|fixtures?|examples?|mocks?)\/|\.example$|\.sample$)/i.test(
    path
  )
}

/**
 * VibeBar-style audit engine sources. Scanning detector code creates self-referential false
 * positives (regex literals, cache hashes). Project-level rules and npm audit still run.
 */
export function isAuditEngineFile(path: string): boolean {
  return /(?:^|\/)src\/(?:main\/)?audit\//.test(path)
}

/** Electron main-process sources where privileged IPC handlers live. */
export function isMainProcessFile(path: string): boolean {
  return /(?:^|\/)src\/main\//.test(path) || /(?:^|\/)electron\/main\//.test(path) || /(?:^|\/)main\//.test(path)
}

/** Preload bridge scripts — narrow IPC surface exposed to renderers. */
export function isPreloadFile(path: string): boolean {
  return /(?:^|\/)src\/preload\//.test(path) || /(?:^|\/)preload\//.test(path)
}

/** Whether a file is Python (drives the lexer's comment style and the Python rule variants). */
export function isPython(path: string): boolean {
  return /\.py$/.test(path)
}

/** Whether a file is JS/TS-family (the languages the AST + taint layer can parse). */
export function isJsLike(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)
}
