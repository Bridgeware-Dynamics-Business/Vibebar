import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitStatus } from '@shared/types.js'

const execFileAsync = promisify(execFile)

export interface ParsedGitStatus {
  branch: string | null
  ahead: number
  behind: number
  changeCount: number
}

/**
 * Parses `git status --porcelain=v1 --branch` output without spawning anything. The first
 * `## ` line carries the branch and ahead/behind counts; every other non-empty line is one
 * changed path (staged, unstaged, or untracked), so the line count is the change total.
 */
export function parseGitStatus(stdout: string): ParsedGitStatus {
  const result: ParsedGitStatus = { branch: null, ahead: 0, behind: 0, changeCount: 0 }

  for (const line of stdout.split(/\r?\n/)) {
    if (line === '') continue

    if (line.startsWith('## ')) {
      const header = line.slice(3)
      if (header.includes('(no branch)')) continue // detached HEAD: leave branch null

      const noCommits = header.match(/^No commits yet on (.+)$/)
      if (noCommits) {
        result.branch = noCommits[1].trim()
        continue
      }

      // "main...origin/main [ahead 1, behind 2]" → name is up to "..." or a space.
      const nameMatch = header.match(/^(.+?)(?:\.\.\.|\s|$)/)
      result.branch = nameMatch ? nameMatch[1] : header
      const ahead = header.match(/ahead (\d+)/)
      const behind = header.match(/behind (\d+)/)
      if (ahead) result.ahead = Number(ahead[1])
      if (behind) result.behind = Number(behind[1])
      continue
    }

    result.changeCount += 1
  }

  return result
}

const NO_REPO: GitStatus = { isRepo: false, branch: null, changeCount: 0, ahead: 0, behind: 0 }

/**
 * Runs git read-only in the project root to count uncommitted changes. Any failure (folder is
 * not a repo, git not installed, timeout) resolves to a non-repo status rather than throwing, so
 * the badge simply hides instead of surfacing noise.
 */
export async function readGitStatus(root: string): Promise<GitStatus> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], {
      cwd: root,
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 16 * 1024 * 1024
    })
    const parsed = parseGitStatus(stdout)
    return {
      isRepo: true,
      branch: parsed.branch,
      changeCount: parsed.changeCount,
      ahead: parsed.ahead,
      behind: parsed.behind
    }
  } catch {
    return { ...NO_REPO }
  }
}

export { NO_REPO }
