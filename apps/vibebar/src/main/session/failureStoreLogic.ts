import type { TerminalFailureRecord } from '@shared/types.js'
import type { StackFrame } from '../terminal/terminalParsers.js'

export const FAILURE_MAX_RECORDS = 20
export const FAILURE_UI_RECENT = 5
export const FAILURE_RAW_OUTPUT_MAX = 4000

export function trimFailureOutput(output: string): string {
  const trimmed = output.trim()
  if (trimmed.length <= FAILURE_RAW_OUTPUT_MAX) return trimmed
  return `${trimmed.slice(-FAILURE_RAW_OUTPUT_MAX)}\n…(truncated)`
}

export function toFailureStackFrames(frames: StackFrame[]): TerminalFailureRecord['stackFrames'] {
  return frames.slice(0, 12).map((f) => ({
    file: f.file,
    line: f.line,
    column: f.column
  }))
}

export function appendFailureRecord(
  failures: TerminalFailureRecord[],
  record: TerminalFailureRecord
): TerminalFailureRecord[] {
  return [...failures, record].slice(-FAILURE_MAX_RECORDS)
}

export function recentFailuresForUi(
  failures: TerminalFailureRecord[] | null | undefined
): TerminalFailureRecord[] {
  if (!failures?.length) return []
  return [...failures].reverse().slice(0, FAILURE_UI_RECENT)
}
