import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { dialog, shell } from 'electron'
import {
  AI_CONTEXT_DIR,
  detectProject,
  findContextFolder,
  type ProjectProfile
} from '@vibebar/project-detector'
import type { ProjectAiDocs, ProjectMemoryDiff, ProjectStackOverrides, RecentProject } from '@shared/types.js'
import type { AppStore } from '../settings/store.js'
import { computeProjectMemoryDiff } from './projectMemoryDiff.js'

/** Seeded into a freshly created AI context folder so it is self-explanatory and git-trackable. */
const AI_CONTEXT_README = [
  '# AI Context',
  '',
  'Drop project context here for AI coding assistants: architecture notes, conventions,',
  'domain glossaries, API contracts, decision records, and anything you want the AI to read',
  'before making changes.',
  '',
  'Keep it current. Do not put secrets or credentials in this folder.',
  ''
].join('\n')

/**
 * Owns the single active project. Selection opens a native folder picker; detection is
 * read-only and the resulting profile is cached in memory until the path changes.
 */
export class ProjectService {
  private readonly store: AppStore
  private profile: ProjectProfile | null = null
  private cachedPath: string | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  async init(): Promise<void> {
    const path = this.store.getActiveProjectPath()
    if (!path || !existsSync(path)) return
    this.profile = await this.detectAtPath(path)
  }

  getProfile(): ProjectProfile | null {
    return this.applyOverrides(this.profile)
  }

  /** Raw detected profile without manual overrides. */
  getRawProfile(): ProjectProfile | null {
    return this.profile
  }

  private applyOverrides(profile: ProjectProfile | null): ProjectProfile | null {
    if (!profile) return null
    const overrides = this.store.getStackOverrides(profile.rootPath)
    const next = { ...profile }
    if (overrides.language && overrides.language !== 'unknown') {
      next.language = overrides.language
    }
    if (overrides.framework && overrides.framework !== 'unknown') {
      next.framework = overrides.framework
    }
    if (overrides.testRunner && overrides.testRunner !== 'unknown') {
      next.testRunner = overrides.testRunner
    }
    const tags = new Set(next.stacks.filter((s) => s !== 'any'))
    if (next.language !== 'unknown') tags.add(next.language)
    if (next.framework !== 'unknown') tags.add(next.framework)
    if (next.testRunner !== 'unknown') tags.add(next.testRunner)
    next.stacks = tags.size > 0 ? [...tags] : ['any']
    return next
  }

  getStackOverrides(): ProjectStackOverrides {
    const root = this.profile?.rootPath
    if (!root) return {}
    return this.store.getStackOverrides(root)
  }

  saveStackOverrides(overrides: ProjectStackOverrides): ProjectStackOverrides {
    const root = this.profile?.rootPath
    if (!root) return {}
    const saved = this.store.setStackOverrides(root, overrides)
    return saved
  }

  clearStackOverrides(): void {
    const root = this.profile?.rootPath
    if (!root) return
    this.store.clearStackOverrides(root)
  }

  async getMemoryDiff(): Promise<ProjectMemoryDiff> {
    const profile = this.getProfile()
    if (!profile) {
      return {
        noProject: true,
        warnings: [],
        agentsMdExists: false,
        agentsMdAgeDays: null,
        cursorRulesCount: 0,
        contextReadmeExists: false,
        codesyncConfigured: false
      }
    }

    const docs = await this.getAiDocs()
    const snapshot = this.store.getProjectMemorySnapshot(profile.rootPath)
    const diff = await computeProjectMemoryDiff({
      profile,
      agentsMd: docs.agentsMd,
      cursorRulesCount: docs.cursorRules.length,
      contextReadme: docs.contextReadme,
      lastKnownCursorRulesCount: snapshot?.cursorRulesCount ?? null,
      codesyncInstances: this.store.getCodeSyncConfig().instances
    })

    this.store.setProjectMemorySnapshot(profile.rootPath, docs.cursorRules.length)
    return diff
  }

  stacks(): string[] {
    return this.getProfile()?.stacks ?? ['any']
  }

  listRecents(): RecentProject[] {
    return this.store.getRecentProjectsValid((p) => existsSync(p))
  }

