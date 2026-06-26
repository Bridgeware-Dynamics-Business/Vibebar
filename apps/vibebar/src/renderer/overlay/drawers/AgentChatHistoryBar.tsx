import { useEffect, useRef, useState } from 'react'

import type { AgentCompanionChatSummary } from '@shared/agentCompanionChats.js'

import { formatChatTimestamp } from '@shared/agentCompanionChats.js'

import { Icon } from '../../shared/icons'



function truncatePath(path: string, max = 28): string {

  if (path.length <= max) return path

  const start = path.slice(0, 10)

  const end = path.slice(-max + 13)

  return `${start}…${end}`

}



export function AgentChatHistoryBar({

  chats,

  activeChatId,

  disabled,

  historyPath,

  historyUsesCustomDir,

  onNewChat,

  onSelectChat,

  onDeleteChat,

  onPickHistoryDirectory

}: {

  chats: AgentCompanionChatSummary[]

  activeChatId: string | null

  disabled?: boolean

  historyPath?: string | null

  historyUsesCustomDir?: boolean

  onNewChat: () => void

  onSelectChat: (chatId: string) => void

  onDeleteChat: (chatId: string) => void

  onPickHistoryDirectory: () => void

}): JSX.Element {

  const [expanded, setExpanded] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)



  useEffect(() => {

    if (!expanded) return

    const onPointerDown = (event: MouseEvent): void => {

      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false)

    }

    const onKeyDown = (event: KeyboardEvent): void => {

      if (event.key === 'Escape') setExpanded(false)

    }

    document.addEventListener('mousedown', onPointerDown)

    document.addEventListener('keydown', onKeyDown)

    return () => {

      document.removeEventListener('mousedown', onPointerDown)

      document.removeEventListener('keydown', onKeyDown)

    }

  }, [expanded])



  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  const pathLabel = historyPath ? truncatePath(historyPath) : 'App settings'

  const pathTitle = historyPath

    ? historyUsesCustomDir

      ? `Chat history folder: ${historyPath} (click to change)`

      : `Chat history in app settings: ${historyPath} (click to choose a folder)`

    : 'Choose where chat history is saved'



  return (

    <div ref={rootRef} className="relative border-t border-vibe-border/80 pt-2">

      {expanded && sortedChats.length > 0 && (

        <div className="agent-model-menu vibe-scroll absolute bottom-[calc(100%+6px)] left-0 right-0 z-40 max-h-44 overflow-y-auto rounded-xl border border-vibe-border bg-[#12151c]/98 p-1.5 shadow-[0_-10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">

          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-vibe-muted">

            Chat history

          </div>

          {sortedChats.map((chat) => {

            const isActive = chat.id === activeChatId

            return (

              <div

                key={chat.id}

                className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 ${

                  isActive ? 'bg-vibe-accent/15' : 'hover:bg-white/[0.04]'

                }`}

              >

                <button

                  type="button"

                  disabled={disabled}

                  onClick={() => {

                    onSelectChat(chat.id)

                    setExpanded(false)

                  }}

                  className={`vibe-no-drag min-w-0 flex-1 flex-col gap-0.5 rounded-md px-1.5 py-1.5 text-left transition-colors ${

                    isActive

                      ? 'text-vibe-text'

                      : 'text-vibe-muted hover:text-vibe-text'

                  }`}

                >

                  <div className="flex items-center justify-between gap-2">

                    <span className="truncate text-[11px] font-medium">{chat.title}</span>

                    <span className="shrink-0 text-[10px] text-vibe-muted">

                      {formatChatTimestamp(chat.updatedAt)}

                    </span>

                  </div>

                  {chat.preview && (

                    <span className="truncate text-[10px] text-vibe-muted">{chat.preview}</span>

                  )}

                </button>

                <button

                  type="button"

                  disabled={disabled}

                  title="Delete chat"

                  aria-label={`Delete ${chat.title}`}

                  onClick={() => onDeleteChat(chat.id)}

                  className="vibe-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-vibe-muted opacity-0 transition-all hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100 disabled:opacity-40"

                >

                  <Icon name="Trash2" size={13} />

                </button>

              </div>

            )

          })}

        </div>

      )}



      <div className="flex items-center gap-1.5">

        <button

          type="button"

          disabled={disabled}

          title="New chat"

          aria-label="New chat"

          onClick={onNewChat}

          className="vibe-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-vibe-border bg-white/[0.04] text-vibe-muted transition-colors hover:border-vibe-accent/40 hover:bg-vibe-accent/10 hover:text-vibe-accent-2 disabled:opacity-45"

        >

          <Icon name="Plus" size={14} />

        </button>



        <div className="vibe-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">

          {sortedChats.length === 0 ? (

            <span className="px-1 text-[10px] text-vibe-muted">No chats yet — start one with +</span>

          ) : (

            sortedChats.map((chat) => {

              const isActive = chat.id === activeChatId

              return (

                <div key={chat.id} className="group relative shrink-0">

                  <button

                    type="button"

                    disabled={disabled}

                    title={chat.title}

                    onClick={() => onSelectChat(chat.id)}

                    className={`vibe-no-drag max-w-[8.5rem] truncate rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${

                      isActive

                        ? 'border-vibe-accent/45 bg-vibe-accent/20 text-vibe-text'

                        : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:border-white/15 hover:bg-white/[0.06] hover:text-vibe-text'

                    }`}

                  >

                    {chat.title}

                  </button>

                  {!disabled && (

                    <button

                      type="button"

                      title="Delete chat"

                      aria-label={`Delete ${chat.title}`}

                      onClick={() => onDeleteChat(chat.id)}

                      className="vibe-no-drag absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-vibe-border bg-[#12151c] text-vibe-muted opacity-0 transition-opacity hover:border-red-500/40 hover:text-red-300 group-hover:opacity-100"

                    >

                      <Icon name="Trash2" size={9} />

                    </button>

                  )}

                </div>

              )

            })

          )}

        </div>



        {sortedChats.length > 0 && (

          <button

            type="button"

            disabled={disabled}

            title={expanded ? 'Collapse chat history' : 'Expand chat history'}

            aria-expanded={expanded}

            onClick={() => setExpanded((open) => !open)}

            className={`vibe-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${

              expanded

                ? 'border-vibe-accent/45 bg-vibe-accent/10 text-vibe-accent-2'

                : 'border-vibe-border bg-white/[0.03] text-vibe-muted hover:border-white/15 hover:bg-white/[0.06] hover:text-vibe-text'

            }`}

          >

            <Icon name="ChevronDown" size={14} className={expanded ? 'rotate-180' : ''} />

          </button>

        )}



        <button

          type="button"

          disabled={disabled}

          title={pathTitle}

          onClick={onPickHistoryDirectory}

          className="vibe-no-drag flex h-7 max-w-[9rem] shrink-0 items-center gap-1 rounded-lg border border-vibe-border bg-white/[0.03] px-1.5 text-vibe-muted transition-colors hover:border-white/15 hover:bg-white/[0.06] hover:text-vibe-text disabled:opacity-45"

        >

          <Icon name="FileText" size={12} className="shrink-0" />

          <span className="truncate text-[9px] font-mono leading-none">{pathLabel}</span>

        </button>

      </div>

    </div>

  )

}


