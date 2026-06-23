import { describe, expect, it } from 'vitest'
import { isNonSecurityChecksumUse } from './checksumUtils.js'

describe('isNonSecurityChecksumUse', () => {
  it('returns true for SHA-1 cache key helpers', () => {
    const src = `
      private static hash(content: string): string {
        return createHash('sha1').update(content).digest('hex')
      }
      private static key(path: string, content: string): string {
        return path + hash(content)
      }
    `
    const idx = src.indexOf("createHash('sha1')")
    expect(isNonSecurityChecksumUse(src, idx)).toBe(true)
  })

  it('returns true for fingerprint identity hashes', () => {
    const src = `
      export function computeFingerprint(parts) {
        const basis = parts.ruleId + parts.file
        return createHash('sha1').update(basis).digest('hex').slice(0, 16)
      }
    `
    const idx = src.indexOf("createHash('sha1')")
    expect(isNonSecurityChecksumUse(src, idx)).toBe(true)
  })

  it('returns false when hashing passwords', () => {
    const src = `
      function storeUser(password: string) {
        const hash = createHash('sha1').update(password).digest('hex')
        db.save({ password: hash })
      }
    `
    const idx = src.indexOf("createHash('sha1')")
    expect(isNonSecurityChecksumUse(src, idx)).toBe(false)
  })

  it('returns false when signing tokens', () => {
    const src = `
      const sig = createHash('sha1').update(token + secret).digest('hex')
    `
    const idx = src.indexOf("createHash('sha1')")
    expect(isNonSecurityChecksumUse(src, idx)).toBe(false)
  })
})
