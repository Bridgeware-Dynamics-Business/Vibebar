import { createHash } from 'node:crypto'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { VerifyPinStatus } from '@shared/types.js'
import type { AnalyzeInput } from './outputAnalyzer.js'

export interface ParsedFailure {
  kind: 'vitest' | 'jest' | 'tsc' | 'pytest' | 'rust' | 'go' | 'generic'
  file?: string
  line?: number
  column?: number
  testName?: string
  assertion?: string
  message?: string
}

export interface StackFrame {
  file: string
  line: number
  column?: number
}

export interface StructuredParseResult {
  failures: ParsedFailure[]
  stackFrames: StackFrame[]
  /** Human-readable evidence block for prompts. */
  evidence: string
  /** Stable id for dismiss persistence across commands. */
  fingerprint: string
  primaryKind: ParsedFailure['kind'] | 'stack'
}

const VITEST_FAIL = /^\s*FAIL\s+(\S+.*?)(?:\s+>\s+(.+))?\s*$/
const VITEST_ASSERT = /^\s*(?:AssertionError|Error):\s*(.+)$/
const VITEST_LOC = /^\s*[❯›]\s+(\S+?):(\d+):(\d+)\s*$/

const JEST_FAIL = /^\s*FAIL\s+(\S+)/
const JEST_TEST = /^\s*[●✕]\s+(.+)$/
const JEST_EXPECT = /^\s*(?:Expected|Received|expect\(.+\)|Error:\s*expect)/i

const TSC_ERROR = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/
const TSC_ERROR_ALT = /^error\s+(TS\d+):\s*(.+)$/

const PYTEST_FAIL = /^FAILED\s+(\S+::\S+)/
const PYTEST_FILE_LINE = /^File "([^"]+)", line (\d+)/
const RUST_ERROR = /^error\[E\d+\]/
const RUST_LOC = /^\s*-->\s+(\S+):(\d+):(\d+)/
const GO_FAIL = /^--- FAIL:\s+(\S+)/
const GO_FILE_LINE = /^\s+(\S+_test\.go):(\d+):/

const STACK_AT = /^\s*at\s+(?:.+?\s+\()?([^\s(]+):(\d+):(\d+)\)?/
const STACK_AT_BARE = /^\s*at\s+([^\s(]+):(\d+):(\d+)\s*$/

function normalizeFrameFile(raw: string): string | null {
  const file = raw.replace(/^file:\/\//, '').replace(/\\/g, '/')
  if (!file || file.startsWith('node:') || file.startsWith('internal/')) return null
  if (file.includes('<') || file.includes('webpack:')) return null
  return file
}

/** Extracts `at file.ts:line:col` frames from mixed terminal output. */
export function extractStackFrames(text: string): StackFrame[] {
  const frames: StackFrame[] = []
  const seen = new Set<string>()
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(STACK_AT) ?? line.match(STACK_AT_BARE)
    if (!m) continue
    const file = normalizeFrameFile(m[1])
    if (!file) continue
    const lineNo = Number(m[2])
    const col = Number(m[3])
    if (!Number.isFinite(lineNo)) continue
    const key = `${file}:${lineNo}:${col}`
    if (seen.has(key)) continue
    seen.add(key)
    frames.push({ file, line: lineNo, column: Number.isFinite(col) ? col : undefined })
  }
  return frames
}

function parseVitest(text: string): ParsedFailure[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const failures: ParsedFailure[] = []
  let current: ParsedFailure | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fail = line.match(VITEST_FAIL)
    if (fail) {
      if (current) failures.push(current)
      current = {
        kind: 'vitest',
        file: fail[1]?.trim(),
        testName: fail[2]?.trim()
      }
      continue
    }
    if (!current) continue
    const assert = line.match(VITEST_ASSERT)
    if (assert) {
      current.message = assert[1]?.trim()
      continue
    }
    const loc = line.match(VITEST_LOC)
    if (loc) {
      current.file = loc[1]
      current.line = Number(loc[2])
      current.column = Number(loc[3])
      continue
    }
    if (!current.assertion && /expected|received|assert/i.test(line)) {
      current.assertion = line.trim()
    }
  }
  if (current) failures.push(current)
  return failures
}

function parseJest(text: string): ParsedFailure[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const failures: ParsedFailure[] = []
  let current: ParsedFailure | null = null

  for (const line of lines) {
    const fail = line.match(JEST_FAIL)
    if (fail) {
      if (current) failures.push(current)
      current = { kind: 'jest', file: fail[1]?.trim() }
      continue
    }
    if (!current) continue
    const test = line.match(JEST_TEST)
    if (test) {
      current.testName = test[1]?.trim()
      continue
    }
    if (JEST_EXPECT.test(line)) {
      current.assertion = current.assertion ? `${current.assertion}\n${line.trim()}` : line.trim()
    }
  }
  if (current) failures.push(current)
  return failures
}

function parsePytest(text: string): ParsedFailure[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const failures: ParsedFailure[] = []
  let current: ParsedFailure | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fail = line.match(PYTEST_FAIL)
    if (fail) {
      if (current) failures.push(current)
      const id = fail[1]?.trim() ?? ''
      const parts = id.split('::')
      current = {
        kind: 'pytest',
        file: parts[0],
        testName: parts.slice(1).join('::') || id
      }
      continue
    }
    if (!current) continue
    const loc = line.match(PYTEST_FILE_LINE)
    if (loc) {
      current.file = loc[1]?.replace(/\\/g, '/')
      current.line = Number(loc[2])
    }
    if (!current.message && /AssertionError|E\s+assert/i.test(line)) {
      current.message = line.trim()
    }
  }
  if (current) failures.push(current)
  return failures
}

