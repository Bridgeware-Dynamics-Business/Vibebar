import { describe, expect, it } from 'vitest'
import { CH } from '@shared/channels.js'
import { isInvokableChannel, parsePayload } from './validateIpc.js'

describe('isInvokableChannel', () => {
  it('accepts allowlisted channels and rejects others', () => {
    expect(isInvokableChannel(CH.promptsCopy)).toBe(true)
    expect(isInvokableChannel('overlay:layout')).toBe(false) // push-only channel
    expect(isInvokableChannel('rm -rf')).toBe(false)
  })
})

describe('parsePayload', () => {
  it('throws on an unknown channel', () => {
    expect(() => parsePayload('evil:channel', {})).toThrow(/not allowed/)
  })

  it('validates dock enum', () => {
    expect(parsePayload(CH.overlaySetDock, { dock: 'left' })).toEqual({ dock: 'left' })
    expect(() => parsePayload(CH.overlaySetDock, { dock: 'bottom' })).toThrow(/Invalid payload/)
  })

  it('requires a prompt id for copy', () => {
    expect(parsePayload(CH.promptsCopy, { promptId: 'sec-error-console' })).toEqual({
      promptId: 'sec-error-console'
    })
    expect(() => parsePayload(CH.promptsCopy, {})).toThrow()
    expect(() => parsePayload(CH.promptsCopy, { promptId: '' })).toThrow()
  })

  it('rejects oversized scan text', () => {
    expect(() => parsePayload(CH.scannerScan, { text: 'x'.repeat(500_001) })).toThrow()
    expect(parsePayload(CH.scannerScan, { text: 'safe' })).toEqual({ text: 'safe' })
  })

  it('validates a user-authored prompt template on create', () => {
    const template = {
      id: 'custom-1',
      title: 'My prompt',
      categories: ['Security'],
      stacks: ['any'],
      description: '',
      variables: [],
      guardrails: ['no-secrets'],
      body: 'Do the thing'
    }
    expect(() => parsePayload(CH.promptsCreate, { template })).not.toThrow()
    expect(() => parsePayload(CH.promptsCreate, { template: { ...template, categories: [] } })).toThrow()
  })

  it('rejects unknown keys in settings save', () => {
    expect(() => parsePayload(CH.settingsSave, { dock: 'left', evil: true })).toThrow()
    expect(parsePayload(CH.settingsSave, { guardrailsEnabled: true })).toEqual({
      guardrailsEnabled: true
    })
  })

  it('returns undefined for payload-free channels', () => {
    expect(parsePayload(CH.promptsList, undefined)).toBeUndefined()
    expect(parsePayload(CH.projectSelect, undefined)).toBeUndefined()
  })
})
