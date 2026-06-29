import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { WebContents } from 'electron'
import { dialog } from 'electron'
import { CH } from '@shared/channels.js'
import type {
  AgentCompanionAskQuestionRequest,
  AgentCompanionMode,
  AgentCompanionPermissionRequest,
  AgentCompanionState,
  AgentCompanionToolActivity
} from '@shared/agentCompanionApi.js'
import type { AgentCompanionModelOption } from '@shared/agentCompanionModels.js'
import {
  AGENT_COMPANION_FALLBACK_MODELS,
  DEFAULT_AGENT_COMPANION_MODEL_ID,
  labelForAgentModel
} from '@shared/agentCompanionModels.js'
import type { AgentCompanionChat } from '@shared/agentCompanionChats.js'
import {
  chatToSummary,
  createAgentCompanionChat,
  deriveChatTitle
} from '@shared/agentCompanionChats.js'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { ProjectService } from '../project/ProjectService.js'
import type { OverlayManager } from '../overlay/OverlayManager.js'
import type { AppStore } from '../settings/store.js'
import { AcpClient } from './AcpClient.js'
import { AgentCompanionPersistence } from './agentCompanionPersistence.js'
import { finalizeRunningToolActivity } from '@shared/agentCompanionActivity.js'
import { findAgentCli } from './findAgentCli.js'
import { listAgentModels } from './listAgentModels.js'

function emptyState(overrides: Partial<AgentCompanionState> = {}): AgentCompanionState {
  return {
    connection: 'idle',
    setupIssue: null,
    drawerOpen: false,
    sessionId: null,
    mode: 'agent',
    modelId: DEFAULT_AGENT_COMPANION_MODEL_ID,
    modelLabel: labelForAgentModel(DEFAULT_AGENT_COMPANION_MODEL_ID),
    availableModels: [...AGENT_COMPANION_FALLBACK_MODELS],
    activeChatId: null,
    chatHistory: [],
    projectName: null,
    projectPath: null,
    agentPath: null,
    messages: [],
    tools: [],
    pendingPermission: null,
    pendingQuestion: null,
    error: null,
    chatHistoryPath: null,
    chatHistoryUsesCustomDir: false,
    stagedPrompt: null,
    ...overrides
  }
}

/**
 * Owns the Agent Companion ACP session. Lazy-spawns `agent acp` on first connect or send;
 * pushes state to every overlay window. Inline panel open/close is owned by the renderer via overlay.setPanel.
 */
export class AcpAgentController {
  private client: AcpClient | null = null
  private sessionId: string | null = null
  private mode: AgentCompanionMode = 'agent'
  private modelId: string
  private availableModels: AgentCompanionModelOption[] = [...AGENT_COMPANION_FALLBACK_MODELS]
  private drawerOpen = false
  private streaming = false
  private assistantBuffer = ''
  private assistantMessageId: string | null = null
  private readonly tools: AgentCompanionToolActivity[] = []
  private readonly messages: AgentCompanionState['messages'] = []
  private chats: AgentCompanionChat[] = []
  private activeChatId: string | null = null
  private pendingPermission: AgentCompanionPermissionRequest | null = null
  private pendingQuestion: AgentCompanionAskQuestionRequest | null = null
  private connection: AgentCompanionState['connection'] = 'idle'
  private setupIssue: AgentCompanionState['setupIssue'] = null
  private error: string | null = null
  private customAgentPath: string | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pushPending = false
  private stagedPrompt: string | null = null
  /** Bumped on cancel/disconnect so in-flight connect() exits without overwriting state. */
  private connectGeneration = 0
  private readonly chatPersistence: AgentCompanionPersistence

  constructor(
    private readonly projects: ProjectService,
    private readonly overlay: OverlayManager,
    private readonly store: AppStore
  ) {
    this.chatPersistence = new AgentCompanionPersistence(store)
    this.modelId = store.getAgentCompanionModel()
  }

