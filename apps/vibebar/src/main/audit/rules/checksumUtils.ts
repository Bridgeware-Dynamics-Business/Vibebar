/**
 * Heuristics for MD5/SHA-1 used as non-security checksums (cache keys, fingerprints, etags).
 * When these signals dominate and no security-sensitive context is nearby, weak-crypto is suppressed.
 */

const SECURITY_CONTEXT =
  /password|passwd|token|secret|sign(?:ature)?|hmac|auth|credential|salt|pepper|encrypt|decrypt|verify(?:ing)?|jwt|session[_-]?id|api[_-]?key|bcrypt|scrypt|argon/i

const CHECKSUM_SIGNALS = [
  /\b(?:cache|cached|fingerprint|etag|checksum|content[_-]?hash|file[_-]?hash|keyFor|hashKey|parseKey|MAX_CACHE)\b/i,
  /\b(?:private\s+)?static\s+hash\s*\(/,
  /\bfunction\s+(?:key|hash|fingerprint|parseToAst)\s*\(/,
  /\b(?:const|let|var)\s+(?:key|hash|fingerprint|cache|store)\s*=/,
  /\.digest\s*\(\s*['"]hex['"]\s*\)/,
  /new\s+Map\s*[<(]/,
  /new\s+Map\s*\(/,
  /\/\* @__PURE__ \*\/\s*new\s+Map/,
  /(?:cache|store)\.(?:get|set|has)\s*\(/,
  /\bMap<string/,
  /content-hash-keyed|cache keys|finding identity|line-independent identity/i
]

/** True when MD5/SHA-1 at `matchIndex` is likely a cache key or fingerprint, not a security control. */
export function isNonSecurityChecksumUse(source: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 450)
  const windowEnd = Math.min(source.length, matchIndex + 450)
  const around = source.slice(windowStart, windowEnd)

  if (SECURITY_CONTEXT.test(around)) return false

  if (!CHECKSUM_SIGNALS.some((re) => re.test(around))) return false

  const after = source.slice(matchIndex, Math.min(source.length, matchIndex + 220))
  if (/\.digest\s*\([^)]*\)(?:\.slice|\s*;|\s*\)|\s*,|\s*$)/.test(after)) return true

  return CHECKSUM_SIGNALS.some((re) => re.test(around))
}
