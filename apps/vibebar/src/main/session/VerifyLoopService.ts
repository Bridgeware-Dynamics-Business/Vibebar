import type { SessionAppendInput, SessionEntry, VerifyPinStatus } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { generateProjectCommands } from '../terminal/projectCommands.js'
import { suggestVerifyCommand } from '../terminal/fixWithContext.js'
import type { SessionService } from './SessionService.js'

/**
 * Minimal verify loop: attach a verify command to fix copies, compare re-runs, update pin status.
 */
export class VerifyLoopService {
  private pendingEntryId: string | null = null
  private pendingCommand: string | null = null

  constructor(
    private readonly session: SessionService,
    private readonly projects: ProjectService
  ) {}

  /** Suggests a verify command for a newly appended fix entry. */
  async suggestForAppend(input: SessionAppendInput): Promise<string | null> {
    if (input.type !== 'terminal-issue' && input.type !== 'audit-finding') return null
    if (input.verifyCommand) return input.verifyCommand
    if (input.title.includes('behavioral test')) return null

    const profile = this.projects.getProfile()
    const commands = await generateProjectCommands(profile)
    const intent = (await this.session.readExtended()).intent
    if (intent?.verifyCommand) return intent.verifyCommand

    const failureKind =
      input.type === 'terminal-issue' && input.command
        ? input.command.includes('tsc')
          ? 'tsc'
          : 'test-failure'
        : null
    return suggestVerifyCommand(commands, failureKind)
  }

  enrichAppendInput(
    input: SessionAppendInput,
    verifyCommand: string | null
  ): SessionAppendInput {
    if (!verifyCommand || (input.type !== 'terminal-issue' && input.type !== 'audit-finding')) {
      return input
    }
    if (input.title.includes('behavioral test')) return input
    return { ...input, verifyCommand, verifyStatus: 'awaiting' as VerifyPinStatus }
  }

  /** Marks a pending verify run (set before terminal.run). */
  markPending(entryId: string, command: string): void {
    this.pendingEntryId = entryId
    this.pendingCommand = command.trim()
  }

  clearPending(): void {
    this.pendingEntryId = null
    this.pendingCommand = null
  }

  /** Called when any terminal command completes — updates matching verify pin. */
  async onCommandComplete(command: string, exitCode: number | null): Promise<void> {
    const trimmed = command.trim()
    let entryId = this.pendingEntryId
    let matched = entryId != null && this.pendingCommand === trimmed

    if (!matched) {
      const ext = await this.session.readExtended()
      const awaiting = ext.entries.find(
        (e) =>
          e.pinned &&
          (e.type === 'terminal-issue' || e.type === 'audit-finding') &&
          e.verifyCommand?.trim() === trimmed &&
          e.verifyStatus !== 'verified'
      )
      if (awaiting) {
        entryId = awaiting.id
        matched = true
      }
    }

    if (!matched || !entryId) {
      this.clearPending()
      return
    }

    const status: VerifyPinStatus = exitCode === 0 ? 'verified' : 'still-broken'
    await this.session.updateEntryVerify(entryId, { verifyStatus: status })
    this.clearPending()
  }

  async attachVerifyToEntry(entryId: string, command: string): Promise<SessionEntry | null> {
    return this.session.updateEntryVerify(entryId, {
      verifyCommand: command,
      verifyStatus: 'awaiting'
    })
  }
}
