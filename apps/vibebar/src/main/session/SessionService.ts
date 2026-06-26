import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { clipboard } from 'electron'
import { buildContext } from '@vibebar/prompt-engine'
import type {
  SessionAppendInput,
  SessionEntry,
  SessionHandoffResult,
  SessionState,
  IntentContract,
  FlightRecorderData,
  VerifyPinStatus
} from '@shared/types.js'
import { readChangedFilePaths, readGitDiff } from '../git/gitDiff.js'
import { readGitStatus } from '../git/gitStatus.js'
import type { ProjectService } from '../project/ProjectService.js'
import { scanText } from '../scanner/secretScanner.js'
import { buildFlightLogView, formatLastGreenExcerpt } from './flightRecorderLogic.js'
import { formatIntentSection } from './intentContract.js'

const SESSION_DIR = '.vibebar'
const SESSION_FILE = 'session.json'
const FULL_TEXT_MAX = 8192
const AGENTS_MD_HEADER_MAX = 2048
const CURSOR_RULE_HEADER_MAX = 2048
/** Matches Session Hub UI cap — persisted file is pruned to this count. */
export const SESSION_MAX_ENTRIES = 100
/** Default number of recent copies to pin when handoff has no pins. */
export const SESSION_PIN_RECENT_DEFAULT = 3

export interface SessionFile {
  entries: SessionEntry[]
  flight?: FlightRecorderData
  intent?: IntentContract | null
}

/** Truncates stored full text to the session handoff cap. */
export function clipSessionFullText(text: string): string {
  if (text.length <= FULL_TEXT_MAX) return text
  return `${text.slice(0, FULL_TEXT_MAX)}\n…(truncated at ${FULL_TEXT_MAX} chars)`
}

function entryFingerprint(entry: SessionEntry): string {
  const content =
    entry.fullText ??
    (entry.type === 'note' ? entry.text : undefined) ??
    (entry.type === 'audit-finding' ? entry.fixExcerpt : undefined) ??
    entry.title
  return `${entry.type}|${entry.title}|${content.slice(0, 200)}`
}

/** Keeps newest entries, drops duplicates (same type/title/content prefix). */
export function normalizeSessionEntries(entries: SessionEntry[]): SessionEntry[] {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp)
  const seen = new Set<string>()
  const deduped: SessionEntry[] = []
  for (const entry of sorted) {
    const fp = entryFingerprint(entry)
    if (seen.has(fp)) continue
    seen.add(fp)
    deduped.push(entry)
  }
  return deduped.slice(0, SESSION_MAX_ENTRIES)
}

/**
 * Project-local session timeline stored at `<projectRoot>/.vibebar/session.json`.
 * Tracks prompts copied, git diffs, audit/terminal issues, and notes for handoff bundles.
 */
export class SessionService {
  private readonly projects: ProjectService

  constructor(projects: ProjectService) {
    this.projects = projects
  }

  private root(): string | null {
    return this.projects.getProfile()?.rootPath ?? null
  }

  /** Exposed for flight recorder / verify loop when project root is needed. */
  projectRoot(): string | null {
    return this.root()
  }

  private sessionPath(root: string): string {
    return join(root, SESSION_DIR, SESSION_FILE)
  }

  private emptyState(noProject: boolean): SessionState {
    return { entries: [], noProject, pinnedCount: 0, intent: null, flight: null }
  }

  private withMeta(entries: SessionEntry[], noProject: boolean, file: SessionFile): SessionState {
    return {
      entries,
      noProject,
      pinnedCount: entries.filter((e) => e.pinned).length,
      intent: file.intent ?? null,
      flight: buildFlightLogView(file.flight)
    }
  }

