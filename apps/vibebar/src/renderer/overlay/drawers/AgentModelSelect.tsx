import { useEffect, useRef, useState } from 'react'
import type { AgentCompanionModelOption } from '@shared/agentCompanionModels.js'
import { Icon } from '../../shared/icons'

export function AgentModelSelect({
  value,
  options,
  disabled,
  onChange
}: {
  value: string
  options: AgentCompanionModelOption[]
  disabled?: boolean
  onChange: (modelId: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected =
    options.find((option) => option.id === value) ?? ({ id: value, label: value } as AgentCompanionModelOption)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-[11.5rem] flex-1">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${selected.label}`}
        title={`Model: ${selected.label}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={`vibe-no-drag flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
          open
            ? 'border-vibe-accent/45 bg-vibe-accent/10 text-vibe-text shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
            : 'border-vibe-border bg-white/[0.04] text-vibe-text hover:border-white/15 hover:bg-white/[0.07]'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <Icon
          name="Sparkles"
          size={12}
          className={`shrink-0 ${open ? 'text-vibe-accent-2' : 'text-vibe-muted'}`}
        />
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        <Icon
          name="ChevronDown"
          size={12}
          className={`shrink-0 text-vibe-muted transition-transform ${open ? 'rotate-180 text-vibe-accent-2' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose agent model"
          className="agent-model-menu vibe-scroll absolute bottom-[calc(100%+6px)] left-0 z-50 max-h-52 w-full min-w-[10.5rem] overflow-y-auto rounded-xl border border-vibe-border bg-[#12151c]/98 p-1 shadow-[0_-10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const isSelected = option.id === value
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
                className={`vibe-no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors ${
                  isSelected
                    ? 'bg-vibe-accent/20 text-vibe-text'
                    : 'text-vibe-muted hover:bg-white/[0.06] hover:text-vibe-text'
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? 'border-vibe-accent-2/60 bg-vibe-accent/30 text-vibe-accent-2'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  {isSelected && <Icon name="Check" size={9} />}
                </span>
                <span className="min-w-0 flex-1 truncate leading-snug">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
