import { describe, expect, it } from 'vitest'
import {
  createAgentCompanionChat,
  deriveChatTitle,
  MAX_AGENT_COMPANION_CHATS,
  pruneAgentCompanionChats
} from './agentCompanionChats.js'

describe('deriveChatTitle', () => {
  it('uses the first user message as the title', () => {
    expect(
      deriveChatTitle([
        { id: '1', role: 'user', text: 'Fix the login bug in auth.ts' },
        { id: '2', role: 'assistant', text: 'Sure' }
      ])
    ).toBe('Fix the login bug in auth.ts')
  })

  it('falls back to New chat when empty', () => {
    expect(deriveChatTitle([])).toBe('New chat')
  })
})

describe('pruneAgentCompanionChats', () => {
  it('keeps the most recently updated chats', () => {
    const chats = Array.from({ length: MAX_AGENT_COMPANION_CHATS + 5 }, (_, index) =>
      createAgentCompanionChat({
        id: `chat-${index}`,
        projectPath: '/p',
        mode: 'agent',
        modelId: 'composer-2.5-fast'
      })
    )
    chats.forEach((chat, index) => {
      chat.updatedAt = index
    })
    const pruned = pruneAgentCompanionChats(chats)
    expect(pruned).toHaveLength(MAX_AGENT_COMPANION_CHATS)
    expect(pruned.some((chat) => chat.id === 'chat-0')).toBe(false)
    expect(pruned.some((chat) => chat.id === `chat-${MAX_AGENT_COMPANION_CHATS + 4}`)).toBe(true)
  })
})
