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
  /** Set when git diff commands fail (missing git, not a repo, timeout). */
  error?: string
}

/**
 * Reads staged and unstaged diffs read-only from the project root. Failures resolve to empty
 * parts with an `error` message so callers can surface git problems instead of silent empties.
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Git diff failed'
    return { staged: '', unstaged: '', hasChanges: false, error: message }
  }
}

/** Untracked paths only (porcelain `??`), relative to repo root. */
export async function readUntrackedPaths(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-u'], {
      cwd: root,
      ...GIT_OPTS
    })
    const paths: string[] = []
    for (const line of stdout.split(/\r?\n/)) {
      if (!line || line.startsWith('##')) continue
      if (line.startsWith('??')) {
        const path = line.slice(3).trim().replace(/\\/g, '/')
        if (path) paths.push(path)
      }
    }
    return paths
  } catch {
    return []
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
  unstaged: string,
  untracked: string[] = []
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
  if (!staged && !unstaged && untracked.length > 0) {
    lines.push('### Untracked files (no diff available)')
    lines.push('')
    lines.push(
      `These ${untracked.length} file(s) are not tracked by git yet, so \`git diff\` cannot show their contents. Use **Context Packer → Pack changed** to copy full file contents instead.`
    )
    lines.push('')
    lines.push('```')
    lines.push(untracked.slice(0, 48).join('\n'))
    if (untracked.length > 48) lines.push(`… and ${untracked.length - 48} more`)
    lines.push('```')
    lines.push('')
  }
  if (!staged && !unstaged && untracked.length === 0) {
    lines.push(
      '_No staged or unstaged diff — the working tree may only have untracked files or no textual changes._'
    )
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
