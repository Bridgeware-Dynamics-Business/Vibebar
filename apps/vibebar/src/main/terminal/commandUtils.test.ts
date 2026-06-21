import { describe, expect, it } from 'vitest'
import { classifyCommand, resolveCdTarget } from './commandUtils.js'

describe('classifyCommand', () => {
  it('treats blank input as a noop', () => {
    expect(classifyCommand('   ')).toEqual({ type: 'noop' })
  })

  it('recognizes clear/cls', () => {
    expect(classifyCommand('clear')).toEqual({ type: 'clear' })
    expect(classifyCommand('CLS')).toEqual({ type: 'clear' })
  })

  it('parses cd with and without an argument', () => {
    expect(classifyCommand('cd')).toEqual({ type: 'cd', arg: '' })
    expect(classifyCommand('cd ..')).toEqual({ type: 'cd', arg: '..' })
    expect(classifyCommand('cd "my folder"')).toEqual({ type: 'cd', arg: 'my folder' })
    expect(classifyCommand("cd 'src/app'")).toEqual({ type: 'cd', arg: 'src/app' })
  })

  it('treats other commands as run', () => {
    expect(classifyCommand('npm run dev')).toEqual({ type: 'run' })
    expect(classifyCommand('cdk deploy')).toEqual({ type: 'run' })
  })
})

describe('resolveCdTarget', () => {
  const home = process.platform === 'win32' ? 'C:\\Users\\me' : '/home/me'
  const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj'

  it('goes home for empty or ~', () => {
    expect(resolveCdTarget(cwd, '', home)).toBe(home)
    expect(resolveCdTarget(cwd, '~', home)).toBe(home)
  })

  it('expands ~/', () => {
    const target = resolveCdTarget(cwd, '~/work', home)
    expect(target.startsWith(home)).toBe(true)
    expect(target.endsWith('work')).toBe(true)
  })

  it('resolves relative against cwd', () => {
    const target = resolveCdTarget(cwd, 'src', home)
    expect(target.startsWith(cwd)).toBe(true)
    expect(target.endsWith('src')).toBe(true)
  })
})