  private async readFile(root: string): Promise<SessionFile> {
    try {
      const raw = await readFile(this.sessionPath(root), 'utf8')
      const parsed = JSON.parse(raw) as Partial<SessionFile>
      const entries = Array.isArray(parsed.entries) ? parsed.entries : []
      const normalized = normalizeSessionEntries(entries)
      const file: SessionFile = {
        entries: normalized,
        flight: parsed.flight,
        intent: parsed.intent ?? null
      }
      if (normalized.length !== entries.length) {
        await this.writeFile(root, file)
      }
      return file
    } catch {
      return { entries: [], intent: null }
    }
  }

  /** Reads full session file including flight + intent (for main-process services). */
  async readExtended(): Promise<SessionFile> {
    const root = this.root()
    if (!root) return { entries: [], intent: null }
    return this.readFile(root)
  }

  async writeFlight(flight: FlightRecorderData): Promise<void> {
    const root = this.root()
    if (!root) return
    const data = await this.readFile(root)
    await this.writeFile(root, { ...data, flight })
  }

  private async writeFile(root: string, data: SessionFile): Promise<void> {
    await mkdir(join(root, SESSION_DIR), { recursive: true })
    const normalized: SessionFile = {
      entries: normalizeSessionEntries(data.entries),
      flight: data.flight,
      intent: data.intent ?? null
    }
    await writeFile(this.sessionPath(root), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  }

  async getIntent(): Promise<IntentContract | null> {
    const root = this.root()
    if (!root) return null
    const data = await this.readFile(root)
    return data.intent ?? null
  }

  async setIntent(intent: Omit<IntentContract, 'updatedAt'>): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    const data = await this.readFile(root)
    data.intent = { ...intent, updatedAt: Date.now() }
    await this.writeFile(root, data)
    return this.getState()
  }

