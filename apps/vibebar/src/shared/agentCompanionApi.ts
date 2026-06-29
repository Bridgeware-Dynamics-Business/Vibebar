import type { AgentCompanionModelOption } from './agentCompanionModels.js'
import type { AgentCompanionChatSummary } from './agentCompanionChats.js'
import type { ResizeEdge } from './terminalApi.js'

/** Agent / Plan / Ask — same modes as Cursor CLI. */
export type AgentCompanionMode = 'agent' | 'plan' | 'ask'

export type AgentCompanionConnectionState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'streaming'
  | 'error'

export type AgentCompanionSetupIssue = 'cli-missing' | 'not-authenticated' | null

/** Semantic category for agent tool steps — drives icons and summary chips in the echo timeline. */
export type AgentCompanionToolKind = 'read' | 'edit' | 'search' | 'shell' | 'think' | 'other'

export interface AgentCompanionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  streaming?: boolean
  /** Tool steps archived when this assistant turn finishes. */
  steps?: AgentCompanionToolActivity[]
}

export interface AgentCompanionToolActivity {
  id: string
  label: string
  detail?: string
  kind?: AgentCompanionToolKind
  status: 'running' | 'done' | 'failed'
}

export interface AgentCompanionPermissionRequest {
  rpcId: number | string
  title: string
  detail: string
  options: Array<{ id: string; label: string }>
}

export interface AgentCompanionAskQuestionRequest {
  rpcId: number
  title?: string
  questions: Array<{
    id: string
    prompt: string
    options: Array<{ id: string; label: string }>
    allowMultiple?: boolean
  }>
}

export interface AgentCompanionState {
  connection: AgentCompanionConnectionState
  setupIssue: AgentCompanionSetupIssue
  drawerOpen: boolean
  sessionId: string | null
  mode: AgentCompanionMode
  modelId: string
  modelLabel: string
  availableModels: AgentCompanionModelOption[]
  activeChatId: string | null
  chatHistory: AgentCompanionChatSummary[]
  projectName: string | null
  projectPath: string | null
  agentPath: string | null
  messages: AgentCompanionMessage[]
  tools: AgentCompanionToolActivity[]
  pendingPermission: AgentCompanionPermissionRequest | null
  pendingQuestion: AgentCompanionAskQuestionRequest | null
  error: string | null
  /** Where chat history is saved (custom folder or app config file path). */
  chatHistoryPath: string | null
  /** True when chat history is stored in a user-chosen folder instead of app settings. */
  chatHistoryUsesCustomDir: boolean
  /** Prompt staged from Prompt Library — fills the compose box until consumed. */
  stagedPrompt: string | null
}

export interface AgentCompanionBridge {
  getState: () => Promise<AgentCompanionState>
  toggleDrawer: () => Promise<{ open: boolean }>
  setDrawerOpen: (open: boolean) => Promise<{ open: boolean }>
  connect: () => Promise<AgentCompanionState>
  disconnect: () => Promise<AgentCompanionState>
  sendPrompt: (text: string) => Promise<{ accepted: boolean; reason?: string }>
  cancel: () => Promise<{ ok: boolean }>
  setMode: (mode: AgentCompanionMode) => Promise<AgentCompanionState>
  setModel: (modelId: string) => Promise<AgentCompanionState>
  listModels: () => Promise<AgentCompanionModelOption[]>
  newChat: () => Promise<AgentCompanionState>
  selectChat: (chatId: string) => Promise<AgentCompanionState>
  deleteChat: (chatId: string) => Promise<AgentCompanionState>
  pickChatHistoryDirectory: () => Promise<AgentCompanionState>
  respondPermission: (optionId: string) => Promise<{ ok: boolean }>
  respondQuestion: (
    answers: Array<{ questionId: string; selectedOptionIds: string[] }>
  ) => Promise<{ ok: boolean }>
  skipQuestion: () => Promise<{ ok: boolean }>
  /** Places text in the compose box without sending (e.g. from Prompt Library). */
  stagePrompt: (text: string) => Promise<AgentCompanionState>
  /** Clears a staged prompt after the renderer applied it to the compose box. */
  consumeStagedPrompt: () => Promise<AgentCompanionState>
  onState: (cb: (state: AgentCompanionState) => void) => () => void
}
