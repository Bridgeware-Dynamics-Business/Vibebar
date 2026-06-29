import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  AgentCompanionMode,
  AgentCompanionState
} from '@shared/agentCompanionApi.js'
import { Icon } from '../../shared/icons'
import { DetachButton, FillToggle, useFillToggle } from '../../shared/ui'
import { AgentCompanionContextPanel } from './AgentCompanionContext'
import { AgentEchoTimeline } from './AgentEchoTimeline'
import { AgentModelSelect } from './AgentModelSelect'
import { AgentChatHistoryBar } from './AgentChatHistoryBar'

const MODES: AgentCompanionMode[] = ['agent', 'plan', 'ask']

const COMPOSE_HEIGHT_MIN = 72
const COMPOSE_HEIGHT_MAX = 360
const COMPOSE_HEIGHT_DEFAULT = 88
const COMPOSE_HEIGHT_STORAGE_KEY = 'agentCompanion.composeHeight'

function clampComposeHeight(value: number): number {
  return Math.min(COMPOSE_HEIGHT_MAX, Math.max(COMPOSE_HEIGHT_MIN, value))
}

function useComposeHeight(): {
  height: number
  onResizePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
} {
  const [height, setHeight] = useState(() => {
    const stored = window.localStorage.getItem(COMPOSE_HEIGHT_STORAGE_KEY)
    if (!stored) return COMPOSE_HEIGHT_DEFAULT
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? clampComposeHeight(parsed) : COMPOSE_HEIGHT_DEFAULT
  })

  useEffect(() => {
    window.localStorage.setItem(COMPOSE_HEIGHT_STORAGE_KEY, String(height))
  }, [height])

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent): void => {
      setHeight(clampComposeHeight(startHeight + (startY - ev.clientY)))
    }
    const onUp = (): void => {
      handle.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('agent-compose-resizing')
    }

    document.body.classList.add('agent-compose-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [height])

  return { height, onResizePointerDown }
}

