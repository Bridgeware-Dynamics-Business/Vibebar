import { type FSWatcher, watch } from 'node:fs'
import picomatch from 'picomatch'
import { getIgnoreGlobList, isIgnoredRel } from '@vibebar/codesync'
import type { ProjectProfile } from '@vibebar/project-detector'
import type { GitStatus } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import { NO_REPO, readGitStatus } from './gitStatus.js'

const DEBOUNCE_MS = 700

// Reuse Code Sync's shared ignore conventions (node_modules, dist, build, .next, target, caches,
// coverage, etc.) so the badge isn't refreshed by churn that `git status` would ignore anyway —
// e.g. an `npm install` or a dev server writing thousands of build-output files. `.git` is
// deliberately kept OUT of the filter: staging, committing, and pushing all write under `.git`,
// and those MUST still refresh the badge.
const WATCH_IGNORE_GLOBS = getIgnoreGlobList([]).filter((glob) => glob !== '**/.git/**')
const matchIgnoredWatchPath = picomatch(WATCH_IGNORE_GLOBS, { dot: true })

/**
 * Tracks uncommitted changes for the active project in near real time. It watches the project
 * tree (recursively) and re-runs `git status` on a debounced trigger, then pushes the new count
 * to the overlay so the GitHub button's badge stays live as the user — or their AI — edits files.
 * Watching `.git` too means staging, committing, and pushing all refresh the badge.
 */
export class GitStatusService {
  private readonly projects: ProjectService
  private readonly emit: (status: GitStatus) => void
  private current: GitStatus = { ...NO_REPO }
  private watcher: FSWatcher | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null

  constructor(projects: ProjectService, emit: (status: GitStatus) => void) {
    this.projects = projects
    this.emit = emit
  }

  getStatus(): GitStatus {
    return this.current
  }

  /** Re-point the watcher at a newly selected project and refresh immediately. */
  setProject(profile: ProjectProfile | null): void {
    this.stopWatch()
    const root = profile?.rootPath ?? null
    if (!root) {
      this.current = { ...NO_REPO }
      this.emit(this.current)
      return
    }
    this.startWatch(root)
    void this.refresh()
  }

  async refresh(): Promise<void> {
    const root = this.projects.getProfile()?.rootPath
    if (!root) {
      this.current = { ...NO_REPO }
      this.emit(this.current)
      return
    }
    this.current = await readGitStatus(root)
    this.emit(this.current)
  }

  private startWatch(root: string): void {
    try {
      // Recursive watching is supported on Windows/macOS; bursts are coalesced by the debounce.
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (typeof filename === 'string' && isIgnoredRel(filename, matchIgnoredWatchPath)) return
        this.scheduleRefresh()
      })
      this.watcher.on('error', () => this.stopWatch())
    } catch {
      // Recursive watch unsupported here — refresh-on-project-change still works.
      this.watcher = null
    }
  }

  private scheduleRefresh(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.refresh(), DEBOUNCE_MS)
  }

  private stopWatch(): void {
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  dispose(): void {
    this.stopWatch()
  }
}
