import type { DisplayInfo } from '@shared/types.js'

export interface DisplayLike {
  id: number
  label?: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
}

export function toDisplayInfo(d: DisplayLike, primaryId: number, index: number): DisplayInfo {
  const isPrimary = d.id === primaryId
  const base = d.label && d.label.length > 0 ? d.label : `Display ${index + 1}`
  const label = `${base} (${d.bounds.width}\u00d7${d.bounds.height})${isPrimary ? ' \u2022 Primary' : ''}`
  return {
    id: String(d.id),
    label,
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    isPrimary
  }
}

export function mapDisplays(displays: DisplayLike[], primaryId: number): DisplayInfo[] {
  return displays.map((d, i) => toDisplayInfo(d, primaryId, i))
}

/**
 * Resolves which physical displays the overlay should appear on. An empty selection (or one
 * that no longer matches any connected display) falls back to the primary display, so the
 * toolbar is never stranded on a monitor that was unplugged.
 */
export function resolveEnabledDisplays(
  displays: DisplayLike[],
  enabledIds: string[],
  primaryId: number
): DisplayLike[] {
  const primary = displays.find((d) => d.id === primaryId) ?? displays[0]
  if (enabledIds.length === 0) return primary ? [primary] : []
  const selected = displays.filter((d) => enabledIds.includes(String(d.id)))
  if (selected.length === 0) return primary ? [primary] : []
  return selected
}
