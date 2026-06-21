import { describe, expect, it } from 'vitest'
import { hasSecrets, scanText } from './secretScanner.js'

describe('scanText', () => {
  it('detects an AWS access key and redacts it', () => {
    const text = 'const key = "AKIA1234567890ABCDEF"'
    const result = scanText(text)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].kind).toBe('AWS access key')
    expect(result.redactedText).toContain('[REDACTED:AWS access key]')
    expect(result.redactedText).not.toContain('AKIA1234567890ABCDEF')
  })

  it('detects a GitHub token', () => {
    const text = `token: ghp_${'a'.repeat(36)}`
    expect(hasSecrets(text)).toBe(true)
  })

  it('detects a JWT', () => {
    const jwt = `eyJ${'a'.repeat(10)}.eyJ${'b'.repeat(10)}.${'c'.repeat(10)}`
    const result = scanText(jwt)
    expect(result.findings.some((f) => f.kind === 'JWT')).toBe(true)
  })

  it('detects a database URL with credentials', () => {
    const text = 'DATABASE_URL=postgres://admin:hunter2pass@db.internal:5432/app'
    const result = scanText(text)
    expect(result.findings.some((f) => f.kind.includes('Database URL'))).toBe(true)
  })

  it('redacts only the value of a hard-coded secret assignment', () => {
    const text = 'API_KEY = "s3cr3tValue1234"'
    const result = scanText(text)
    expect(result.findings.some((f) => f.kind === 'Hard-coded secret')).toBe(true)
    expect(result.redactedText).toContain('API_KEY')
    expect(result.redactedText).not.toContain('s3cr3tValue1234')
  })

  it('masks the matched secret instead of echoing it', () => {
    const text = 'API_KEY="s3cr3tValue1234"'
    const finding = scanText(text).findings[0]
    expect(finding.match).not.toContain('s3cr3tValue1234')
    expect(finding.match).toContain('*')
  })

  it('ignores obvious placeholders', () => {
    expect(scanText('API_KEY="your-api-key-here"').findings).toHaveLength(0)
    expect(scanText('SECRET="changeme123"').findings).toHaveLength(0)
    expect(scanText('PASSWORD="xxxxxxxx"').findings).toHaveLength(0)
  })

  it('returns clean text unchanged', () => {
    const text = 'const greeting = "hello world"'
    const result = scanText(text)
    expect(result.findings).toHaveLength(0)
    expect(result.redactedText).toBe(text)
  })
})