function parseRust(text: string): ParsedFailure[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const failures: ParsedFailure[] = []
  let current: ParsedFailure | null = null

  for (const line of lines) {
    if (RUST_ERROR.test(line)) {
      if (current) failures.push(current)
      current = { kind: 'rust', message: line.trim() }
      continue
    }
    if (!current) continue
    const loc = line.match(RUST_LOC)
    if (loc) {
      current.file = loc[1]?.replace(/\\/g, '/')
      current.line = Number(loc[2])
      current.column = Number(loc[3])
    }
  }
  if (current) failures.push(current)
  return failures
}

function parseGo(text: string): ParsedFailure[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const failures: ParsedFailure[] = []
  let current: ParsedFailure | null = null

  for (const line of lines) {
    const fail = line.match(GO_FAIL)
    if (fail) {
      if (current) failures.push(current)
      current = { kind: 'go', testName: fail[1]?.trim() }
      continue
    }
    if (!current) continue
    const loc = line.match(GO_FILE_LINE)
    if (loc) {
      current.file = loc[1]?.replace(/\\/g, '/')
      current.line = Number(loc[2])
    }
  }
  if (current) failures.push(current)
  return failures
}

function parseTsc(text: string): ParsedFailure[] {
  const failures: ParsedFailure[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(TSC_ERROR)
    if (m) {
      failures.push({
        kind: 'tsc',
        file: m[1]?.replace(/\\/g, '/'),
        line: Number(m[2]),
        column: Number(m[3]),
        message: `TS${m[4]?.replace(/^TS/, '')}: ${m[5]?.trim()}`
      })
      continue
    }
    const alt = line.match(TSC_ERROR_ALT)
    if (alt) {
      const next = lines[i + 1]?.trim()
      const loc = next?.match(/^(\S+?):(\d+):(\d+)/)
      failures.push({
        kind: 'tsc',
        file: loc?.[1]?.replace(/\\/g, '/'),
        line: loc ? Number(loc[2]) : undefined,
        column: loc ? Number(loc[3]) : undefined,
        message: alt[0]?.trim()
      })
    }
  }
  return failures
}

function buildEvidence(failures: ParsedFailure[], stackFrames: StackFrame[]): string {
  const parts: string[] = []
  for (const f of failures.slice(0, 5)) {
    const header = [f.file, f.testName].filter(Boolean).join(' › ')
    if (header) parts.push(header)
    if (f.message) parts.push(f.message)
    if (f.assertion) parts.push(f.assertion)
    if (f.line != null) parts.push(`  at ${f.file}:${f.line}${f.column != null ? `:${f.column}` : ''}`)
  }
  if (parts.length === 0 && stackFrames.length > 0) {
    for (const frame of stackFrames.slice(0, 8)) {
      parts.push(`  at ${frame.file}:${frame.line}${frame.column != null ? `:${frame.column}` : ''}`)
    }
  }
  return parts.join('\n').trim()
}

function fingerprintFor(failures: ParsedFailure[], stackFrames: StackFrame[], kind: string): string {
  const bits: string[] = [kind]
  for (const f of failures.slice(0, 3)) {
    bits.push(f.kind, f.file ?? '', String(f.line ?? ''), f.testName ?? '', f.message ?? '')
  }
  if (failures.length === 0) {
    for (const frame of stackFrames.slice(0, 3)) {
      bits.push(frame.file, String(frame.line))
    }
  }
  return bits.join('|').slice(0, 512)
}

/**
 * Stack-aware structured parse keyed off project profile. Returns null when nothing structured
 * was found (caller should fall back to regex rules in outputAnalyzer).
 */
