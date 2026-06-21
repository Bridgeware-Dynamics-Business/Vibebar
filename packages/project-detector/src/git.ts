import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Reads the current git branch from `.git/HEAD` without spawning git.
 * Returns the branch name, a short commit hash for a detached HEAD, or null.
 */
export async function readGitBranch(rootPath: string): Promise<string | null> {
  try {
    const head = (await readFile(join(rootPath, '.git', 'HEAD'), 'utf8')).trim()
    const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    if (refMatch) return refMatch[1].trim()
    // Detached HEAD: HEAD holds a raw commit hash.
    if (/^[0-9a-f]{7,40}$/i.test(head)) return head.slice(0, 7)
    return null
  } catch {
    return null
  }
}