function connectionLabel(state: AgentCompanionState): string {
  switch (state.connection) {
    case 'connecting':
      return 'Connecting…'
    case 'ready':
      return 'Ready'
    case 'streaming':
      return 'Agent working…'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

export function AgentCompanionDrawer({
  state,
  onClose,
  solid,
  onToggleSolid,
  onDetach,
  detached = false
}: {
  state: AgentCompanionState
  onClose: () => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the drawer into a floating window. */
  onDetach?: () => void
  /** True when hosted in a detached overlay window (enables drag + hides detach). */
  detached?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendNotice, setSendNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)
  const [localSolid, toggleLocalSolid] = useFillToggle('agentCompanion.solid')
  const { height: composeHeight, onResizePointerDown } = useComposeHeight()
  const isSolid = solid ?? localSolid
  const toggleSolid = onToggleSolid ?? toggleLocalSolid

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.messages, state.tools, state.pendingPermission])

  useEffect(() => {
    if (state.connection !== 'connecting' && state.connection !== 'streaming') {
      setSending(false)
    }
  }, [state.connection])

  useEffect(() => {
    if (!state.stagedPrompt) return
    setDraft(state.stagedPrompt)
    setSendNotice(null)
    void window.vibebar.agentCompanion.consumeStagedPrompt()
    composeRef.current?.focus()
  }, [state.stagedPrompt])

  const stopRun = useCallback(async () => {
    setSending(false)
    await window.vibebar.agentCompanion.cancel()
  }, [])

  const endSession = useCallback(async () => {
    setSending(false)
    setSendNotice(null)
    await window.vibebar.agentCompanion.disconnect()
  }, [])

  const startNewChat = useCallback(async () => {
    setSending(false)
    setDraft('')
    setSendNotice(null)
    await window.vibebar.agentCompanion.newChat()
  }, [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending || state.connection === 'streaming') return

    if (state.setupIssue === 'cli-missing') {
      setSendNotice('Install the Cursor CLI first — use the copy commands in the setup steps above.')
      return
    }
    if (state.setupIssue === 'not-authenticated') {
      setSendNotice('Run agent login in a terminal, then retry.')
      return
    }

    setSendNotice(null)
    setSending(true)
    const result = await window.vibebar.agentCompanion.sendPrompt(text)
    setSending(false)
    if (result.accepted) {
      setDraft('')
      setSendNotice(null)
    } else {
      setSendNotice(result.reason ?? 'Message was not sent.')
    }
  }, [draft, sending, state.connection, state.setupIssue])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const needsInstallGuide =
    state.setupIssue === 'cli-missing' || state.setupIssue === 'not-authenticated'
  const showInstallGuide =
    needsInstallGuide || (state.connection === 'error' && state.messages.length === 0)
  const sendBlocked = needsInstallGuide
  const isBusy = sending || state.connection === 'connecting' || state.connection === 'streaming'
  const canStop =
    isBusy ||
    state.pendingPermission != null ||
    state.pendingQuestion != null
  const canEndSession =
    !showInstallGuide &&
    (state.connection === 'ready' ||
      state.connection === 'streaming' ||
      state.connection === 'connecting')

  useEffect(() => {
    if (!showInstallGuide) {
      void window.vibebar.agentCompanion.listModels()
    }
  }, [showInstallGuide])

  const modelOptions =
    state.availableModels.length > 0
      ? state.availableModels
      : [{ id: state.modelId, label: state.modelLabel }]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={`flex shrink-0 items-center gap-2 border-b border-vibe-border bg-black/40 px-3 py-2 ${
          detached ? 'vibe-drag' : 'vibe-no-drag'
        }`}
      >
        <Icon name="MessageSquare" size={15} className="text-vibe-accent-2" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">Agent Companion</div>
          <div className="truncate text-[10px] text-vibe-muted">{connectionLabel(state)}</div>
        </div>
        <div className="vibe-no-drag flex shrink-0 items-center gap-1">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={state.connection === 'streaming'}
              onClick={() => void window.vibebar.agentCompanion.setMode(mode)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium capitalize ${
                state.mode === mode
                  ? 'bg-vibe-accent/25 text-vibe-accent-2'
                  : 'text-vibe-muted hover:bg-white/10 hover:text-vibe-text'
              }`}
            >
              {mode}
            </button>
          ))}
          {canStop && (
            <button
              type="button"
              title="Stop current response"
              onClick={() => void stopRun()}
              className="flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300 hover:bg-red-500/20"
            >
              <Icon name="Square" size={12} />
              Stop
            </button>
          )}
          <FillToggle solid={isSolid} onToggle={toggleSolid} />
          {onDetach && (
            <DetachButton onDetach={onDetach} label="Detach Agent Companion" />
          )}
          <button
            type="button"
            title={detached ? 'Hide window' : 'Close drawer'}
            onClick={onClose}
            className="rounded-md p-1 text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
      </header>

      {!showInstallGuide && <AgentCompanionContextPanel agentState={state} />}

      <div ref={scrollRef} className="vibe-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {showInstallGuide ? (
          <SetupPanel state={state} />
        ) : (
          <>
            {state.error && state.messages.length > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                {state.error}
              </div>
            )}
            {state.messages.length === 0 && state.tools.length === 0 && (
              <p className="rounded-xl border border-dashed border-vibe-border bg-white/[0.02] px-3 py-4 text-center text-xs leading-relaxed text-vibe-muted">
                Ask the agent about your branch, diff, or current task — context above stays in sync
                with VibeBar. Enable MCP so the agent can read session state without paste.
              </p>
            )}
            {state.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'ml-6 border-vibe-accent/30 bg-vibe-accent/10 text-vibe-text'
                    : msg.role === 'system'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                      : 'mr-2 border-vibe-border/80 bg-white/[0.03] text-vibe-text'
                }`}
              >
                {msg.role === 'user' && (
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">
                    You
                  </div>
                )}
                {msg.role === 'system' && (
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
                    Notice
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">
                  {msg.text || (msg.streaming ? '' : '…')}
                  {msg.streaming && !msg.text && (
                    <span className="inline-flex items-center gap-1.5 text-vibe-muted">
                      <Icon name="Loader2" size={11} className="animate-spin" />
                      Thinking…
                    </span>
                  )}
                </div>
                {msg.role === 'assistant' && msg.streaming && state.tools.length > 0 && (
                  <AgentEchoTimeline steps={state.tools} live />
                )}
                {msg.role === 'assistant' && !msg.streaming && msg.steps && msg.steps.length > 0 && (
                  <AgentEchoTimeline steps={msg.steps} />
                )}
              </div>
            ))}
            {state.connection === 'streaming' &&
              state.tools.length > 0 &&
              !state.messages.some((m) => m.streaming && m.role === 'assistant') && (
                <div className="mr-2 rounded-xl border border-vibe-border/80 bg-white/[0.03] px-3 py-2 text-xs">
                  <AgentEchoTimeline steps={state.tools} live />
                </div>
              )}
          </>
        )}

        {state.pendingPermission && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-xs font-semibold text-amber-100">{state.pendingPermission.title}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
              {state.pendingPermission.detail}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.pendingPermission.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void window.vibebar.agentCompanion.respondPermission(opt.id)}
                  className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-vibe-text hover:bg-white/15"
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void stopRun()}
                className="rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state.pendingQuestion && (
          <div className="rounded-xl border border-vibe-border bg-white/[0.03] p-3">
            {state.pendingQuestion.title && (
              <div className="mb-2 text-xs font-semibold">{state.pendingQuestion.title}</div>
            )}
            {state.pendingQuestion.questions.map((q) => (
              <div key={q.id} className="mb-2">
                <p className="text-[11px] text-vibe-muted">{q.prompt}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {q.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        void window.vibebar.agentCompanion.respondQuestion([
                          { questionId: q.id, selectedOptionIds: [opt.id] }
                        ])
                      }
                      className="rounded-md border border-vibe-border px-2 py-1 text-[11px] hover:bg-white/10"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void window.vibebar.agentCompanion.skipQuestion()}
              className="text-[11px] text-vibe-muted hover:text-vibe-text"
            >
              Skip
            </button>
          </div>
        )}
      </div>

      <footer className="vibe-no-drag shrink-0 space-y-2 border-t border-vibe-border p-3">
        {(sendNotice || sendBlocked) && (
          <div
            className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
              sendBlocked
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }`}
          >
            {sendBlocked
              ? state.setupIssue === 'cli-missing'
                ? 'Cursor CLI not installed — complete the setup steps above before sending.'
                : 'Sign in with agent login before sending.'
              : sendNotice}
          </div>
        )}
        {(sending || state.connection === 'connecting') && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void stopRun()}
              className="rounded-md border border-red-500/40 px-2 py-0.5 text-[10px] font-medium text-red-300 hover:bg-red-500/10"
            >
              Stop
            </button>
          </div>
        )}
        <div className="rounded-xl border border-vibe-border bg-black/20 focus-within:border-vibe-accent/50">
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize message box"
            aria-valuemin={COMPOSE_HEIGHT_MIN}
            aria-valuemax={COMPOSE_HEIGHT_MAX}
            aria-valuenow={composeHeight}
            onPointerDown={onResizePointerDown}
            className="agent-compose-resize-handle group flex h-3 cursor-ns-resize items-center justify-center rounded-t-xl border-b border-white/[0.06] bg-white/[0.02] touch-none select-none"
          >
            <Icon
              name="GripHorizontal"
              size={14}
              className="text-vibe-muted/70 transition-colors group-hover:text-vibe-text group-active:text-vibe-accent-2"
            />
          </div>
          <textarea
            ref={composeRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            style={{ height: composeHeight }}
            placeholder={
              sendBlocked
                ? 'Install and sign in to Cursor CLI to chat here…'
                : 'Ask the agent… (Shift+Enter for newline)'
            }
            disabled={isBusy}
            className="vibe-scroll vibe-no-drag block w-full resize-none rounded-b-xl border-0 bg-black/30 px-3 py-2 text-xs leading-relaxed text-vibe-text placeholder:text-vibe-muted focus:outline-none disabled:opacity-50"
          />
        </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 shrink items-center gap-3">
              <button
                type="button"
                onClick={() => void window.vibebar.quickLaunch.run('cursor')}
                className="shrink-0 text-[11px] text-vibe-muted hover:text-vibe-accent-2"
              >
                Open in Cursor IDE
              </button>
              {canEndSession && (
                <button
                  type="button"
                  title="Disconnect from the agent (keeps this chat in history)"
                  onClick={() => void endSession()}
                  className="shrink-0 text-[11px] text-vibe-muted hover:text-red-300"
                >
                  Disconnect
                </button>
              )}
            </div>
            {!showInstallGuide && (
              <AgentModelSelect
                value={state.modelId}
                options={modelOptions}
                disabled={isBusy}
                onChange={(modelId) => void window.vibebar.agentCompanion.setModel(modelId)}
              />
            )}
            <div className="flex shrink-0 items-center gap-2">
              {canStop && (
                <button
                  type="button"
                  onClick={() => void stopRun()}
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                disabled={!draft.trim() || isBusy}
                onClick={() => void send()}
                className="rounded-lg bg-vibe-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-vibe-accent/90 disabled:opacity-40"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
          {!showInstallGuide && (
            <AgentChatHistoryBar
              chats={state.chatHistory}
              activeChatId={state.activeChatId}
              disabled={isBusy}
              historyPath={state.chatHistoryPath}
              historyUsesCustomDir={state.chatHistoryUsesCustomDir}
              onNewChat={() => void startNewChat()}
              onSelectChat={(chatId) => void window.vibebar.agentCompanion.selectChat(chatId)}
              onDeleteChat={(chatId) => void window.vibebar.agentCompanion.deleteChat(chatId)}
              onPickHistoryDirectory={() =>
                void window.vibebar.agentCompanion.pickChatHistoryDirectory()
              }
            />
          )}
      </footer>
    </div>
  )
}

function SetupPanel({ state }: { state: AgentCompanionState }): JSX.Element {
  if (state.setupIssue === 'cli-missing') {
    return <CliInstallGuide />
  }
  if (state.setupIssue === 'not-authenticated') {
    return <CliLoginGuide />
  }
  return (
    <div className="space-y-2 text-xs leading-relaxed text-vibe-muted">
      <p className="font-medium text-vibe-text">Connect to start</p>
      {state.error && <p className="text-red-300">{state.error}</p>}
      <button
        type="button"
        onClick={() => void window.vibebar.agentCompanion.connect()}
        className="rounded-lg border border-vibe-border px-3 py-1.5 text-xs font-medium hover:bg-white/10"
      >
        Connect agent
      </button>
    </div>
  )
}

function useCopyCommand(): {
  copiedId: string | null
  copy: (text: string, id: string) => Promise<void>
} {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(null)
    }
  }, [])
  return { copiedId, copy }
}

function CopyCommand({
  label,
  command,
  commandId,
  copiedId,
  onCopy
}: {
  label: string
  command: string
  commandId: string
  copiedId: string | null
  onCopy: (text: string, id: string) => void
}): JSX.Element {
  const copied = copiedId === commandId
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-vibe-muted">{label}</div>
      <div className="flex items-start gap-1.5 rounded-lg border border-vibe-border bg-black/30 p-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-vibe-text">
          {command}
        </code>
        <button
          type="button"
          title="Copy command"
          aria-label={`Copy ${label}`}
          onClick={() => void onCopy(command, commandId)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-vibe-border text-vibe-muted transition-colors hover:border-white/20 hover:text-vibe-text"
        >
          <Icon name={copied ? 'Check' : 'Copy'} size={13} />
        </button>
      </div>
    </div>
  )
}

const CLI_INSTALL_WIN = "irm 'https://cursor.com/install?win32=true' | iex"
const CLI_INSTALL_UNIX = 'curl https://cursor.com/install -fsS | bash'
const CLI_VERIFY = 'agent --version'
const CLI_LOGIN = 'agent login'

function CliInstallGuide(): JSX.Element {
  const { copiedId, copy } = useCopyCommand()

  const isWindows =
    typeof navigator !== 'undefined' &&
    (/Win/i.test(navigator.userAgent) || /Windows/i.test(navigator.platform))

  return (
    <div className="space-y-3 text-xs leading-relaxed text-vibe-muted">
      <div>
        <p className="font-medium text-vibe-text">Install the Cursor CLI</p>
        <p className="mt-1">
          Agent Companion talks to <code className="rounded bg-white/10 px-1">agent</code> on your
          machine. Run one install command in a terminal, then come back here.
        </p>
      </div>

      <ol className="list-decimal space-y-3 pl-4 marker:text-vibe-accent-2">
        <li className="space-y-2">
          <span className="text-vibe-text">Install (pick your OS)</span>
          {isWindows ? (
            <CopyCommand
              label="Windows — PowerShell"
              command={CLI_INSTALL_WIN}
              commandId="install-win"
              copiedId={copiedId}
              onCopy={copy}
            />
          ) : (
            <CopyCommand
              label="macOS / Linux / WSL"
              command={CLI_INSTALL_UNIX}
              commandId="install-unix"
              copiedId={copiedId}
              onCopy={copy}
            />
          )}
          <details className="rounded-lg border border-vibe-border bg-white/[0.02] px-2.5 py-2">
            <summary className="cursor-pointer text-[11px] text-vibe-muted hover:text-vibe-text">
              Other operating system
            </summary>
            <div className="mt-2 space-y-2">
              {!isWindows && (
                <CopyCommand
                  label="Windows — PowerShell"
                  command={CLI_INSTALL_WIN}
                  commandId="install-win-alt"
                  copiedId={copiedId}
                  onCopy={copy}
                />
              )}
              {isWindows && (
                <CopyCommand
                  label="macOS / Linux / WSL"
                  command={CLI_INSTALL_UNIX}
                  commandId="install-unix-alt"
                  copiedId={copiedId}
                  onCopy={copy}
                />
              )}
            </div>
          </details>
        </li>
        <li className="space-y-2">
          <span className="text-vibe-text">Verify it worked</span>
          <CopyCommand
            label="Check version"
            command={CLI_VERIFY}
            commandId="verify"
            copiedId={copiedId}
            onCopy={copy}
          />
          <p className="text-[11px]">You should see a version string, not “command not found”.</p>
        </li>
        <li className="space-y-2">
          <span className="text-vibe-text">Sign in once</span>
          <CopyCommand
            label="Log in to Cursor"
            command={CLI_LOGIN}
            commandId="login"
            copiedId={copiedId}
            onCopy={copy}
          />
        </li>
        <li>
          <span className="text-vibe-text">Restart VibeBar</span>
          <p className="mt-1 text-[11px]">
            Quit and reopen VibeBar so it picks up the new PATH, then tap Retry below.
          </p>
        </li>
      </ol>

      <button
        type="button"
        onClick={() => void window.vibebar.agentCompanion.connect()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-vibe-accent-2/40 bg-vibe-accent-2/10 px-3 py-2 text-xs font-medium text-vibe-accent-2 hover:bg-vibe-accent-2/20"
      >
        <Icon name="RefreshCw" size={14} />
        Retry connect
      </button>

      <p className="text-[10px] text-vibe-muted">
        Full guide: cursor.com/docs/cli/overview
      </p>
    </div>
  )
}

function CliLoginGuide(): JSX.Element {
  const { copiedId, copy } = useCopyCommand()
  return (
    <div className="space-y-3 text-xs leading-relaxed text-vibe-muted">
      <div>
        <p className="font-medium text-vibe-text">Sign in to Cursor CLI</p>
        <p className="mt-1">The CLI is installed but not authenticated yet.</p>
      </div>
      <CopyCommand
        label="Run in terminal"
        command={CLI_LOGIN}
        commandId="login-retry"
        copiedId={copiedId}
        onCopy={copy}
      />
      <p className="text-[11px]">Complete the browser sign-in, then retry.</p>
      <button
        type="button"
        onClick={() => void window.vibebar.agentCompanion.connect()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-vibe-border px-3 py-2 text-xs font-medium hover:bg-white/10"
      >
        <Icon name="RefreshCw" size={14} />
        Retry connect
      </button>
    </div>
  )
}
