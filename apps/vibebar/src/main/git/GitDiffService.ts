import { clipboard } from 'electron'
import { buildContext } from '@vibebar/prompt-engine'
import type { GitDiffCopyResult } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { readGitStatus } from './gitStatus.js'
import { buildGitDiffPrompt, readChangedFilePaths, readGitDiff } from './gitDiff.js'
import { scanText } from '../scanner/secretScanner.js'

/**
 * Read-only git diff helpers for the active project. Formats staged + unstaged diffs as an
 * AI-ready prompt with secret redaction before anything reaches the clipboard.
 */
export class GitDiffService {
  constructor(private readonly projects: ProjectService) {}

  async changedFiles(): Promise<string[]> {
    const root = this.projects.getProfile()?.rootPath
    if (!root) return []
    return readChangedFilePaths(root)
  }

  async copyDiffPrompt(): Promise<GitDiffCopyResult> {
    const profile = this.projects.getProfile()
    if (!profile?.rootPath) {
      return { copied: false, text: '', findings: [], noProject: true, noChanges: false }
    }

    const status = await readGitStatus(profile.rootPath)
    if (!status.isRepo) {
      return { copied: false, text: '', findings: [], noProject: false, noChanges: false, notRepo: true }
    }

    const { staged, unstaged, hasChanges } = await readGitDiff(profile.rootPath)
    if (!hasChanges && status.changeCount === 0) {
      return { copied: false, text: '', findings: [], noProject: false, noChanges: true }
    }

    const ctx = buildContext(profile)
    const label =
      profile.folderName ||
      `my ${String(ctx.framework)} project (${String(ctx.language)})`
    const raw = buildGitDiffPrompt(label, status.branch, staged, unstaged)
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
      noChanges: false
    }
  }
}
