import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentCompanionChat } from '@shared/agentCompanionChats.js'
import { pruneAgentCompanionChats } from '@shared/agentCompanionChats.js'
import type { AppStore } from '../settings/store.js'

export const AGENT_COMPANION_HISTORY_SUBDIR = 'agent-companion'

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

/**
 * Persists Agent Companion chat threads either in electron-store (default) or a user-chosen folder.
 */
export class AgentCompanionPersistence {
  constructor(private readonly store: AppStore) {}

  getCustomHistoryDir(): string | null {
    const dir = this.store.getAgentCompanionHistoryDir()
    return dir || null
  }

  /** Full path shown in the UI — custom folder or the electron-store config file. */
  getDisplayPath(): string {
    const custom = this.store.getAgentCompanionHistoryDir()
    if (custom) return custom
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
    return this.store.getAgentCompanionProjectState(projectPath)
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