  getState(): AgentCompanionState {
    const profile = this.projects.getProfile()
    return this.buildState(profile)
  }

  listModels(): AgentCompanionModelOption[] {
    this.refreshAvailableModels()
    this.pushState()
    return this.availableModels.map((m) => ({ ...m }))
  }

  newChat(): AgentCompanionState {
    if (this.streaming) return this.getState()
    this.persistActiveChat()
    this.resetAgentConnection()
    this.activeChatId = randomUUID()
    const chat = createAgentCompanionChat({
      id: this.activeChatId,
      projectPath: this.projectPath(),
      mode: this.mode,
      modelId: this.modelId
    })
    this.chats.unshift(chat)
    this.loadChatIntoMemory(chat)
    this.saveProjectChats()
    this.pushState(true)
    return this.getState()
  }

  selectChat(chatId: string): AgentCompanionState {
    if (this.streaming) return this.getState()
    if (chatId === this.activeChatId) return this.getState()
    this.persistActiveChat()
    const chat = this.chats.find((entry) => entry.id === chatId)
    if (!chat) return this.getState()
    this.resetAgentConnection()
    this.activeChatId = chat.id
    this.loadChatIntoMemory(chat)
    this.saveProjectChats()
    this.pushState(true)
    return this.getState()
  }

  deleteChat(chatId: string): AgentCompanionState {
    if (this.streaming) return this.getState()
    const index = this.chats.findIndex((entry) => entry.id === chatId)
    if (index < 0) return this.getState()

    if (this.activeChatId === chatId) {
      this.persistActiveChat()
      this.resetAgentConnection()
    }

    this.chats.splice(index, 1)

    if (this.activeChatId === chatId) {
      const next = this.chats[0]
      if (next) {
        this.activeChatId = next.id
        this.loadChatIntoMemory(next)
      } else {
        this.activeChatId = null
        this.messages.length = 0
        this.tools.length = 0
        this.pendingPermission = null
        this.pendingQuestion = null
        this.error = null
      }
    }

    this.saveProjectChats()
    this.pushState(true)
    return this.getState()
  }

