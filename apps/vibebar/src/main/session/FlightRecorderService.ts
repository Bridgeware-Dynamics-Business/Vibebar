import type { ProjectProfile } from '@vibebar/project-detector'
import type { AuditReport } from '@shared/types.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import { readGitDiff } from '../git/gitDiff.js'
import type { CommandResult } from '../terminal/TerminalSession.js'
import { parseStructuredOutput, parseVerifyOutcome } from '../terminal/terminalParsers.js'
import type { SessionService } from './SessionService.js'
import { appendMistakes, detectMistakes } from './mistakeLedger.js'
import {
  appendFailureRecord,
  toFailureStackFrames,
  trimFailureOutput
} from './failureStoreLogic.js'
import {
  appendAuditRecord,
  appendCommandRecord,
  appendSnapshot,
  buildFlightLogView,
  emptyFlightData,
  looksLikeVerifyCommand,
  refreshLastGreenDelta,
  updateLastGreen
} from './flightRecorderLogic.js'

/**
 * Records terminal outcomes, audit runs, file snapshots, and failure black box into session.json.
 */
export class FlightRecorderService {
  constructor(
    private readonly session: SessionService,
    private readonly gitDiff: GitDiffService
  ) {}

  async recordCommand(
    command: string,
    exitCode: number | null,
    result?: CommandResult,
    profile?: ProjectProfile | null
  ): Promise<void> {
    const root = this.session.projectRoot()
    if (!root) return

    const ext = await this.session.readExtended()
    let data = ext.flight ?? emptyFlightData()

    const verify = looksLikeVerifyCommand(command)
      ? parseVerifyOutcome(
          { command, output: result?.output ?? '', exitCode },
          profile ?? null
        )
      : null

    data = appendCommandRecord(data, command, exitCode, verify?.outputHash)

    const changed = await this.gitDiff.changedFiles()
    data = appendSnapshot(data, {
      timestamp: Date.now(),
      reason: 'command',
      files: changed.slice(0, 64)
    })
    data = updateLastGreen(data, command, exitCode, changed, verify)
    if (data.lastGreen) {
      data = { ...data, lastGreen: refreshLastGreenDelta(data.lastGreen, changed) }
    }

    await this.session.writeFlight(data)

    await this.runMistakeDetection(changed, data.lastGreen ?? null)

    if (verify && looksLikeVerifyCommand(command)) {
      const status =
        verify.verifyStatus === 'verified'
          ? 'passed'
          : verify.verifyStatus === 'still-broken'
            ? 'failed'
            : 'inconclusive'
      await this.session.append({
        type: 'note',
        title: `Verify: ${command.trim().slice(0, 80)} (${status})`,
        noteId: 'verify-run',
        text: `Exit ${exitCode ?? '?'} · ${verify.primaryKind ?? 'generic'}`
      })
    }

    if (result && exitCode != null && exitCode !== 0 && profile) {
      await this.recordFailureFromResult(result, profile, ext.failures ?? [])
    }
  }

  private async recordFailureFromResult(
    result: CommandResult,
    profile: ProjectProfile,
    existing: import('@shared/types.js').TerminalFailureRecord[]
  ): Promise<void> {
    const structured = parseStructuredOutput(
      { command: result.command, output: result.output, exitCode: result.exitCode, profile },
      profile
    )
    if (!structured) return

    const record = {
      command: result.command.trim(),
      exitCode: result.exitCode ?? 1,
      kind: structured.primaryKind,
      fingerprint: structured.fingerprint,
      stackFrames: toFailureStackFrames(structured.stackFrames),
      rawOutput: trimFailureOutput(result.output),
      timestamp: Date.now()
    }
    await this.session.writeFailures(appendFailureRecord(existing, record))
  }

  async recordAudit(report: AuditReport): Promise<void> {
    if (report.noProject) return

    let data = (await this.session.readExtended()).flight ?? emptyFlightData()
    data = appendAuditRecord(data, {
      ranAt: report.ranAt,
      score: report.score?.value,
      grade: report.score?.grade,
      findingCount: report.findings.length
    })

    const changed = await this.gitDiff.changedFiles()
    data = appendSnapshot(data, {
      timestamp: Date.now(),
      reason: 'audit',
      files: changed.slice(0, 64)
    })

    await this.session.writeFlight(data)

    const extAfter = await this.session.readExtended()
    await this.runMistakeDetection(changed, extAfter.flight?.lastGreen ?? null)
  }

  private async runMistakeDetection(
    changedPaths: string[],
    lastGreen: import('@shared/types.js').LastGreenState | null
  ): Promise<void> {
    const root = this.session.projectRoot()
    if (!root || changedPaths.length === 0) return

    const [{ staged, unstaged }, intent, ext] = await Promise.all([
      readGitDiff(root),
      this.session.getIntent(),
      this.session.readExtended()
    ])
    const diffText = [staged, unstaged].filter(Boolean).join('\n')
    const incoming = detectMistakes({
      changedPaths,
      intent,
      diffText,
      lastGreen
    })
    if (incoming.length === 0) return
    const merged = appendMistakes(ext.mistakes ?? [], incoming)
    await this.session.writeMistakes(merged)
  }

  async getView() {
    const ext = await this.session.readExtended()
    return buildFlightLogView(ext.flight)
  }
}
