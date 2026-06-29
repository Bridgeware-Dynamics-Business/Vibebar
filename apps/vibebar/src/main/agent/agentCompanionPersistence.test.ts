import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentCompanionChat } from '@shared/agentCompanionChats.js'
import { AppStore } from '../settings/store.js'
import {
  AgentCompanionPersistence,
  defaultProjectHistoryRoot,
  ensureVibebarGitignored
} from './agentCompanionPersistence.js'

describe('AgentCompanionPersistence', () => {
  const tempRoots: string[] = []

  function freshStore(): AppStore {
    const store = new AppStore()
    store.clearAgentCompanionHistoryDir()
    store.clearAgentCompanionProjects()
    return store
  }

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('writes project chats to a custom folder', async () => {
    const root = join(tmpdir(), `vibebar-acp-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    tempRoots.push(root)

    const store = freshStore()
    store.setAgentCompanionHistoryDir(root)
    const persistence = new AgentCompanionPersistence(store)

    const chat = createAgentCompanionChat({
      id: 'chat-1',
      projectPath: '/projects/demo',
      mode: 'agent',
      modelId: 'composer-2.5-fast'
    })
    chat.messages.push({ id: 'm1', role: 'user', text: 'Hello' })

    persistence.save('/projects/demo', { activeChatId: 'chat-1', chats: [chat] })

    const filePath = join(root, 'agent-companion', 'projects', '_projects_demo.json')
    await vi.waitFor(() => {
      expect(existsSync(filePath)).toBe(true)
    })
    const saved = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(saved.activeChatId).toBe('chat-1')
    expect(saved.chats[0].messages[0].text).toBe('Hello')

    const loaded = persistence.load('/projects/demo')
    expect(loaded.activeChatId).toBe('chat-1')
    expect(loaded.chats[0].id).toBe('chat-1')
  })

  it('persists chats under project .vibebar and migrates from electron-store', async () => {
    const projectRoot = join(tmpdir(), `vibebar-acp-proj-${Date.now()}`)
    mkdirSync(projectRoot, { recursive: true })
    tempRoots.push(projectRoot)

    const store = freshStore()
    const chat = createAgentCompanionChat({
      id: 'chat-2',
      projectPath: projectRoot,
      mode: 'agent',
      modelId: 'composer-2.5-fast'
    })
    chat.messages.push({ id: 'm1', role: 'user', text: 'Persist me' })
    store.setAgentCompanionProjectState(projectRoot, { activeChatId: 'chat-2', chats: [chat] })

    const persistence = new AgentCompanionPersistence(store)
    const loaded = persistence.load(projectRoot)

    expect(loaded.activeChatId).toBe('chat-2')
    expect(loaded.chats[0].messages[0].text).toBe('Persist me')

    const filePath = join(
      defaultProjectHistoryRoot(projectRoot),
      'agent-companion',
      'projects'
    )
    await vi.waitFor(() => {
      expect(readdirSync(filePath).length).toBeGreaterThan(0)
    })
  })

  it('adds .vibebar/ to the project gitignore when saving chats', async () => {
    const projectRoot = join(tmpdir(), `vibebar-acp-git-${Date.now()}`)
    mkdirSync(projectRoot, { recursive: true })
    tempRoots.push(projectRoot)

    await ensureVibebarGitignored(projectRoot)

    const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.vibebar/')

    await ensureVibebarGitignored(projectRoot)
    expect(readFileSync(join(projectRoot, '.gitignore'), 'utf8')).toBe(gitignore)
  })
})