  async pickChatHistoryDirectory(): Promise<AgentCompanionState> {
    const result = await dialog.showOpenDialog({
      title: 'Choose folder for Agent Companion chat history',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return this.getState()

    const dir = result.filePaths[0]
    if (!this.chatPersistence.isUsingCustomDir()) {
      await this.chatPersistence.migrateStoreToDir(dir)
    } else {
      this.store.setAgentCompanionHistoryDir(dir)
    }

    this.loadProjectChats()
    this.pushState(true)
    return this.getState()
  }

  /** Tracks drawer visibility for IPC/state sync; overlay resize is owned by the renderer via setPanel. */
  setDrawerOpen(open: boolean, _sender?: WebContents): { open: boolean } {
    this.drawerOpen = open
    this.pushState()
    return { open: this.drawerOpen }
  }

  toggleDrawer(sender?: WebContents): { open: boolean } {
    return this.setDrawerOpen(!this.drawerOpen, sender)
  }

  async connect(): Promise<AgentCompanionState> {
    const agentPath = this.resolveAgentPath()
    if (!agentPath) {
      this.connection = 'error'
      this.setupIssue = 'cli-missing'
      this.error = 'Cursor CLI (agent) not found. Install Cursor and ensure agent is on PATH.'
      this.pushState()
      return this.getState()
    }

    const cwd = this.projects.getProfile()?.rootPath ?? homedir()
    const gen = this.connectGeneration
    this.connection = 'connecting'
    this.setupIssue = null
    this.error = null
    this.pushState()

    try {
      this.client?.dispose()
      this.client = new AcpClient({
        onTextDelta: (chunk) => this.onTextDelta(chunk),
        onToolActivity: (tool) => this.onToolActivity(tool),
        onPermission: (req) => this.onPermission(req),
        onAskQuestion: (req) => this.onAskQuestion(req),
        onRunComplete: () => this.onRunComplete(),
        onError: (message) => this.onError(message),
        onLog: (line) => {
          console.warn('[Agent Companion ACP]', line)
        }
      })
      this.client.spawn(agentPath, cwd, this.modelId)
      await this.client.initialize()
      if (gen !== this.connectGeneration) {
        this.client?.dispose()
        this.client = null
        return this.getState()
      }
      await this.client.authenticate()
      if (gen !== this.connectGeneration) {
        this.client?.dispose()
        this.client = null
        return this.getState()
      }
      this.sessionId = await this.client.sessionNew(cwd, this.mode)
      if (gen !== this.connectGeneration) {
        this.client?.dispose()
        this.client = null
        this.sessionId = null
        return this.getState()
      }
      this.syncActiveChatSessionId(this.sessionId)
      this.connection = 'ready'
      this.setupIssue = null
      this.refreshAvailableModels()
    } catch (err) {
      if (gen !== this.connectGeneration) {
        return this.getState()
      }
      const message = err instanceof Error ? err.message : String(err)
      this.connection = 'error'
      this.setupIssue = message.toLowerCase().includes('auth') ? 'not-authenticated' : null
      this.error = message
      this.client?.dispose()
      this.client = null
      this.sessionId = null
    }

    this.pushState()
    return this.getState()
  }

  disconnect(): AgentCompanionState {
    this.connectGeneration++
    this.resetAgentConnection()
    this.pushState()
    return this.getState()
  }

  async sendPrompt(text: string): Promise<{ accepted: boolean; reason?: string }> {
    const trimmed = text.trim()
    if (!trimmed) return { accepted: false, reason: 'Empty message.' }
    if (this.streaming) return { accepted: false, reason: 'Agent is still responding.' }

    const agentPath = this.resolveAgentPath()
    if (!agentPath) {
      return { accepted: false, reason: 'Cursor CLI (agent) not installed. Follow the setup steps above.' }
    }

    this.messagesPushUser(trimmed)
    this.ensureActiveChat()

    if (!this.client?.running || !this.sessionId) {
      const connectGenBefore = this.connectGeneration
      await this.connect()
      if (
        connectGenBefore !== this.connectGeneration ||
        !this.client?.running ||
        !this.sessionId
      ) {
        if (this.connection === 'idle' && !this.error) {
          return { accepted: false, reason: 'Cancelled.' }
        }
        const reason =
          this.error ??
          (this.connection === 'connecting'
            ? 'Connection timed out or was interrupted.'
            : 'Could not connect to the Cursor agent.')
        this.pushSystemMessage(reason)
        return { accepted: false, reason }
      }
    }

    this.connection = 'streaming'
    this.streaming = true
    this.error = null
    this.assistantBuffer = ''
    this.assistantMessageId = randomUUID()
    this.clearToolsNow()
    this.pushState(true)

    try {
      await this.client.sessionPrompt(this.sessionId, trimmed)
      if (this.streaming) this.onRunComplete()
      return { accepted: true }
    } catch (err) {
      this.streaming = false
      this.connection = 'ready'
      const message = err instanceof Error ? err.message : String(err)
      this.error = message
      this.finishAssistantMessage()
      this.pushSystemMessage(message)
      this.pushState(true)
      return { accepted: false, reason: message }
    }
  }

  cancel(): { ok: boolean } {
    const wasWorking =
      this.streaming ||
      this.connection === 'connecting' ||
      this.connection === 'streaming' ||
      this.pendingPermission != null ||
      this.pendingQuestion != null

    this.connectGeneration++

    if (this.pendingPermission && this.client) {
      this.client.respond(this.pendingPermission.rpcId, {
        outcome: { outcome: 'cancelled' }
      })
      this.pendingPermission = null
    }
    if (this.pendingQuestion && this.client) {
      this.client.respond(this.pendingQuestion.rpcId, {
        outcome: { outcome: 'cancelled' }
      })
      this.pendingQuestion = null
    }

    if (this.sessionId) void this.client?.sessionCancel(this.sessionId)

    this.streaming = false
    this.finishAssistantMessage()

    if (this.connection === 'connecting') {
      this.client?.dispose()
      this.client = null
      this.sessionId = null
      this.connection = 'idle'
      this.error = null
    } else {
      this.connection = this.client?.running ? 'ready' : 'idle'
    }

    if (wasWorking) {
      this.messages.push({ id: randomUUID(), role: 'system', text: 'Stopped.' })
    }

    finalizeRunningToolActivity(this.tools)
    this.archiveToolStepsToAssistantMessage()
    this.finishAssistantMessage()
    this.clearToolsNow()
    this.pushState(true)
    return { ok: true }
  }

  setMode(mode: AgentCompanionMode): AgentCompanionState {
    this.mode = mode
    this.resetAgentConnection()
    this.persistActiveChat()
    this.pushState()
    return this.getState()
  }

  setModel(modelId: string): AgentCompanionState {
    if (this.streaming) return this.getState()
    const trimmed = modelId.trim()
    if (!trimmed) return this.getState()

    const previous = this.modelId
    this.modelId = this.store.setAgentCompanionModel(trimmed)
    this.refreshAvailableModels()

    if (this.client?.running) {
      this.resetAgentConnection()
    }

    if (previous !== this.modelId && this.messages.length > 0) {
      this.messages.push({
        id: randomUUID(),
        role: 'system',
        text: `Model switched to ${labelForAgentModel(this.modelId, this.availableModels)}. Your next message uses the new model.`
      })
    }

    this.pushState(true)
    return this.getState()
  }

  respondPermission(optionId: string): { ok: boolean } {
    if (!this.client || !this.pendingPermission) return { ok: false }
    this.client.respond(this.pendingPermission.rpcId, {
      outcome: { outcome: 'selected', optionId }
    })
    this.pendingPermission = null
    this.pushState()
    return { ok: true }
  }

  respondQuestion(
    answers: Array<{ questionId: string; selectedOptionIds: string[] }>
  ): { ok: boolean } {
    if (!this.client || !this.pendingQuestion) return { ok: false }
    this.client.respond(this.pendingQuestion.rpcId, {
      outcome: {
        outcome: 'answered',
        answers
      }
    })
    this.pendingQuestion = null
    this.pushState()
    return { ok: true }
  }

  skipQuestion(): { ok: boolean } {
    if (!this.client || !this.pendingQuestion) return { ok: false }
    this.client.respond(this.pendingQuestion.rpcId, {
      outcome: { outcome: 'skipped' }
    })
    this.pendingQuestion = null
    this.pushState()
    return { ok: true }
  }

  stagePrompt(text: string): AgentCompanionState {
    const trimmed = text.trim()
    this.stagedPrompt = trimmed || null
    this.pushState(true)
    return this.getState()
  }

  consumeStagedPrompt(): AgentCompanionState {
    this.stagedPrompt = null
    this.pushState(true)
    return this.getState()
  }

  setProject(_profile: ProjectProfile | null): void {
    this.persistActiveChat()
    this.resetAgentConnection()
    this.loadProjectChats()
    this.pushState()
  }

  dispose(): void {
    this.persistActiveChat()
    this.flushPushState()
    this.client?.dispose()
    this.client = null
  }

  private projectPath(): string | null {
    return this.projects.getProfile()?.rootPath ?? null
  }

  private loadProjectChats(): void {
    const stored = this.chatPersistence.load(this.projectPath() ?? '')
    this.chats = stored.chats
    this.activeChatId = stored.activeChatId
    const active = this.chats.find((chat) => chat.id === this.activeChatId)
    if (active) {
      this.loadChatIntoMemory(active)
      return
    }
    this.activeChatId = null
    this.messages.length = 0
    this.tools.length = 0
    this.pendingPermission = null
    this.pendingQuestion = null
    this.error = null
  }

  private saveProjectChats(): void {
    this.chatPersistence.save(this.projectPath() ?? '', {
      activeChatId: this.activeChatId,
      chats: this.chats.map((chat) => ({ ...chat, messages: chat.messages.map((m) => ({ ...m })) }))
    })
  }

  private loadChatIntoMemory(chat: AgentCompanionChat): void {
    this.mode = chat.mode
    this.messages.length = 0
    this.messages.push(...chat.messages.map((message) => ({ ...message, streaming: false })))
    this.tools.length = 0
    this.pendingPermission = null
    this.pendingQuestion = null
    this.error = null
    this.sessionId = chat.acpSessionId
  }

  private ensureActiveChat(): void {
    if (this.activeChatId && this.chats.some((chat) => chat.id === this.activeChatId)) return
    this.activeChatId = randomUUID()
    const chat = createAgentCompanionChat({
      id: this.activeChatId,
      projectPath: this.projectPath(),
      mode: this.mode,
      modelId: this.modelId
    })
    this.chats.unshift(chat)
  }

  private persistActiveChat(): void {
    if (!this.activeChatId) {
      if (this.messages.length === 0) return
      this.ensureActiveChat()
    }
    let index = this.chats.findIndex((chat) => chat.id === this.activeChatId)
    if (index < 0) {
      this.ensureActiveChat()
      index = this.chats.findIndex((chat) => chat.id === this.activeChatId)
    }
    if (index < 0) return
    const updated: AgentCompanionChat = {
      ...this.chats[index],
      mode: this.mode,
      modelId: this.modelId,
      updatedAt: Date.now(),
      title: deriveChatTitle(this.messages),
      messages: this.messages.map((message) => ({ ...message, streaming: false })),
      acpSessionId: this.sessionId
    }
    this.chats[index] = updated
    this.chats.sort((a, b) => b.updatedAt - a.updatedAt)
    this.saveProjectChats()
  }

  private syncActiveChatSessionId(sessionId: string | null): void {
    if (!this.activeChatId) return
    const chat = this.chats.find((entry) => entry.id === this.activeChatId)
    if (!chat) return
    chat.acpSessionId = sessionId
    chat.updatedAt = Date.now()
    this.saveProjectChats()
  }

  private resetAgentConnection(): void {
    this.client?.dispose()
    this.client = null
    this.sessionId = null
    this.connection = 'idle'
    this.streaming = false
    this.assistantBuffer = ''
    this.assistantMessageId = null
    this.pendingPermission = null
    this.pendingQuestion = null
  }

  private resolveAgentPath(): string | null {
    return this.customAgentPath ?? findAgentCli()
  }

  private refreshAvailableModels(): void {
    const agentPath = this.resolveAgentPath()
    this.availableModels = agentPath ? listAgentModels(agentPath) : [...AGENT_COMPANION_FALLBACK_MODELS]
    if (!this.availableModels.some((m) => m.id === this.modelId)) {
      this.availableModels.unshift({
        id: this.modelId,
        label: labelForAgentModel(this.modelId, this.availableModels)
      })
    }
  }

  private messagesPushUser(text: string): void {
    this.messages.push({ id: randomUUID(), role: 'user', text })
    this.persistActiveChat()
    this.pushState(true)
  }

  private pushSystemMessage(text: string): void {
    this.messages.push({ id: randomUUID(), role: 'system', text })
    this.pushState(true)
  }

  private onTextDelta(chunk: string): void {
    this.assistantBuffer += chunk
    const id = this.assistantMessageId ?? randomUUID()
    this.assistantMessageId = id
    const existing = this.messages.find((m) => m.id === id)
    if (existing) {
      existing.text = this.assistantBuffer
      existing.streaming = true
    } else {
      this.messages.push({
        id,
        role: 'assistant',
        text: this.assistantBuffer,
        streaming: true
      })
    }
    this.pushState()
  }

  private onToolActivity(tool: AgentCompanionToolActivity): void {
    const idx = this.tools.findIndex((t) => t.id === tool.id)
    if (idx >= 0) this.tools[idx] = tool
    else this.tools.push(tool)
    this.pushState(true)
  }

  private clearToolsNow(): void {
    this.tools.length = 0
  }

  private onPermission(req: AgentCompanionPermissionRequest): void {
    this.pendingPermission = req
    this.pushState(true)
  }

  private onAskQuestion(req: AgentCompanionAskQuestionRequest): void {
    this.pendingQuestion = req
    this.pushState(true)
  }

  private archiveToolStepsToAssistantMessage(): void {
    if (this.tools.length === 0 || !this.assistantMessageId) return
    const msg = this.messages.find((m) => m.id === this.assistantMessageId)
    if (!msg) return
    msg.steps = this.tools.map((t) => ({ ...t }))
  }

  private onRunComplete(): void {
    this.streaming = false
    this.connection = this.client?.running ? 'ready' : 'idle'
    finalizeRunningToolActivity(this.tools)
    this.archiveToolStepsToAssistantMessage()
    this.finishAssistantMessage()
    this.clearToolsNow()
    this.persistActiveChat()
    this.pushState(true)
  }

  private onError(message: string): void {
    this.error = message
    if (!this.client?.running) {
      this.connection = 'error'
    }
    this.streaming = false
    finalizeRunningToolActivity(this.tools)
    this.archiveToolStepsToAssistantMessage()
    this.finishAssistantMessage()
    this.clearToolsNow()
    this.pushState(true)
  }

  private finishAssistantMessage(): void {
    if (!this.assistantMessageId) return
    const msg = this.messages.find((m) => m.id === this.assistantMessageId)
    if (msg) msg.streaming = false
    this.assistantMessageId = null
    this.assistantBuffer = ''
  }

  private buildState(profile: ProjectProfile | null): AgentCompanionState {
    const agentPath = this.resolveAgentPath()
    if (this.availableModels.length === 0) {
      this.availableModels = [...AGENT_COMPANION_FALLBACK_MODELS]
    }
    return emptyState({
      connection: this.connection,
      setupIssue: agentPath ? this.setupIssue : 'cli-missing',
      drawerOpen: this.drawerOpen,
      sessionId: this.sessionId,
      mode: this.mode,
      modelId: this.modelId,
      modelLabel: labelForAgentModel(this.modelId, this.availableModels),
      availableModels: this.availableModels.map((m) => ({ ...m })),
      activeChatId: this.activeChatId,
      chatHistory: this.chats.map((chat) => chatToSummary(chat)),
      projectName: profile?.folderName ?? null,
      projectPath: profile?.rootPath ?? null,
      agentPath,
      messages: this.messages.map((m) => ({ ...m })),
      tools: this.tools.map((t) => ({ ...t })),
      pendingPermission: this.pendingPermission,
      pendingQuestion: this.pendingQuestion,
      error: this.error,
      chatHistoryPath: this.chatPersistence.getDisplayPath(profile?.rootPath ?? null),
      chatHistoryUsesCustomDir: this.chatPersistence.isUsingCustomDir(),
      stagedPrompt: this.stagedPrompt
    })
  }

  /** Coalesce rapid streaming deltas (~20fps) so IPC does not flood every overlay window. */
  private pushState(force = false): void {
    if (force || !this.streaming) {
      this.flushPushState()
      return
    }
    if (this.pushTimer) {
      this.pushPending = true
      return
    }
    this.overlay.broadcast(CH.agentCompanionState, this.getState())
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      if (this.pushPending) this.flushPushState()
    }, 50)
  }

  private flushPushState(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
    this.pushPending = false
    if (!this.streaming) this.persistActiveChat()
    this.overlay.broadcast(CH.agentCompanionState, this.getState())
  }
}
