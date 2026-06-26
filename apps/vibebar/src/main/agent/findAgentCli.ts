import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Resolves the Cursor CLI `agent` binary used for ACP (`agent acp`). Tries common install
 * locations on Windows before falling back to PATH lookup.
 */
export function findAgentCli(env: NodeJS.ProcessEnv = process.env): string | null {
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA
    if (local) {
      for (const name of ['agent.cmd', 'cursor-agent.cmd', 'agent.exe']) {
        const candidate = join(local, 'Programs', 'cursor', 'resources', 'app', 'bin', name)
        if (existsSync(candidate)) return candidate
      }
    }
    const userProfile = env.USERPROFILE
    if (userProfile) {
      for (const candidate of [
        join(userProfile, '.local', 'bin', 'agent.cmd'),
        join(userProfile, '.local', 'bin', 'agent.exe'),
        join(userProfile, '.cursor', 'bin', 'agent.cmd'),
        join(userProfile, '.cursor', 'bin', 'agent.exe')
      ]) {
        if (existsSync(candidate)) return candidate
      }
    }
    const where = spawnSync('where.exe', ['agent'], { encoding: 'utf8', windowsHide: true })
    const line = where.stdout?.trim().split(/\r?\n/)[0]
    if (where.status === 0 && line && existsSync(line)) return line
    return null
  }

  for (const candidate of ['/usr/local/bin/agent', join(env.HOME ?? '', '.local', 'bin', 'agent')]) {
    if (candidate && existsSync(candidate)) return candidate
  }
  const which = spawnSync('which', ['agent'], { encoding: 'utf8' })
  const line = which.stdout?.trim()
  if (which.status === 0 && line && existsSync(line)) return line
  return null
}

/** Extra PATH entries so Electron-spawned `agent` finds a user-level CLI install. */
export function agentCliPathExtras(env: NodeJS.ProcessEnv = process.env): string[] {
  const extras: string[] = []
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA
    if (local) extras.push(join(local, 'Programs', 'cursor', 'resources', 'app', 'bin'))
    const userProfile = env.USERPROFILE
    if (userProfile) {
      extras.push(join(userProfile, '.local', 'bin'), join(userProfile, '.cursor', 'bin'))
    }
  } else {
    const home = env.HOME
    if (home) extras.push(join(home, '.local', 'bin'), join(home, '.cursor', 'bin'))
    extras.push('/usr/local/bin')
  }
  return extras.filter((p) => existsSync(p))
}

export function envWithAgentPath(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const extras = agentCliPathExtras(env)
  if (extras.length === 0) return env
  const current = env[pathKey] ?? ''
  return { ...env, [pathKey]: [...extras, current].filter(Boolean).join(delimiter) }
}

/** Best-effort check that the agent CLI responds (used for setup empty states). */
export function probeAgentCli(agentPath: string): { ok: boolean; version?: string; error?: string } {
  try {
    const result = spawnSync(agentPath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000
    })
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    if (result.status === 0) return { ok: true, version: out.split(/\r?\n/)[0] ?? out }
    return { ok: false, error: out || `Exit code ${result.status ?? 'unknown'}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
