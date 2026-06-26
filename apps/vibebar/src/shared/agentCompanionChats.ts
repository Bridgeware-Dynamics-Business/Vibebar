import type { AgentCompanionMessage, AgentCompanionMode } from './agentCompanionApi.js'

export const MAX_AGENT_COMPANION_CHATS = 40
export const AGENT_COMPANION_CHAT_TITLE_MAX = 48

export interface AgentCompanionChat {
  id: string
  title: string
  projectPath: string | null
  mode: AgentCompanionMode
  modelId: string
  createdAt: number
  updatedAt: number
  messages: AgentCompanionMessage[]
  acpSessionId: string | null
}

export interface AgentCompanionChatSummary {
  id: string
  title: string
  updatedAt: number
  preview: string
}

export function deriveChatTitle(messages: AgentCompanionMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user' && message.text.trim())
  if (!firstUser) return 'New chat'
  const text = firstUser.text.trim().replace(/\s+/g, ' ')
  if (text.length <= AGENT_COMPANION_CHAT_TITLE_MAX) return text
  return `${text.slice(0, AGENT_COMPANION_CHAT_TITLE_MAX - 1)}…`
}

export function chatToSummary(chat: AgentCompanionChat): AgentCompanionChatSummary {
  const last = [...chat.messages].reverse().find((message) => message.text.trim())
  const preview = last?.text.trim().replace(/\s+/g, ' ').slice(0, 80) ?? ''
  return {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    preview
  }
}

export function createAgentCompanionChat(input: {
  id: string
  projectPath: string | null
  mode: AgentCompanionMode
  modelId: string
}): AgentCompanionChat {
  const now = Date.now()
  return {
    id: input.id,
    title: 'New chat',
    projectPath: input.projectPath,
    mode: input.mode,
    modelId: input.modelId,
    createdAt: now,
    updatedAt: now,
    messages: [],
    acpSessionId: null
  }
}

export function pruneAgentCompanionChats(chats: AgentCompanionChat[]): AgentCompanionChat[] {
  if (chats.length <= MAX_AGENT_COMPANION_CHATS) return chats
  return [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_AGENT_COMPANION_CHATS)
}

export function formatChatTimestamp(updatedAt: number): string {
  const diffMs = Date.now() - updatedAt
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
