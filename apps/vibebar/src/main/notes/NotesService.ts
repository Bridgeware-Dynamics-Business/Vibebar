import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NoteDetail, NotesState, NoteSummary } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'

/** Folder created at the project root to hold the user's notes. */
const NOTES_DIR = 'Notes'
/** Index file (inside the Notes folder) mirroring titles/order/timestamps for the library. */
const INDEX_FILE = '.vibebar-notes.json'
/** Default title for the auto-created session log note. */
export const SESSION_LOG_TITLE = 'Session log'

interface NoteIndexEntry {
  id: string
  title: string
  file: string
  createdAt: number
  updatedAt: number
}

interface NotesIndex {
  projectName: string
  notes: NoteIndexEntry[]
}

/**
 * Owns the active project's notes. Notes live as Markdown files under `<projectRoot>/Notes`,
 * with a small JSON index mirroring titles + timestamps so the library renders without reading
 * every file. All paths are derived from generated ids (never from raw user titles), so a note
 * can never be written outside the Notes folder.
 */
export class NotesService {
  private readonly projects: ProjectService

  constructor(projects: ProjectService) {
    this.projects = projects
  }

  private root(): string | null {
    return this.projects.getProfile()?.rootPath ?? null
  }

  private notesDir(root: string): string {
    return join(root, NOTES_DIR)
  }

  private indexPath(root: string): string {
    return join(this.notesDir(root), INDEX_FILE)
  }

  private async readIndex(root: string): Promise<NotesIndex> {
    try {
      const raw = await readFile(this.indexPath(root), 'utf8')
      const parsed = JSON.parse(raw) as Partial<NotesIndex>
      return {
        projectName: typeof parsed.projectName === 'string' ? parsed.projectName : '',
        notes: Array.isArray(parsed.notes) ? parsed.notes : []
      }
    } catch {
      return { projectName: '', notes: [] }
    }
  }

  private async writeIndex(root: string, index: NotesIndex): Promise<void> {
    await mkdir(this.notesDir(root), { recursive: true })
    await writeFile(this.indexPath(root), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  }

  /** Counts `- [ ]` / `- [x]` task items so the library can show progress. */
  private countTasks(markdown: string): { total: number; done: number } {
    let total = 0
    let done = 0
    for (const line of markdown.split('\n')) {
      const m = /^\s*[-*]\s+\[( |x|X)\]\s+/.exec(line)
      if (!m) continue
      total += 1
      if (m[1] !== ' ') done += 1
    }
    return { total, done }
  }

  private async summarize(root: string, entry: NoteIndexEntry): Promise<NoteSummary> {
    let markdown = ''
    try {
      markdown = await readFile(join(this.notesDir(root), entry.file), 'utf8')
    } catch {
      markdown = ''
    }
    const { total, done } = this.countTasks(markdown)
    return { id: entry.id, title: entry.title, updatedAt: entry.updatedAt, total, done }
  }

  private emptyState(noProject: boolean): NotesState {
    return { hasFolder: false, projectName: '', gitignored: false, notes: [], noProject }
  }

  /** Whether `.gitignore` at the project root already ignores the Notes folder. */
  private async isGitignored(root: string): Promise<boolean> {
    try {
      const raw = await readFile(join(root, '.gitignore'), 'utf8')
      return raw
        .split('\n')
        .map((l) => l.trim().replace(/\/+$/, ''))
        .some((l) => l === NOTES_DIR || l === `/${NOTES_DIR}`)
    } catch {
      return false
    }
  }

  /** Appends `Notes/` to the root `.gitignore` (creating it if missing), skipping if present. */
  private async addToGitignore(root: string): Promise<void> {
    const gitignore = join(root, '.gitignore')
    if (await this.isGitignored(root)) return
    let prefix = ''
    if (existsSync(gitignore)) {
      const raw = await readFile(gitignore, 'utf8')
      prefix = raw.length && !raw.endsWith('\n') ? '\n' : ''
    }
    const block = `${prefix}\n# VibeBar notes (local only)\n${NOTES_DIR}/\n`
    await writeFile(gitignore, block, { encoding: 'utf8', flag: 'a' })
  }

  /** Current Notes state for the active project. */
  async getState(): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    if (!existsSync(this.notesDir(root))) return this.emptyState(false)
    const index = await this.readIndex(root)
    const notes = await Promise.all(index.notes.map((e) => this.summarize(root, e)))
    notes.sort((a, b) => b.updatedAt - a.updatedAt)
    return {
      hasFolder: true,
      projectName: index.projectName,
      gitignored: await this.isGitignored(root),
      notes,
      noProject: false
    }
  }

