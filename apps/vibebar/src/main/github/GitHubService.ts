import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { shell } from 'electron'
import type { GitHubOpenResult } from '@shared/types.js'
import type { AppStore } from '../settings/store.js'
import { githubDesktopCandidates } from './desktopPaths.js'

/**
 * Launches GitHub Desktop on the active project so the user can stage, commit, and push from a
 * full Git UI — the action half of VibeBar's Git integration (the badge is the awareness half).
 * Prefers the installed launcher (passing the repo path so Desktop opens that local repo), and
 * falls back to GitHub Desktop's `x-github-client://` protocol handler. This is the only place
 * VibeBar launches an external app, so it stays narrow and fully guarded.
 */
export class GitHubService {
  private readonly store: AppStore

  constructor(store: AppStore) {
    this.store = store
  }

  async open(repoPath: string | null): Promise<GitHubOpenResult> {
    if (!repoPath) {
      return { ok: false, error: 'Select a project first.' }
    }

    const override = this.store.getGitHubDesktopPath()
    const candidates = githubDesktopCandidates(process.env, process.platform, override)
    const launcher = candidates.find((p) => existsSync(p))

    if (launcher) {
      try {
        this.launch(launcher, repoPath)
        return { ok: true, method: 'desktop' }
      } catch {
        // Fall through to the protocol handler.
      }
    }

    // Protocol fallback: GitHub Desktop registers x-github-client:// for local repos.
    try {
      const encoded = encodeURIComponent(repoPath)
      await shell.openExternal(`x-github-client://openLocalRepo/${encoded}`)
      return { ok: true, method: 'protocol' }
    } catch {
      return {
        ok: false,
        error: 'GitHub Desktop not found. Install it from desktop.github.com, then try again.'
      }
    }
  }

  private launch(launcher: string, repoPath: string): void {
    if (process.platform === 'darwin') {
      // launcher is the .app bundle; `open -a` brings it to the foreground with the repo arg.
      spawn('open', ['-a', launcher, repoPath], { detached: true, stdio: 'ignore' }).unref()
      return
    }
    spawn(launcher, [repoPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
}
