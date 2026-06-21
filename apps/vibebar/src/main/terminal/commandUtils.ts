import { isAbsolute, resolve } from 'node:path'

export type ClassifiedCommand =
  | { type: 'cd'; arg: string }
  | { type: 'clear' }
  | { type: 'run' }
  | { type: 'noop' }

/**
 * Classifies a raw command line so the session can handle directory changes and clears itself
 * (per-command spawns are isolated, so `cd` would otherwise not persist). Everything else is
 * spawned. Pure and unit-tested.
 */
export function classifyCommand(raw: string): ClassifiedCommand {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { type: 'noop' }
  if (/^(clear|cls)$/i.test(trimmed)) return { type: 'clear' }

  const cd = /^cd(?:\s+(.*))?$/i.exec(trimmed)
  if (cd) {
    const arg = stripQuotes((cd[1] ?? '').trim())
    return { type: 'cd', arg }
  }
  return { type: 'run' }
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * Resolves the target of a `cd` against the current directory. An empty arg (`cd` alone) goes
 * to the home directory, matching shell behavior. Does not touch the filesystem.
 */
export function resolveCdTarget(cwd: string, arg: string, homeDir: string): string {
  if (arg.length === 0 || arg === '~') return homeDir
  if (arg.startsWith('~/') || arg.startsWith('~\\')) {
    return resolve(homeDir, arg.slice(2))
  }
  if (isAbsolute(arg)) return resolve(arg)
  return resolve(cwd, arg)
}
