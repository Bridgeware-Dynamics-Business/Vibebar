import type { AuditReport } from '@shared/types.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import type { SessionService } from './SessionService.js'
import {
  appendAuditRecord,
  appendCommandRecord,
  appendSnapshot,
  buildFlightLogView,
  emptyFlightData,
  refreshLastGreenDelta,
  updateLastGreen
} from './flightRecorderLogic.js'

/**
 * Records terminal outcomes, audit runs, and file snapshots into the project session file.
 * Feeds Session Hub flight log and handoff "last green" excerpts.
 */
export class FlightRecorderService {
  constructor(
    private readonly session: SessionService,
    private readonly gitDiff: GitDiffService
  ) {}

  async recordCommand(command: string, exitCode: number | null): Promise<void> {
    const root = this.session.projectRoot()
    if (!root) return

    let data = (await this.session.readExtended()).flight ?? emptyFlightData()
    data = appendCommandRecord(data, command, exitCode)

    const changed = await this.gitDiff.changedFiles()
    data = appendSnapshot(data, {
      timestamp: Date.now(),
      reason: 'command',
      files: changed.slice(0, 64)
    })
    data = updateLastGreen(data, command, exitCode, changed)
    if (data.lastGreen) {
      data = { ...data, lastGreen: refreshLastGreenDelta(data.lastGreen, changed) }
    }

    await this.session.writeFlight(data)
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
  }

  async getView() {
    const ext = await this.session.readExtended()
    return buildFlightLogView(ext.flight)
  }
}
