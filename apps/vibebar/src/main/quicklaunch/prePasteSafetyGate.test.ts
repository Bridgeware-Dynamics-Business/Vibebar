import { afterEach, describe, expect, it, vi } from 'vitest'
import * as secretScanner from '../scanner/secretScanner.js'
import {
  isPrePasteGateEnabled,
  PRE_PASTE_CHAR_WARN,
  scanPrePasteContent
} from './prePasteSafetyGate.js'

describe('scanPrePasteContent', () => {
  it('flags oversized prompts', () => {
    const text = 'x'.repeat(PRE_PASTE_CHAR_WARN + 1)
    const scan = scanPrePasteContent(text)
    expect(scan.findings.some((f) => f.kind === 'oversized')).toBe(true)
    expect(scan.requiresConfirmation).toBe(true)
  })

  it('flags risky shell patterns', () => {
    const scan = scanPrePasteContent('Please run rm -rf /tmp/foo for cleanup')
    expect(scan.findings.some((f) => f.kind === 'risky-shell')).toBe(true)
  })

  it('flags likely secrets', () => {
    vi.spyOn(secretScanner, 'scanText').mockReturnValue({
      findings: [{ kind: 'OpenAI key', match: 'sk-…******', index: 0 }],
      redactedText: '[REDACTED:OpenAI key]'
    })
    const scan = scanPrePasteContent('token=your-fake-example-key')
    expect(scan.findings.some((f) => f.kind === 'secret')).toBe(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes clean short text', () => {
    const scan = scanPrePasteContent('Fix the auth bug in src/auth.ts')
    expect(scan.requiresConfirmation).toBe(false)
  })
})

describe('isPrePasteGateEnabled', () => {
  it('is off when paste-after-open is disabled', () => {
    expect(isPrePasteGateEnabled({ pasteAfterOpenCursor: false, prePasteSafetyGate: true })).toBe(
      false
    )
  })

  it('defaults gate on when paste is enabled', () => {
    expect(isPrePasteGateEnabled({ pasteAfterOpenCursor: true })).toBe(true)
  })
})
