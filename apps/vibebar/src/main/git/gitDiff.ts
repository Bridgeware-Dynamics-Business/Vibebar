import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GIT_OPTS = {
  windowsHide: true,
  timeout: 15_000,
  maxBuffer: 8 * 1024 * 1024
} as const

export interface GitDiffParts {
  staged: string
  unstaged: string
  hasChanges: boolean
}

/**
 * Reads staged and unstaged diffs read-only from the project root. Any failure resolves to empty
 * parts so the UI can degrade gracefully when git is missing or the folder is not a repo.
 */
export async function readGitDiff(root: string): Promise<GitDiffParts> {
  try {
    const [stagedResult, unstagedResult] = await Promise.all([
      execFileAsync('git', ['diff', '--cached'], { cwd: root, ...GIT_OPTS }),
      execFileAsync('git', ['diff'], { cwd: root, ...GIT_OPTS })
    ])
    const staged = stagedResult.stdout.trim()
    const unstaged = unstagedResult.stdout.trim()
    return { staged, unstaged, hasChanges: Boolean(staged || unstaged) }
  } catch {
    return { staged: '', unstaged: '', hasChanges: false }
  }
}

/**
 * Lists changed paths (staged, unstaged, untracked) relative to the repo root, deduped. Used by
 * the command palette's "pack changed files" action.
 */
export async function readChangedFilePaths(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1'], {
      cwd: root,
      ...GIT_OPTS
    })
    const paths = new Set<string>()
    for (const line of stdout.split(/\r?\n/)) {
      if (!line || line.startsWith('##')) continue
      // Porcelain: XY path, or "R  old -> new" for renames — take the last segment.
      const raw = line.slice(3).trim()
      const path = raw.includes(' -> ') ? (raw.split(' -> ').pop()?.trim() ?? raw) : raw
      if (path) paths.add(path.replace(/\\/g, '/'))
    }
    return [...paths]
  } catch {
    return []
  }
}

/** Assembles an AI-ready prompt in context-packer-style fenced sections. */
export function buildGitDiffPrompt(
  label: string,
  branch: string | null,
  staged: string,
  unstaged: string
): string {
  const lines: string[] = [
    `## Git diff: ${label}${branch ? ` (${branch})` : ''}`,
    '',
    'Review the following changes in my working tree. Help me understand the impact, spot bugs or security issues, and suggest improvements before I commit.',
    ''
  ]
  if (staged) {
    lines.push('### Staged changes')
    lines.push('```diff')
    lines.push(staged)
    lines.push('```')
    lines.push('')
  }
  if (unstaged) {
    lines.push('### Unstaged changes')
    lines.push('```diff')
    lines.push(unstaged)
    lines.push('```')
    lines.push('')
  }
  if (!staged && !unstaged) {
    lines.push(
      '_No staged or unstaged diff — the working tree may only have untracked files or no textual changes._'
    )
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
