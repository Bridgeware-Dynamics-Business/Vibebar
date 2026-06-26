import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Best-effort path to the Cursor CLI shim (preferred over UI automation when present). */
export function findCursorCli(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | null {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA
    if (local) {
      const shim = join(local, 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd')
      if (existsSync(shim)) return shim
    }
    const where = spawnSync('where.exe', ['cursor'], { encoding: 'utf8', windowsHide: true })
    const line = where.stdout?.trim().split(/\r?\n/)[0]
    if (where.status === 0 && line && existsSync(line)) return line
    return null
  }

  for (const candidate of ['/usr/local/bin/cursor', '/usr/bin/cursor']) {
    if (existsSync(candidate)) return candidate
  }
  const which = spawnSync('which', ['cursor'], { encoding: 'utf8' })
  const line = which.stdout?.trim()
  if (which.status === 0 && line && existsSync(line)) return line
  return null
}

/**
 * Sends Ctrl+V to the foreground window after a short delay so Cursor can take focus.
 * Windows-only best-effort fallback when no CLI paste API exists.
 */
export function scheduleWindowsPaste(delayMs = 2500): Promise<boolean> {
  if (process.platform !== 'win32') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      `Start-Sleep -Milliseconds ${Math.max(500, Math.min(delayMs, 8000))}`,
      '[System.Windows.Forms.SendKeys]::SendWait("^v")'
    ].join('; ')

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: 'ignore' }
    )
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}
