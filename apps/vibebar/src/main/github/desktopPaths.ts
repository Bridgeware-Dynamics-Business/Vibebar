import { join } from 'node:path'

/**
 * Ordered list of likely GitHub Desktop launcher locations for the current platform. A
 * user-configured override wins; otherwise we probe the standard per-user (Windows) or
 * Applications (macOS) install paths. Pure and env-injected so it can be unit tested.
 */
export function githubDesktopCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  override?: string
): string[] {
  const candidates: string[] = []
  if (override && override.trim()) candidates.push(override.trim())

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA
    if (localAppData) candidates.push(join(localAppData, 'GitHubDesktop', 'GitHubDesktop.exe'))
    const programFiles = env.ProgramFiles
    if (programFiles) candidates.push(join(programFiles, 'GitHub Desktop', 'GitHubDesktop.exe'))
  } else if (platform === 'darwin') {
    candidates.push('/Applications/GitHub Desktop.app')
  }

  return candidates
}
