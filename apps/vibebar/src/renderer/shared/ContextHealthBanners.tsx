import type { ContextHealthWarning } from '@shared/contextHealth.js'
import { Icon } from './icons'

export function ContextHealthBanners({
  warnings,
  className = ''
}: {
  warnings: ContextHealthWarning[]
  className?: string
}): JSX.Element | null {
  if (warnings.length === 0) return null

  return (
    <div className={`space-y-1.5 ${className}`}>
      {warnings.map((warning) => (
        <div
          key={warning.id}
          className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90"
          role="status"
        >
          <Icon name="AlertTriangle" size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  )
}
