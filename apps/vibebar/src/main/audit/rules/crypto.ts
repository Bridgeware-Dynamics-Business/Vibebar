import type { AuditFinding } from '@shared/types.js'
import { isBundledOutputContent } from '../engine/scanScope.js'
import { isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import { isNonSecurityChecksumUse } from './checksumUtils.js'
import type { FileRule } from './types.js'

/** CWE-338: Math.random() used for security-sensitive values (tokens, ids, passwords). */
export const weakRandomRule: FileRule = {
  id: 'weak-random',
  category: 'Auth Flow',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /Math\.random/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const sensitive = /token|secret|password|otp|api[_-]?key|session|csrf|nonce|reset|verify|uuid|salt/i
    const masked = ctx.masked()
    const idx = masked.search(/Math\.random\s*\(/)
    if (idx === -1) return []
    const around = masked.slice(Math.max(0, idx - 160), idx + 160)
    if (!sensitive.test(around)) return []
    return [
      fileFinding({
        input,
        file,
        index: idx,
        id: `weak-random-${file.path}`,
        category: 'Auth Flow',
        severity: 'medium',
        confidence: 'high',
        remediationEffort: 'trivial',
        cwe: 'CWE-338 — Use of Cryptographically Weak Pseudo-Random Number Generator',
        references: ['OWASP A02:2021 — Cryptographic Failures'],
        title: 'Insecure randomness for a security value',
        detail:
          'Math.random() is not cryptographically secure — its output is predictable. Using it for tokens, ids, or secrets lets an attacker guess or forge them.',
        fix: {
          task: 'Replace insecure randomness with a cryptographically secure generator',
          where: `${file.path} — Math.random() used near a security-sensitive value at the line marked above`,
          problem:
            'Math.random() is a non-cryptographic PRNG; its sequence can be predicted. Any token, id, or secret derived from it can be guessed or forged.',
          goal: 'Generate security-sensitive values with a CSPRNG.',
          steps: [
            'Use crypto.randomBytes / crypto.randomUUID (Node) or crypto.getRandomValues (browser) — or secrets in Python — for the value.',
            'Ensure enough entropy (e.g. at least 128 bits for tokens).',
            'Confirm no other security value in the file still uses Math.random().'
          ]
        },
        test: {
          objective: 'Prove generated tokens are unpredictable and unique.',
          steps: [
            'Generate a large batch of tokens and assert there are no collisions.',
            'Assert the values come from the CSPRNG path, not Math.random().'
          ]
        }
      })
    ]
  }
}

/** CWE-327/328: weak/broken cryptographic primitives (MD5/SHA1, ECB, deprecated createCipher). */
export const weakCryptoRule: FileRule = {
  id: 'weak-crypto',
  category: 'Cryptography',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /md5|sha1|createCipher|ecb|DES|RC4/i.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    if (isBundledOutputContent(file.content)) return []
    const masked = ctx.masked()
    const source = file.content
    // String-literal algorithm names are blanked by maskStringsAndComments — match those on raw
    // source. Identifier/call patterns (createCipher, DES) are matched on masked source so regex
    // literals in detector code (self-audit) do not false-positive.
    type Check = { re: RegExp; what: string; severity: AuditFinding['severity']; onRaw: boolean }
    const checks: Check[] = [
      { re: /createHash\s*\(\s*["'](?:md5|sha1)["']/i, what: 'a broken hash (MD5/SHA-1)', severity: 'medium', onRaw: true },
      { re: /hashlib\.(?:md5|sha1)\s*\(/i, what: 'a broken hash (MD5/SHA-1)', severity: 'medium', onRaw: true },
      { re: /createCipher(?:iv)?\s*\(\s*["'][^"']*-ecb/i, what: 'AES in ECB mode (leaks plaintext patterns)', severity: 'high', onRaw: false },
      { re: /\bcreateCipher\s*\(/, what: 'the deprecated createCipher API (no IV, weak key derivation)', severity: 'high', onRaw: false },
      { re: /\b(?:DES|RC4|rc4)\b/, what: 'an obsolete cipher (DES/RC4)', severity: 'high', onRaw: false }
    ]
    for (const c of checks) {
      const haystack = c.onRaw ? source : masked
      const m = c.re.exec(haystack)
      if (!m) continue
      // MD5/SHA-1 used for cache keys, fingerprints, or etags — not a security control.
      if (
        c.what.includes('broken hash') &&
        isNonSecurityChecksumUse(source, c.onRaw ? m.index : m.index)
      ) {
        continue
      }
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `weak-crypto-${file.path}`,
          category: 'Cryptography',
          severity: c.severity,
          confidence: 'medium',
          remediationEffort: 'moderate',
          cwe: 'CWE-327 — Use of a Broken or Risky Cryptographic Algorithm',
          references: ['OWASP A02:2021 — Cryptographic Failures'],
          title: 'Weak or broken cryptography',
          detail: `This code uses ${c.what}. Broken primitives are collidable/predictable and must not protect passwords, signatures, tokens, or confidential data.`,
          fix: {
            task: 'Replace weak cryptography with a modern, vetted primitive',
            where: `${file.path} — uses ${c.what} at the line marked above`,
            problem: `${c.what} is considered broken for security use: it is vulnerable to collisions, pattern leakage, or brute force.`,
            goal: 'Use a modern algorithm and mode appropriate to the purpose (hashing, encryption, or passwords).',
            steps: [
              'For password storage, use a memory-hard KDF (argon2id, scrypt, or bcrypt) — never a raw hash.',
              'For integrity/signatures, use SHA-256 or better; for encryption, use AES-GCM (or libsodium) with a unique random IV/nonce per message.',
              'Confirm the value is not used as a security control elsewhere before downgrading it to a non-security checksum.'
            ]
          },
          test: {
            objective: 'Prove the weak primitive is no longer used for a security purpose.',
            steps: [
              'Search the codebase for the weak algorithm in security-relevant paths and assert there are no remaining uses.',
              'For encryption, assert a unique IV/nonce is generated per operation and authenticated encryption (e.g. GCM) is used.'
            ]
          }
        })
      ]
    }
    return []
  }
}
