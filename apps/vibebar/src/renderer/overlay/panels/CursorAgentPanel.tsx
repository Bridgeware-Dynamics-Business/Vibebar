import { useEffect, useState } from 'react'
import type { McpServerStatus, ProjectProfile, VibeSettings } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader, Toggle } from '../../shared/ui'

function formatAgentAccessAgo(timestamp: number | null | undefined): string {
  if (timestamp == null) return 'No agent access yet'
  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) return 'Cursor connected recently'
  const mins = Math.floor(deltaMs / 60_000)
  if (mins < 60) return `Last agent access: ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `Last agent access: ${hours}h ago`
  return `Last agent access: ${Math.floor(hours / 24)}d ago`
}

function recentlyConnected(timestamp: number | null | undefined): boolean {
  return timestamp != null && Date.now() - timestamp < 60_000
}

type HeroTone = {
  ring: string
  icon: string
  label: string
  detail: string
}

function heroTone(status: McpServerStatus | null): HeroTone {
  if (!status || !status.enabled) {
    return {
      ring: 'border-vibe-border bg-white/[0.03] text-vibe-muted',
      icon: 'PlugZap',
      label: 'Disabled',
      detail: 'Enable the server so Cursor Agent can read VibeBar state.'
    }
  }
  if (status.error) {
    return {
      ring: 'border-red-500/50 bg-red-500/10 text-red-200',
      icon: 'AlertTriangle',
      label: 'Failed to start',
      detail: status.error
    }
  }
  if (status.running) {
    return {
      ring: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
      icon: 'ShieldCheck',
      label: recentlyConnected(status.lastAgentAccessAt) ? 'Connected' : 'Running',
      detail: 'Localhost MCP is listening — paste the snippet into Cursor to connect.'
    }
  }
  return {
    ring: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
    icon: 'Loader2',
    label: 'Starting',
    detail: 'Server is enabled but not listening yet.'
  }
}

export function CursorAgentPanel({
  profile,
  onClose,
  onPrepareCursor,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  onClose: () => void
  onPrepareCursor?: () => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the panel out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [settings, setSettings] = useState<VibeSettings | null>(null)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    void window.vibebar.settings.get().then((s) => {
      setSettings(s.settings)
      setMcpStatus(s.mcpStatus)
    })
    const offMcp = window.vibebar.mcp.onChanged(setMcpStatus)
    return () => {
      offMcp()
    }
  }, [])

  async function save(partial: Parameters<typeof window.vibebar.settings.save>[0]): Promise<void> {
    const next = await window.vibebar.settings.save(partial)
    setSettings(next.settings)
    if (next.mcpStatus) setMcpStatus(next.mcpStatus)
  }

  const endpointUrl = `http://${mcpStatus?.host ?? '127.0.0.1'}:${mcpStatus?.port ?? 17342}/mcp`

  async function copyText(text: string, mark: (copied: boolean) => void): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      mark(true)
      setTimeout(() => mark(false), 2000)
    } catch {
      mark(false)
    }
  }

  async function copyMcpSnippet(): Promise<void> {
    const snippet = mcpStatus?.connectionSnippet ?? (await window.vibebar.mcp.getStatus()).connectionSnippet
    await copyText(snippet, setSnippetCopied)
  }

  if (!settings) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Cursor Agent" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
          {onDetach && <DetachButton onDetach={onDetach} label="Detach Cursor Agent" />}
        </PanelHeader>
        <p className="p-6 text-center text-xs text-vibe-muted">Loading…</p>
      </div>
    )
  }

  const tone = heroTone(mcpStatus)
  const mcpEnabled = settings.mcpServerEnabled ?? false
  const pasteEnabled = Boolean(settings.pasteAfterOpenCursor)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Cursor Agent" onClose={onClose} solid={solid} onToggleSolid={onToggleSolid}>
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Cursor Agent" />}
      </PanelHeader>

      <div className="vibe-scroll flex-1 space-y-5 overflow-y-auto p-4">
        <section className={`rounded-xl border p-3 ${tone.ring}`}>
          <div className="flex items-center gap-2.5">
            <Icon name={tone.icon} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{tone.label}</span>
                <span className="font-mono text-[10px] opacity-80">
                  {mcpStatus?.host ?? '127.0.0.1'}:{mcpStatus?.port ?? 17342}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{tone.detail}</p>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] opacity-80">{formatAgentAccessAgo(mcpStatus?.lastAgentAccessAt)}</p>
        </section>

        <div className="flex items-center justify-between rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2.5">
          <div className="min-w-0">
            <span className="text-sm text-vibe-text">Enable MCP server for Cursor</span>
            <p className="text-[11px] text-vibe-muted">
              Read-only VibeBar state on localhost — no API keys, no chat UI.
            </p>
          </div>
          <Toggle
            checked={mcpEnabled}
            onChange={(next) => void save({ mcpServerEnabled: next })}
            label="Enable MCP server for Cursor"
          />
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Connection
          </h3>
          <div className="space-y-2 rounded-xl border border-vibe-border bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <Icon name="PlugZap" size={14} className="shrink-0 text-vibe-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-vibe-text" title={endpointUrl}>
                {endpointUrl}
              </span>
              <button
                type="button"
                onClick={() => void copyText(endpointUrl, setUrlCopied)}
                title="Copy connection URL"
                aria-label="Copy connection URL"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-vibe-border text-vibe-muted transition-colors hover:border-white/20 hover:text-vibe-text"
              >
                <Icon name={urlCopied ? 'Check' : 'Copy'} size={13} />
              </button>
            </div>
            <pre className="vibe-scroll max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10px] text-vibe-text">
              {mcpStatus?.connectionSnippet ?? '{\n  "mcpServers": {}\n}'}
            </pre>
            <button
              type="button"
              onClick={() => void copyMcpSnippet()}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-vibe-border py-1.5 text-[11px] text-vibe-text hover:bg-white/10"
            >
              <Icon name={snippetCopied ? 'Check' : 'Copy'} size={13} />
              {snippetCopied ? 'Copied' : 'Copy mcp.json snippet'}
            </button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Project context
          </h3>
          {profile ? (
            <div className="flex items-center gap-2 rounded-lg border border-vibe-border bg-white/[0.03] px-3 py-2 text-xs text-vibe-text">
              <Icon name="FolderOpen" size={15} className="shrink-0 text-vibe-muted" />
              <span className="min-w-0 flex-1 truncate">
                Resources reflect <span className="font-medium">{profile.folderName}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <Icon name="AlertTriangle" size={15} className="shrink-0" />
              <span>No project selected — resources and tools return empty until you pick one.</span>
            </div>
          )}
        </section>

        <section>
          <div className="rounded-xl border border-vibe-border bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
            >
              <Icon name={setupOpen ? 'ChevronDown' : 'ChevronRight'} size={14} className="text-vibe-muted" />
              <Icon name="ListChecks" size={14} className="text-vibe-muted" />
              <span className="font-medium text-vibe-text">Connect Cursor in 4 steps</span>
            </button>
            {setupOpen && (
              <ol className="space-y-2 border-t border-vibe-border px-3 py-2.5 text-[11px] leading-relaxed text-vibe-muted">
                <li>
                  <span className="font-medium text-vibe-text">1.</span> Enable the MCP server above —
                  status should read Running.
                </li>
                <li>
                  <span className="font-medium text-vibe-text">2.</span> Copy the mcp.json snippet.
                </li>
                <li>
                  <span className="font-medium text-vibe-text">3.</span> Merge it into{' '}
                  <code className="rounded bg-white/10 px-1">%USERPROFILE%\.cursor\mcp.json</code> (or a
                  project-level <code className="rounded bg-white/10 px-1">.cursor/mcp.json</code>).
                </li>
                <li>
                  <span className="font-medium text-vibe-text">4.</span> Restart Cursor or reload MCP
                  servers, then keep VibeBar open.
                </li>
              </ol>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vibe-muted">
            Automation
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-vibe-text">Auto-pin Fix with Context</span>
              <p className="text-[11px] text-vibe-muted">
                When Fix with Context copies, pin the session entry for handoff.
              </p>
            </div>
            <Toggle
              checked={settings.autoPinFixWithContext ?? false}
              onChange={(next) => void save({ autoPinFixWithContext: next })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-vibe-text">Paste clipboard after opening Cursor</span>
              <p className="text-[11px] text-vibe-muted">
                Opt-in one-shot paste when you tap Open Cursor or Quick Launch after a recent copy.
              </p>
            </div>
            <Toggle
              checked={pasteEnabled}
              onChange={(next) => void save({ pasteAfterOpenCursor: next })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-vibe-text">Pre-paste safety gate</span>
              <p className="text-[11px] text-vibe-muted">
                Scan clipboard for secrets, oversized prompts, and risky shell patterns before paste.
              </p>
            </div>
            <Toggle
              checked={settings.prePasteSafetyGate !== false && pasteEnabled}
              onChange={(next) => void save({ prePasteSafetyGate: next })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-vibe-text">Auto-run verify after Fix with Context</span>
              <p className="text-[11px] text-vibe-muted">
                Queue the suggested verify command in Smart Terminal after copying a fix bundle.
              </p>
            </div>
            <Toggle
              checked={settings.autoRunVerifyAfterFix ?? false}
              onChange={(next) => void save({ autoRunVerifyAfterFix: next })}
            />
          </div>
        </section>
      </div>

      {onPrepareCursor && (
        <div className="border-t border-vibe-border p-3">
          <button
            type="button"
            onClick={onPrepareCursor}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-vibe-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-vibe-accent/90"
          >
            <Icon name="MousePointer2" size={15} />
            Prepare Cursor
          </button>
        </div>
      )}
    </div>
  )
}