  async select(): Promise<ProjectProfile | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select a project folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return this.profile
    return this.openPath(result.filePaths[0])
  }

  /** Opens a known folder path (recent or programmatic). Returns null if missing. */
  async openPath(path: string): Promise<ProjectProfile | null> {
    if (!existsSync(path)) return this.profile
    const profile = await this.detectAtPath(path)
    if (!profile) return this.profile
    this.store.setActiveProjectPath(path)
    this.store.pushRecentProject(path, profile.folderName || basename(path))
    return profile
  }

  private async detectAtPath(path: string): Promise<ProjectProfile | null> {
    if (this.cachedPath === path && this.profile) return this.profile
    const profile = await detectProject(path).catch(() => null)
    this.profile = profile
    this.cachedPath = path
    return profile
  }

  /**
   * Creates an AI context folder at the active project root (idempotent — no-op if one already
   * exists) and seeds a short README so the folder persists in git and explains its purpose.
   * Returns the re-detected profile so `hasContextFolder` reflects reality.
   */
  async addContextFolder(): Promise<ProjectProfile | null> {
    const root = this.profile?.rootPath
    if (!root) return this.profile
    const dir = join(root, AI_CONTEXT_DIR)
    await mkdir(dir, { recursive: true })
    const readme = join(dir, 'README.md')
    if (!existsSync(readme)) await writeFile(readme, AI_CONTEXT_README, 'utf8')
    this.profile = await this.detectAtPath(root)
    return this.profile
  }

  /**
   * Reveals the project's AI context folder in the OS file explorer. Resolves the actual
   * folder (honoring recognized name variants); if none exists yet it is created first so the
   * action always lands the user inside a real context folder.
   */
  async openContextFolder(): Promise<{ ok: boolean; error?: string }> {
    const root = this.profile?.rootPath
    if (!root) return { ok: false, error: 'No project selected.' }
    let dir = await findContextFolder(root)
    if (!dir) {
      await this.addContextFolder()
      dir = await findContextFolder(root)
    }
    if (!dir) return { ok: false, error: 'Could not locate the AI context folder.' }
    // openPath returns an empty string on success, or an error message on failure.
    const error = await shell.openPath(dir)
    return error ? { ok: false, error } : { ok: true }
  }

  /**
   * Reads project AI documentation (AGENTS.md, Cursor rules, AI context README) for sync and
   * handoff injection. Content is read-only; never writes unless explicitly requested.
   */
  async getAiDocs(): Promise<ProjectAiDocs> {
    const root = this.profile?.rootPath
    if (!root) {
      return { noProject: true, agentsMd: null, cursorRules: [], contextReadme: null }
    }

    let agentsMd: string | null = null
    const agentsPath = join(root, 'AGENTS.md')
    if (existsSync(agentsPath)) {
      try {
        agentsMd = await readFile(agentsPath, 'utf8')
      } catch {
        agentsMd = null
      }
    }

    const cursorRules: { name: string; content: string }[] = []
    const rulesDir = join(root, '.cursor', 'rules')
    if (existsSync(rulesDir)) {
      const { readdir } = await import('node:fs/promises')
      try {
        const names = await readdir(rulesDir)
        for (const name of names.filter((n) => n.endsWith('.mdc') || n.endsWith('.md'))) {
          try {
            const content = await readFile(join(rulesDir, name), 'utf8')
            cursorRules.push({ name, content: content.slice(0, 4000) })
          } catch {
            /* skip unreadable rule file */
          }
        }
      } catch {
        /* rules dir unreadable */
      }
    }

    let contextReadme: string | null = null
    const ctxDir = await findContextFolder(root)
    if (ctxDir) {
      const readmePath = join(ctxDir, 'README.md')
      if (existsSync(readmePath)) {
        try {
          contextReadme = await readFile(readmePath, 'utf8')
        } catch {
          contextReadme = null
        }
      }
    }

    return { agentsMd, cursorRules, contextReadme }
  }

  /** Appends a session summary block to AGENTS.md (creates the file if missing). */
  async appendAgentsMd(markdown: string): Promise<{ ok: boolean; error?: string }> {
    const root = this.profile?.rootPath
    if (!root) return { ok: false, error: 'No project selected.' }
    const path = join(root, 'AGENTS.md')
    const block = `\n\n${markdown.trim()}\n`
    try {
      if (existsSync(path)) {
        const existing = await readFile(path, 'utf8')
        await writeFile(path, existing.trimEnd() + block, 'utf8')
      } else {
        await writeFile(path, `# AGENTS\n${block}`, 'utf8')
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not write AGENTS.md.' }
    }
  }
}
