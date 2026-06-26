import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentCompanionChat } from '@shared/agentCompanionChats.js'
import { AppStore } from '../settings/store.js'
import { AgentCompanionPersistence } from './agentCompanionPersistence.js'

describe('AgentCompanionPersistence', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('writes project chats to a custom folder', () => {
    const root = join(tmpdir(), `vibebar-acp-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    tempRoots.push(root)

    const store = new AppStore()
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
    const saved = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(saved.activeChatId).toBe('chat-1')
    expect(saved.chats[0].messages[0].text).toBe('Hello')

    const loaded = persistence.load('/projects/demo')
    expect(loaded.activeChatId).toBe('chat-1')
    expect(loaded.chats[0].id).toBe('chat-1')
  })
})
