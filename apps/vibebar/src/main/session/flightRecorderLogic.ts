import type {
  FlightAuditRecord,
  FlightCommandRecord,
  FlightFileSnapshot,
  FlightRecorderData,
  FlightLogView,
  LastGreenState
} from '@shared/types.js'

export const FLIGHT_MAX_COMMANDS = 50
export const FLIGHT_MAX_AUDITS = 20
export const FLIGHT_MAX_SNAPSHOTS = 10
export const FLIGHT_RECENT_UI = 8

export function emptyFlightData(): FlightRecorderData {
  return { commands: [], audits: [], snapshots: [], lastGreen: null }
}

/** Heuristic: command looks like a test or verify run. */
export function looksLikeVerifyCommand(command: string): boolean {
  const c = command.trim().toLowerCase()
  return (
    /\b(npm|pnpm|yarn|npx)\s+(run\s+)?(test|lint|typecheck|check|verify)\b/.test(c) ||
    /\b(vitest|jest|pytest|go test|cargo test)\b/.test(c) ||
    /\btsc\b/.test(c) ||
    /\beslint\b/.test(c)
  )
}

export function trimFlightData(data: FlightRecorderData): FlightRecorderData {
  return {
    commands: data.commands.slice(-FLIGHT_MAX_COMMANDS),
    audits: data.audits.slice(-FLIGHT_MAX_AUDITS),
    snapshots: data.snapshots.slice(-FLIGHT_MAX_SNAPSHOTS),
    lastGreen: data.lastGreen
  }
}

export function appendCommandRecord(
  data: FlightRecorderData,
  command: string,
  exitCode: number | null
): FlightRecorderData {
  const record: FlightCommandRecord = {
    command: command.trim(),
    exitCode,
    timestamp: Date.now(),
    isTest: looksLikeVerifyCommand(command)
  }
  return trimFlightData({
    ...data,
    commands: [...data.commands, record]
  })
}

export function appendAuditRecord(
  data: FlightRecorderData,
  audit: FlightAuditRecord
): FlightRecorderData {
  return trimFlightData({
    ...data,
    audits: [...data.audits, audit]
  })
}

export function appendSnapshot(
  data: FlightRecorderData,
  snapshot: FlightFileSnapshot
): FlightRecorderData {
  return trimFlightData({
    ...data,
    snapshots: [...data.snapshots, snapshot]
  })
}

/** Updates last-green when a verify/test command exits 0. */
export function updateLastGreen(
  data: FlightRecorderData,
  command: string,
  exitCode: number | null,
  changedFiles: string[]
): FlightRecorderData {
  if (exitCode !== 0 || !looksLikeVerifyCommand(command)) return data

  const prev = data.lastGreen
  const filesChangedSince =
    prev != null
      ? changedFiles.filter((f) => !prev.filesAtGreen.includes(f))
      : []

  const lastGreen: LastGreenState = {
    command: command.trim(),
    timestamp: Date.now(),
    filesAtGreen: [...changedFiles],
    filesChangedSince
  }

  return { ...data, lastGreen }
}

/** Refreshes filesChangedSince on last green when the working tree changes. */
export function refreshLastGreenDelta(
  lastGreen: LastGreenState | null,
  changedFiles: string[]
): LastGreenState | null {
  if (!lastGreen) return null
  return {
    ...lastGreen,
    filesChangedSince: changedFiles.filter((f) => !lastGreen.filesAtGreen.includes(f))
  }
}

export function buildFlightLogView(data: FlightRecorderData | null | undefined): FlightLogView | null {
  if (!data || (data.commands.length === 0 && !data.lastGreen && data.audits.length === 0)) {
    return null
  }
  return {
    recentCommands: data.commands.slice(-FLIGHT_RECENT_UI).reverse(),
    lastGreen: data.lastGreen,
    lastAudit: data.audits.length > 0 ? data.audits[data.audits.length - 1]! : null
  }
}

export function formatLastGreenExcerpt(lastGreen: LastGreenState | null): string[] {
  if (!lastGreen) return []
  const when = new Date(lastGreen.timestamp).toLocaleString()
  const lines: string[] = [
    '## Last green verify',
    '',
    `Last passing command: \`${lastGreen.command}\` at ${when}.`
  ]
  if (lastGreen.filesChangedSince.length > 0) {
    const list = lastGreen.filesChangedSince.slice(0, 16).join(', ')
    lines.push(
      `Files changed since (${lastGreen.filesChangedSince.length}): ${list}${lastGreen.filesChangedSince.length > 16 ? '…' : ''}`
    )
  } else {
    lines.push('No file changes detected since that run.')
  }
  lines.push('')
  return lines
}