export function parseStructuredOutput(
  input: AnalyzeInput,
  profile: ProjectProfile | null
): StructuredParseResult | null {
  const text = input.output ?? ''
  if (!text.trim()) return null

  const stackFrames = extractStackFrames(text)
  const testRunner = profile?.testRunner ?? 'unknown'
  const language = profile?.language ?? 'unknown'

  let failures: ParsedFailure[] = []
  let primaryKind: StructuredParseResult['primaryKind'] = 'generic'

  if (testRunner === 'vitest' || /\bFAIL\s+.+\.test\./i.test(text) || text.includes('AssertionError')) {
    failures = parseVitest(text)
    if (failures.length > 0) primaryKind = 'vitest'
  }
  if (failures.length === 0 && (testRunner === 'jest' || /\bFAIL\s+\S+\.test\./i.test(text))) {
    failures = parseJest(text)
    if (failures.length > 0) primaryKind = 'jest'
  }
  if (
    failures.length === 0 &&
    (language === 'typescript' || /error TS\d{3,5}:/i.test(text))
  ) {
    failures = parseTsc(text)
    if (failures.length > 0) primaryKind = 'tsc'
  }
  if (
    failures.length === 0 &&
    (testRunner === 'pytest' || language === 'python' || /^FAILED\s+\S+::/m.test(text))
  ) {
    failures = parsePytest(text)
    if (failures.length > 0) primaryKind = 'pytest'
  }
  if (failures.length === 0 && (language === 'rust' || /^error\[E\d+\]/m.test(text))) {
    failures = parseRust(text)
    if (failures.length > 0) primaryKind = 'rust'
  }
  if (
    failures.length === 0 &&
    (language === 'go' || /^--- FAIL:\s+/m.test(text) || /_test\.go:\d+:/m.test(text))
  ) {
    failures = parseGo(text)
    if (failures.length > 0) primaryKind = 'go'
  }

  if (failures.length === 0 && stackFrames.length === 0) return null
  if (failures.length === 0 && stackFrames.length > 0) primaryKind = 'stack'

  const evidence = buildEvidence(failures, stackFrames)
  if (!evidence) return null

  return {
    failures,
    stackFrames,
    evidence,
    fingerprint: fingerprintFor(failures, stackFrames, primaryKind),
    primaryKind
  }
}

export type VerifyOutcomeKind = 'passed' | 'failed' | 'inconclusive'

export interface VerifyParseResult {
  outcome: VerifyOutcomeKind
  /** True when structured or generic parsers found failure patterns in output. */
  hasFailurePatterns: boolean
  verifyStatus: VerifyPinStatus | null
  primaryKind?: ParsedFailure['kind'] | 'stack' | 'generic'
  outputHash: string
}

/** Stable short hash of terminal output for verify dedup / flight records. */
export function hashTerminalOutput(output: string): string {
  return createHash('sha256').update(output).digest('hex').slice(0, 16)
}

const GENERIC_VERIFY_FAIL =
  /\bFAIL\b|\d+\s+failed\b|Tests:\s+\d+\s+failed|Test Files\s+\d+\s+failed|error TS\d{3,5}:|^FAILED\s+\S+::|^--- FAIL:\s+|^error\[E\d+\]/im

function genericFailurePatterns(text: string): boolean {
  return GENERIC_VERIFY_FAIL.test(text)
}

/**
 * Parses verify/test command output for pass/fail — not exit code alone.
 * `still-broken` when failure patterns appear even if exit code is 0 (documented limitation).
 */
export function parseVerifyOutcome(
  input: Pick<AnalyzeInput, 'command' | 'output' | 'exitCode'>,
  profile: ProjectProfile | null
): VerifyParseResult {
  const output = input.output ?? ''
  const outputHash = hashTerminalOutput(output)
  const structured = parseStructuredOutput(input, profile)
  const hasStructuredFailures = (structured?.failures.length ?? 0) > 0
  const hasFailurePatterns = hasStructuredFailures || genericFailurePatterns(output)

  if (hasFailurePatterns) {
    return {
      outcome: 'failed',
      hasFailurePatterns: true,
      verifyStatus: 'still-broken',
      primaryKind: structured?.primaryKind ?? 'generic',
      outputHash
    }
  }

  if (input.exitCode === 0) {
    return {
      outcome: 'passed',
      hasFailurePatterns: false,
      verifyStatus: 'verified',
      outputHash
    }
  }

  if (input.exitCode != null && input.exitCode !== 0) {
    return {
      outcome: 'failed',
      hasFailurePatterns: false,
      verifyStatus: 'still-broken',
      outputHash
    }
  }

  return {
    outcome: 'inconclusive',
    hasFailurePatterns: false,
    verifyStatus: null,
    outputHash
  }
}