  /**
   * First-run setup: creates the Notes folder + index, names the notes project, and optionally
   * adds the folder to `.gitignore`. Idempotent — re-running only updates the name / index.
   */
  async init(projectName: string, addToGitignore: boolean): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    await mkdir(this.notesDir(root), { recursive: true })
    const index = await this.readIndex(root)
    index.projectName = projectName.trim() || this.projects.getProfile()?.folderName || 'Notes'
    await this.writeIndex(root, index)
    if (addToGitignore) await this.addToGitignore(root)
    return this.getState()
  }

  /** Creates an empty note with the given title and returns the refreshed state. */
  async create(title: string): Promise<{ id: string; state: NotesState }> {
    const root = this.root()
    if (!root) return { id: '', state: this.emptyState(true) }
    await mkdir(this.notesDir(root), { recursive: true })
    const id = randomUUID()
    const now = Date.now()
    const file = `${id}.md`
    await writeFile(join(this.notesDir(root), file), '', 'utf8')
    const index = await this.readIndex(root)
    index.notes.push({ id, title: title.trim() || 'Untitled note', file, createdAt: now, updatedAt: now })
    await this.writeIndex(root, index)
    return { id, state: await this.getState() }
  }

  /** Loads a single note's title + Markdown body. */
  async read(id: string): Promise<NoteDetail | null> {
    const root = this.root()
    if (!root) return null
    const index = await this.readIndex(root)
    const entry = index.notes.find((n) => n.id === id)
    if (!entry) return null
    let markdown = ''
    try {
      markdown = await readFile(join(this.notesDir(root), entry.file), 'utf8')
    } catch {
      markdown = ''
    }
    return { id: entry.id, title: entry.title, markdown }
  }

  /** Saves a note's title + Markdown body, bumping its updatedAt. */
  async save(id: string, title: string, markdown: string): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    const index = await this.readIndex(root)
    const entry = index.notes.find((n) => n.id === id)
    if (!entry) return this.getState()
    entry.title = title.trim() || 'Untitled note'
    entry.updatedAt = Date.now()
    await mkdir(this.notesDir(root), { recursive: true })
    await writeFile(join(this.notesDir(root), entry.file), markdown, 'utf8')
    await this.writeIndex(root, index)
    return this.getState()
  }

  /** Removes a note's file and index entry. */
  async delete(id: string): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    const index = await this.readIndex(root)
    const entry = index.notes.find((n) => n.id === id)
    if (entry) {
      await rm(join(this.notesDir(root), entry.file), { force: true })
      index.notes = index.notes.filter((n) => n.id !== id)
      await this.writeIndex(root, index)
    }
    return this.getState()
  }

  /** Renames the notes project (the library header label). */
  async setProjectName(projectName: string): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    const index = await this.readIndex(root)
    index.projectName = projectName.trim()
    await this.writeIndex(root, index)
    return this.getState()
  }

  /** Appends Markdown to an existing note (creates trailing newline when needed). */
  async appendMarkdown(id: string, markdown: string): Promise<NotesState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    const detail = await this.read(id)
    if (!detail) return this.getState()
    const block = markdown.trim()
    if (!block) return this.getState()
    const body = detail.markdown.trimEnd()
    const next = body ? `${body}\n\n${block}\n` : `${block}\n`
    return this.save(id, detail.title, next)
  }

  /** Finds the session log note or creates it with the standard template. */
  async findOrCreateSessionLog(): Promise<{ id: string; state: NotesState }> {
    const root = this.root()
    if (!root) return { id: '', state: this.emptyState(true) }

    const state = await this.getState()
    if (!state.hasFolder) {
      const folderName = this.projects.getProfile()?.folderName ?? 'Notes'
      await this.init(folderName, true)
    }

    const refreshed = await this.getState()
    const existing = refreshed.notes.find((n) => n.title === SESSION_LOG_TITLE)
    if (existing) return { id: existing.id, state: refreshed }

    const created = await this.create(SESSION_LOG_TITLE)
    const template = [
      '# Session log',
      '',
      'Running log of findings, prompts, and handoffs from this VibeBar session.',
      ''
    ].join('\n')
    const stateAfter = await this.save(created.id, SESSION_LOG_TITLE, template)
    return { id: created.id, state: stateAfter }
  }
}