  async clearIntent(): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    const data = await this.readFile(root)
    data.intent = null
    await this.writeFile(root, data)
    return this.getState()
  }

  async updateEntryVerify(
    entryId: string,
    patch: { verifyCommand?: string; verifyStatus?: VerifyPinStatus }
  ): Promise<SessionEntry | null> {
    const root = this.root()
    if (!root) return null

    const data = await this.readFile(root)
    const entry = data.entries.find((e) => e.id === entryId)
    if (!entry) return null
    if (patch.verifyCommand !== undefined) entry.verifyCommand = patch.verifyCommand
    if (patch.verifyStatus !== undefined) entry.verifyStatus = patch.verifyStatus
    await this.writeFile(root, data)
    return entry
  }

  async getState(): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)
    const data = await this.readFile(root)
    const entries = [...data.entries].sort((a, b) => b.timestamp - a.timestamp)
    return this.withMeta(entries, false, data)
  }

  async append(input: SessionAppendInput): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    const data = await this.readFile(root)
    const clipped =
      input.fullText !== undefined
        ? { ...input, fullText: clipSessionFullText(input.fullText) }
        : input
    const entry = {
      id: randomUUID(),
      timestamp: Date.now(),
      pinned: false,
      ...clipped
    } as SessionEntry
    data.entries.push(entry)
    await this.writeFile(root, data)
    return this.getState()
  }

  /** Pins the N most recent entries when nothing is pinned yet (handoff smart default). */
  async pinRecentIfNonePinned(count: number): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    const data = await this.readFile(root)
    if (data.entries.some((e) => e.pinned)) return this.getState()

    const n = Math.max(1, Math.min(count, SESSION_MAX_ENTRIES))
    const recent = [...data.entries].sort((a, b) => b.timestamp - a.timestamp).slice(0, n)
    const recentIds = new Set(recent.map((e) => e.id))
    for (const entry of data.entries) {
      if (recentIds.has(entry.id)) entry.pinned = true
    }
    await this.writeFile(root, data)
    return this.getState()
  }

  async togglePin(id: string): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    const data = await this.readFile(root)
    const entry = data.entries.find((e) => e.id === id)
    if (entry) entry.pinned = !entry.pinned
    await this.writeFile(root, data)
    return this.getState()
  }

  async clear(): Promise<SessionState> {
    const root = this.root()
    if (!root) return this.emptyState(true)

    if (existsSync(this.sessionPath(root))) {
      const data = await this.readFile(root)
      await this.writeFile(root, { entries: [], flight: data.flight, intent: data.intent ?? null })
    }
    return this.getState()
  }

  private entryContent(entry: SessionEntry): string {
    if (entry.fullText) return entry.fullText
    switch (entry.type) {
      case 'note':
        return entry.text
      case 'audit-finding':
        return entry.fixExcerpt ?? `[${entry.severity}] ${entry.title}`
      case 'terminal-issue':
        return entry.command ? `Command: ${entry.command}\n${entry.title}` : entry.title
      case 'prompt':
        return `(Prompt ${entry.promptId} — full text not captured)`
      case 'git-diff':
        return '(Git diff prompt — full text not captured; use Pack changed or copy diff again)'
    }
  }

  private typeLabel(entry: SessionEntry): string {
    switch (entry.type) {
      case 'prompt':
        return 'Prompt'
      case 'terminal-issue':
        return 'Terminal'
      case 'audit-finding':
        return 'Audit'
      case 'note':
        return 'Note'
      case 'git-diff':
        return 'Git'
    }
  }

  private async buildHandoffLines(includeGitDiff: boolean): Promise<{
    lines: string[]
    pinned: SessionEntry[]
    noProject: boolean
  }> {
    const profile = this.projects.getProfile()
    const root = profile?.rootPath ?? null
    if (!root) return { lines: [], pinned: [], noProject: true }

    const data = await this.readFile(root)
    const pinned = data.entries.filter((e) => e.pinned).sort((a, b) => a.timestamp - b.timestamp)
    const aiDocs = await this.projects.getAiDocs()
    const intent = data.intent ?? null

    const lines: string[] = ['# VibeBar Session Handoff', '']

    lines.push(...formatIntentSection(intent))

    if (profile) {
      const ctx = buildContext(profile)
      const label = profile.folderName || `my ${String(ctx.framework)} project`
      lines.push(`Project: ${label}`)
      lines.push(`Stack: ${String(ctx.language)} · ${String(ctx.framework)}`)
      lines.push('')
    }

    if (aiDocs.agentsMd) {
      const excerpt =
        aiDocs.agentsMd.length <= AGENTS_MD_HEADER_MAX
          ? aiDocs.agentsMd
          : `${aiDocs.agentsMd.slice(0, AGENTS_MD_HEADER_MAX)}\n…(truncated)`
      lines.push('## Project AI context (AGENTS.md excerpt)')
      lines.push('')
      lines.push(excerpt.trim())
      lines.push('')
    }

    if (aiDocs.cursorRules.length > 0) {
      lines.push('## Project AI context (.cursor/rules excerpts)')
      lines.push('')
      for (const rule of aiDocs.cursorRules.slice(0, 8)) {
        const excerpt =
          rule.content.length <= CURSOR_RULE_HEADER_MAX
            ? rule.content
            : `${rule.content.slice(0, CURSOR_RULE_HEADER_MAX)}\n…(truncated)`
        lines.push(`### ${rule.name}`)
        lines.push('')
        lines.push(excerpt.trim())
        lines.push('')
      }
    }

    lines.push('## Pinned items')
    lines.push('')

    if (pinned.length === 0) {
      lines.push('_No pinned items yet — pin prompts, findings, or diffs in Session Hub first._')
      lines.push('')
    }

    pinned.forEach((entry, i) => {
      lines.push(`### ${i + 1}. [${this.typeLabel(entry)}] ${entry.title}`)
      if (entry.type === 'audit-finding' && entry.file) {
        lines.push(`File: ${entry.file}`)
      }
      if (entry.type === 'terminal-issue' && entry.command) {
        lines.push(`Command: \`${entry.command}\``)
      }
      if (entry.verifyCommand) {
        const tag =
          entry.verifyStatus === 'verified'
            ? 'verified'
            : entry.verifyStatus === 'still-broken'
              ? 'still broken'
              : 'awaiting verify'
        lines.push(`Verify: \`${entry.verifyCommand}\` (${tag})`)
      }
      lines.push('')
      lines.push(this.entryContent(entry))
      lines.push('')
    })

    lines.push('## Suggested next steps')
    lines.push('')
    lines.push('- Continue from the pinned context above — iterate, verify in terminal, keep changes scoped.')
    if (pinned.some((e) => e.type === 'audit-finding' || e.type === 'terminal-issue')) {
      lines.push('- Run tests after fixes; re-run the security audit to confirm findings resolve.')
    }
    if (pinned.some((e) => e.type === 'git-diff' || e.type === 'prompt')) {
      lines.push('- Review git diff and ensure changes match the original intent.')
    }
    lines.push('')

    lines.push(...formatLastGreenExcerpt(data.flight?.lastGreen ?? null))

    if (includeGitDiff) {
      const { staged, unstaged, hasChanges } = await readGitDiff(root)
      if (hasChanges) {
        const changed = await readChangedFilePaths(root)
        const status = await readGitStatus(root)
        lines.push('## Git working tree summary')
        lines.push('')
        if (status.branch) lines.push(`Branch: ${status.branch}`)
        lines.push(
          `Changed files (${changed.length}): ${changed.slice(0, 24).join(', ')}${changed.length > 24 ? '…' : ''}`
        )
        if (staged) {
          lines.push('')
          lines.push('### Staged diff (truncated)')
          lines.push('```diff')
          lines.push(staged.slice(0, 12_000))
          lines.push('```')
        }
        if (unstaged) {
          lines.push('')
          lines.push('### Unstaged diff (truncated)')
          lines.push('```diff')
          lines.push(unstaged.slice(0, 12_000))
          lines.push('```')
        }
        lines.push('')
      }
    }

    return { lines, pinned, noProject: false }
  }

  async buildHandoffPrompt(includeGitDiff = true): Promise<SessionHandoffResult> {
    const { lines, pinned, noProject } = await this.buildHandoffLines(includeGitDiff)
    if (noProject) {
      return { copied: false, text: '', findings: [], noProject: true, pinnedCount: 0 }
    }

    const raw = lines.join('\n').trimEnd() + '\n'
    const scan = scanText(raw)
    let copied = false
    try {
      clipboard.writeText(scan.redactedText)
      copied = true
    } catch {
      copied = false
    }

    return {
      copied,
      text: scan.redactedText,
      findings: scan.findings,
      noProject: false,
      pinnedCount: pinned.length
    }
  }

  /** Copies only pinned audit/terminal fix prompts — separate from the narrative handoff. */
  async buildFixPromptsBundle(): Promise<SessionHandoffResult> {
    const root = this.root()
    if (!root) {
      return { copied: false, text: '', findings: [], noProject: true, pinnedCount: 0 }
    }

    const data = await this.readFile(root)
    const pinned = data.entries
      .filter((e) => e.pinned && (e.type === 'audit-finding' || e.type === 'terminal-issue'))
      .sort((a, b) => a.timestamp - b.timestamp)

    const lines: string[] = [
      '# VibeBar — pinned fix prompts',
      '',
      `${pinned.length} fix prompt(s) from your session. Work through each in order.`,
      ''
    ]

    pinned.forEach((entry, i) => {
      lines.push(`---\n\n## Fix ${i + 1}: ${entry.title}\n`)
      lines.push(this.entryContent(entry))
      lines.push('')
    })

    const raw = lines.join('\n').trimEnd() + '\n'
    const scan = scanText(raw)
    let copied = false
    try {
      clipboard.writeText(scan.redactedText)
      copied = true
    } catch {
      copied = false
    }

    return {
      copied,
      text: scan.redactedText,
      findings: scan.findings,
      noProject: false,
      pinnedCount: pinned.length
    }
  }
}
