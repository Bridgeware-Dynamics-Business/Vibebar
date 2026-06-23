import { useCallback, useEffect, useState } from 'react'
import type { AuditConfigView } from '@shared/types.js'
import { Icon } from '../icons'

export function AuditConfigSection({ compact }: { compact?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<AuditConfigView | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setConfig(await window.vibebar.audit.getConfig())
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const toggleRule = useCallback(
    async (ruleId: string, disabled: boolean) => {
      setBusy(true)
      try {
        setConfig(await window.vibebar.audit.setRuleDisabled(ruleId, disabled))
      } finally {
        setBusy(false)
      }
    },
    []
  )

  if (config?.noProject) return <></>

  const textSize = compact ? 'text-[10px]' : 'text-xs'

  return (
    <div className={`rounded-xl border border-vibe-border bg-white/[0.02] ${compact ? '' : 'mx-4 mb-3'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left ${textSize}`}
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={14} className="text-vibe-muted" />
        <Icon name="SlidersHorizontal" size={14} className="text-vibe-muted" />
        <span className="font-medium text-vibe-text">Audit config</span>
        {config && (
          <span className="ml-auto text-vibe-muted">
            {config.baselineCount} baselined · {config.disabledCount} disabled
          </span>
        )}
      </button>
      {open && config && (
        <div className={`space-y-2 border-t border-vibe-border px-3 py-2 ${textSize}`}>
          <p className="text-vibe-muted">
            Tune rules in <span className="font-mono">.vibebar-audit.json</span>. Use Accept risk on a finding to
            mute it.
          </p>
          <div className="vibe-scroll max-h-40 space-y-1 overflow-y-auto">
            {config.rules.map((rule) => (
              <label
                key={rule.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={!rule.disabled}
                  disabled={busy}
                  onChange={() => void toggleRule(rule.id, !rule.disabled)}
                  className="accent-vibe-accent"
                />
                <span className={`font-mono ${rule.disabled ? 'text-vibe-muted line-through' : 'text-vibe-text'}`}>
                  {rule.id}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
