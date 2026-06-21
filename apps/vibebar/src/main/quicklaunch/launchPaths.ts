import { join } from 'node:path'

/**
 * Best-guess install locations for the built-in quick-launch editors, ordered most-likely-first.
 * Pure and env-injected (like github/desktopPaths) so it can be unit tested without touching the
 * real filesystem. The {@link QuickLaunchService} picks the first candidate that exists; if none
 * do, the toolbar button prompts the user to locate the executable themselves.
 */
export function cursorCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const candidates: string[] = []
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA
    if (localAppData) {
      candidates.push(join(localAppData, 'Programs', 'cursor', 'Cursor.exe'))
      candidates.push(join(localAppData, 'Programs', 'Cursor', 'Cursor.exe'))
    }
    const programFiles = env.ProgramFiles
    if (programFiles) candidates.push(join(programFiles, 'Cursor', 'Cursor.exe'))
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Cursor.app')
  } else {
    candidates.push('/usr/local/bin/cursor', '/usr/bin/cursor', '/snap/bin/cursor')
  }
  return candidates
}

/**
 * Likely locations for the Codex launcher. On Windows this is usually the npm-global shim
 * (`%APPDATA%\npm\codex.cmd`); on Unix a binary on the PATH's common install dirs.
 */
export function codexCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const candidates: string[] = []
  if (platform === 'win32') {
    const appData = env.APPDATA
    if (appData) {
      candidates.push(join(appData, 'npm', 'codex.cmd'))
      candidates.push(join(appData, 'npm', 'codex.exe'))
    }
    const localAppData = env.LOCALAPPDATA
    if (localAppData) candidates.push(join(localAppData, 'Programs', 'codex', 'Codex.exe'))
  } else if (platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex')
  } else {
    candidates.push('/usr/local/bin/codex', '/usr/bin/codex')
  }
  return candidates
}

/** Returns auto-detect candidates for a built-in app id, or [] for custom apps. */
export function builtInCandidates(
  id: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string[] {
  if (id === 'cursor') return cursorCandidates(env, platform)
  if (id === 'codex') return codexCandidates(env, platform)
  return []
}
