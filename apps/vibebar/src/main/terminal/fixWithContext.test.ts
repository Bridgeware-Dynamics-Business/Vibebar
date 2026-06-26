import { describe, expect, it } from 'vitest'
import { suggestVerifyCommand } from './fixWithContext.js'
import type { ProjectCommand } from '@shared/types.js'

const commands: ProjectCommand[] = [
  { id: 'script:test', label: 'Run tests', command: 'npm test', group: 'Scripts', source: 'scripts' },
  { id: 'script:typecheck', label: 'Type-check', command: 'npm run typecheck', group: 'Scripts', source: 'scripts' },
  { id: 'script:build', label: 'Build', command: 'npm run build', group: 'Scripts', source: 'scripts' }
]

describe('suggestVerifyCommand', () => {
  it('suggests typecheck after tsc failures', () => {
    expect(suggestVerifyCommand(commands, 'tsc')).toBe('npm run typecheck')
  })

  it('suggests test after vitest failures', () => {
    expect(suggestVerifyCommand(commands, 'vitest')).toBe('npm test')
  })

  it('falls back to first script when kind unknown', () => {
    expect(suggestVerifyCommand(commands, null)).toBe('npm test')
  })
})
