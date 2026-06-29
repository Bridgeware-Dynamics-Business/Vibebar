import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentCompanionChat } from '@shared/agentCompanionChats.js'
import { pruneAgentCompanionChats } from '@shared/agentCompanionChats.js'
import type { AppStore } from '../settings/store.js'

export const AGENT_COMPANION_HISTORY_SUBDIR = 'agent-companion'
export const VIBEBAR_LOCAL_DIR = '.vibebar'

export interface AgentCompanionProjectState {
  activeChatId: string | null
  chats: AgentCompanionChat[]
}

interface AgentCompanionProjectFile extends AgentCompanionProjectState {
  projectPath: string | null
}

function projectKey(projectPath: string): string {
  if (!projectPath) return '_no-project'
  const safe = projectPath.replace(/[^a-zA-Z0-9_-]/g, '_')
  return safe.length > 0 ? safe.slice(0, 120) : '_project'
}

function projectFilePath(historyDir: string, projectPath: string): string {
  return join(historyDir, AGENT_COMPANION_HISTORY_SUBDIR, 'projects', `${projectKey(projectPath)}.json`)
}

/** Default on-disk root for project-scoped Agent Companion history (inside `.vibebar/`). */
export function defaultProjectHistoryRoot(projectPath: string): string {
  return join(projectPath, VIBEBAR_LOCAL_DIR)
}

/** Ensures `.vibebar/` is listed in the project `.gitignore` (best-effort, idempotent). */
export async function ensureVibebarGitignored(projectRoot: string): Promise<void> {
  const gitignore = join(projectRoot, '.gitignore')
  try {
    const raw = existsSync(gitignore) ? await readFile(gitignore, 'utf8') : ''
    const normalized = raw
      .split('\n')
      .map((line) => line.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    if (normalized.some((line) => line === '.vibebar' || line === VIBEBAR_LOCAL_DIR)) return
    const prefix = raw.length && !raw.endsWith('\n') ? '\n' : ''
    const block = `${prefix}\n# VibeBar local state (session timeline, agent chats)\n${VIBEBAR_LOCAL_DIR}/\n`
    await writeFile(gitignore, block, { encoding: 'utf8', flag: existsSync(gitignore) ? 'a' : 'w' })
  } catch {
    /* ignore — gitignore is best-effort */
  }
}

/**
 * Persists Agent Companion chat threads in the project's `.vibebar/agent-companion/` folder by
 * default (git-ignored), with optional user-chosen folder or electron-store fallback when no project.
 */
export class AgentCompanionPersistence {
  constructor(private readonly store: AppStore) {}

  getCustomHistoryDir(): string | null {
    const dir = this.store.getAgentCompanionHistoryDir()
    return dir || null
  }

  /** Full path shown in the UI — custom folder, project `.vibebar/agent-companion`, or app config. */
  getDisplayPath(projectPath?: string | null): string {
    const custom = this.store.getAgentCompanionHistoryDir()
    if (custom) return join(custom, AGENT_COMPANION_HISTORY_SUBDIR)
    if (projectPath) {
      return join(defaultProjectHistoryRoot(projectPath), AGENT_COMPANION_HISTORY_SUBDIR)
    }
    return this.store.getStoreFilePath()
  }

  isUsingCustomDir(): boolean {
    return Boolean(this.store.getAgentCompanionHistoryDir())
  }

  load(projectPath: string): AgentCompanionProjectState {
    const custom = this.store.getAgentCompanionHistoryDir()
    if (custom) {
      return this.loadFromDir(custom, projectPath)
    }
    if (projectPath) {
      const fromProjectDir = this.loadFromDir(defaultProjectHistoryRoot(projectPath), projectPath)
      if (fromProjectDir.chats.length > 0 || fromProjectDir.activeChatId) {
        return fromProjectDir
      }
      const fromStore = this.store.getAgentCompanionProjectState(projectPath)
      if (fromStore.chats.length > 0 || fromStore.activeChatId) {
        void this.persistProjectDir(projectPath, fromStore)
        return fromStore
      }
      return fromProjectDir
    }
    return this.store.getAgentCompanionProjectState('')
  }

  save(projectPath: string, state: AgentCompanionProjectState): void {
    const pruned: AgentCompanionProjectState = {
      activeChatId: state.activeChatId,
      chats: pruneAgentCompanionChats(
        state.chats.map((chat) => ({
          ...chat,
          messages: chat.messages.map((message) => ({ ...message }))
        }))
      )
    }
    const custom = this.store.getAgentCompanionHistoryDir()
    if (custom) {
      void this.saveToDir(custom, projectPath, pruned)
      return
    }
    if (projectPath) {
      void this.persistProjectDir(projectPath, pruned)
      return
    }
    this.store.setAgentCompanionProjectState(projectPath, pruned)
  }

  /** Copies all in-app store threads into a folder and switches persistence to that folder. */
  async migrateStoreToDir(dir: string): Promise<void> {
    const all = this.store.getAllAgentCompanionProjects()
    await mkdir(join(dir, AGENT_COMPANION_HISTORY_SUBDIR, 'projects'), { recursive: true })
    for (const [key, state] of Object.entries(all)) {
      await this.saveToDir(dir, key, state)
    }
    this.store.clearAgentCompanionProjects()
    this.store.setAgentCompanionHistoryDir(dir)
  }

  private async persistProjectDir(
    projectPath: string,
    state: AgentCompanionProjectState
  ): Promise<void> {
    await this.saveToDir(defaultProjectHistoryRoot(projectPath), projectPath, state)
    await ensureVibebarGitignored(projectPath)
    this.store.setAgentCompanionProjectState(projectPath, { activeChatId: null, chats: [] })
  }

  private loadFromDir(historyDir: string, projectPath: string): AgentCompanionProjectState {
    const filePath = projectFilePath(historyDir, projectPath)
    if (!existsSync(filePath)) {
      return { activeChatId: null, chats: [] }
    }
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as AgentCompanionProjectFile
      const chats = Array.isArray(raw.chats) ? raw.chats : []
      return {
        activeChatId: raw.activeChatId ?? null,
        chats: chats.map((chat) => ({
          ...chat,
          messages: Array.isArray(chat.messages)
            ? chat.messages.map((message) => ({ ...message }))
            : []
        }))
      }
    } catch {
      return { activeChatId: null, chats: [] }
    }
  }

  private async saveToDir(
    historyDir: string,
    projectPath: string,
    state: AgentCompanionProjectState
  ): Promise<void> {
    const dir = join(historyDir, AGENT_COMPANION_HISTORY_SUBDIR, 'projects')
    await mkdir(dir, { recursive: true })
    const payload: AgentCompanionProjectFile = {
      projectPath: projectPath || null,
      activeChatId: state.activeChatId,
      chats: state.chats
    }
    await writeFile(projectFilePath(historyDir, projectPath), JSON.stringify(payload, null, 2), 'utf8')
  }
}
