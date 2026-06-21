import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, shell } from 'electron'
import {
  AI_CONTEXT_DIR,
  detectProject,
  findContextFolder,
  type ProjectProfile
} from '@vibebar/project-detector'
import type { AppStore } from '../settings/store.js'

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
 * read-only and the resulting profile is cached in memory and its path persisted.
 */
export class ProjectService {
  private readonly store: AppStore
  private profile: ProjectProfile | null = null

  constructor(store: AppStore) {
    this.store = store
  }

  async init(): Promise<void> {
    const path = this.store.getActiveProjectPath()
    if (!path) return
    this.profile = await detectProject(path).catch(() => null)
  }

  getProfile(): ProjectProfile | null {
    return this.profile
  }

  stacks(): string[] {
    return this.profile?.stacks ?? ['any']
  }

  async select(): Promise<ProjectProfile | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select a project folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return this.profile
    const path = result.filePaths[0]
    this.profile = await detectProject(path)
    this.store.setActiveProjectPath(path)
    return this.profile
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
    this.profile = await detectProject(root)
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
}
