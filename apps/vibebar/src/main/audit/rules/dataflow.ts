import type { AuditConfidence } from '@shared/types.js'
import { hasServerSurface, isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import { confidenceAt, findSinkCalls, type SinkMatch } from './astUtils.js'
import type { FileRule } from './types.js'

/** Picks the best (tainted-first) sink match and maps it to a confidence. */
function pickMatch(matches: SinkMatch[]): { match: SinkMatch; confidence: AuditConfidence } | null {
  if (matches.length === 0) return null
  const tainted = matches.find((m) => m.tainted)
  if (tainted) return { match: tainted, confidence: 'high' }
  return { match: matches[0], confidence: 'medium' }
}

const HTTP_CLIENT = /^(fetch|axios|got|superagent|request|ky|undici)$/
const HTTP_CLIENT_METHOD = /^(get|post|put|patch|delete|head|request|fetch)$/

/** CWE-918: Server-Side Request Forgery — an outbound request to a dynamic/attacker-controlled URL. */
export const ssrfRule: FileRule = {
  id: 'ssrf',
  category: 'Access Control',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /fetch|axios|got|superagent|http\.request|https\.request|https?\.get|requests\.|httpx|urllib/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    if (!hasServerSurface(input)) return []
    let index: number
    let confidence: AuditConfidence
    if (isPython) {
      const m = /\b(?:requests|httpx)\.(?:get|post|put|delete|patch|head)\s*\(\s*(?:f["']|[A-Za-z_][\w.]*\b(?!\s*["']))/.exec(
        ctx.masked()
      )
      if (!m) return []
      index = m.index
      confidence = 'medium'
    } else {
      const picked = pickMatch(
        findSinkCalls(ctx, {
          match: (info) =>
            (info.calleeName != null && HTTP_CLIENT.test(info.calleeName)) ||
            (info.objectName != null &&
              /^(axios|http|https|got|fetch|client)$/.test(info.objectName) &&
              info.propertyName != null &&
              HTTP_CLIENT_METHOD.test(info.propertyName)),
          argIndex: 0,
          requireDynamic: true
        })
      )
      if (!picked) return []
      index = picked.match.index
      confidence = picked.confidence
    }
    return [
      fileFinding({
        input,
        file,
        index,
        id: `ssrf-${file.path}`,
        category: 'Access Control',
        severity: 'high',
        confidence,
        remediationEffort: 'moderate',
        cwe: 'CWE-918 — Server-Side Request Forgery (SSRF)',
        references: ['OWASP A10:2021 — Server-Side Request Forgery'],
        title: 'Possible SSRF (outbound request to a dynamic URL)',
        detail:
          'An outbound HTTP request is made to a URL that is built dynamically. If any part of that URL comes from a request, an attacker can make your server call internal services, cloud metadata endpoints, or arbitrary hosts.',
        fix: {
          task: 'Constrain an outbound request so its destination cannot be attacker-controlled',
          where: `${file.path} — an outbound request uses a dynamic URL at the line marked above`,
          problem:
            'A user-influenced URL lets an attacker pivot your server to internal-only hosts (169.254.169.254, localhost admin panels, internal APIs). This is SSRF and often leads to credential theft or RCE.',
          goal: 'Only allow requests to an explicit allowlist of safe destinations.',
          steps: [
            'Validate the URL against a strict allowlist of permitted hosts/schemes before making the request.',
            'Reject internal/loopback/link-local addresses (resolve the host and block private ranges), and disable redirects to untrusted hosts.',
            'Never pass a raw user-supplied URL straight into the HTTP client.'
          ]
        },
        test: {
          objective: 'Prove the request cannot be redirected to an internal/forbidden host.',
          steps: [
            'Send payloads pointing at internal targets (e.g. http://169.254.169.254/, http://localhost:port/admin, file://) to the input that reaches this request.',
            'Assert each is rejected before any outbound call is made.',
            'Confirm an allowlisted destination still works.'
          ]
        }
      })
    ]
  }
}

/** CWE-22: Path traversal — a filesystem path built from untrusted input. */
export const pathTraversalRule: FileRule = {
  id: 'path-traversal',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /readFile|writeFile|createReadStream|createWriteStream|sendFile|readdir|unlink|\bopen\s*\(|os\.path|sendfile/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    let index: number
    let confidence: AuditConfidence
    if (isPython) {
      const m = /\bopen\s*\(\s*(?:f["']|[A-Za-z_][\w.]*\s*\+|os\.path\.join\([^)]*(?:request|argv))/.exec(ctx.masked())
      if (!m) return []
      index = m.index
      confidence = 'medium'
    } else {
      const fsMethods = /^(readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream|sendFile|appendFile|appendFileSync|unlink|unlinkSync|readdir|readdirSync|open|openSync|stat|statSync)$/
      const picked = pickMatch(
        findSinkCalls(ctx, {
          match: (info) =>
            (info.propertyName != null && fsMethods.test(info.propertyName)) ||
            info.calleeName === 'sendFile',
          argIndex: 0,
          requireDynamic: true
        })
      )
      if (!picked || !picked.match.tainted) return []
      index = picked.match.index
      confidence = picked.confidence
    }
    return [
      fileFinding({
        input,
        file,
        index,
        id: `path-traversal-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        confidence,
        remediationEffort: 'moderate',
        cwe: 'CWE-22 — Improper Limitation of a Pathname to a Restricted Directory',
        references: ['OWASP A01:2021 — Broken Access Control'],
        title: 'Possible path traversal',
        detail:
          'A filesystem path is built from untrusted input. With `../` sequences (or an absolute path) an attacker can read or write files outside the intended directory.',
        fix: {
          task: 'Confine a file operation to an intended directory',
          where: `${file.path} — a file path is built from input at the line marked above`,
          problem:
            'User-controlled path segments allow `../` traversal or absolute paths, letting an attacker escape the intended folder to read secrets or overwrite files.',
          goal: 'Resolve the final path and verify it stays inside the allowed base directory.',
          steps: [
            'Resolve the requested path against a fixed base directory, then verify the resolved path still starts with that base (reject otherwise).',
            'Strip or reject path separators and `..` segments; prefer mapping an opaque id to a known filename over accepting raw paths.',
            'Never concatenate user input directly into a filesystem path.'
          ]
        },
        test: {
          objective: 'Prove traversal sequences cannot escape the intended directory.',
          steps: [
            'Send payloads like `../../etc/passwd`, an absolute path, and URL-encoded `%2e%2e%2f` to the input that reaches this operation.',
            'Assert each is rejected and no file outside the base directory is read or written.'
          ]
        }
      })
    ]
  }
}

/** CWE-601: Open redirect — a redirect target taken from untrusted input. */
export const openRedirectRule: FileRule = {
  id: 'open-redirect',
  category: 'Access Control',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /redirect|location\s*=|location\.href/.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const picked = pickMatch(
      findSinkCalls(ctx, {
        match: (info) =>
          info.propertyName === 'redirect' ||
          (info.calleeName === 'redirect') ||
          (info.objectName === 'Response' && info.propertyName === 'redirect'),
        argIndex: 0,
        requireDynamic: true
      })
    )
    if (!picked || !picked.match.tainted) return []
    return [
      fileFinding({
        input,
        file,
        index: picked.match.index,
        id: `open-redirect-${file.path}`,
        category: 'Access Control',
        severity: 'medium',
        confidence: picked.confidence,
        remediationEffort: 'trivial',
        cwe: 'CWE-601 — URL Redirection to Untrusted Site (Open Redirect)',
        references: ['OWASP A01:2021 — Broken Access Control'],
        title: 'Possible open redirect',
        detail:
          'A redirect destination is taken from untrusted input. Attackers use open redirects to make a trusted link send victims to a phishing or malware site, and to bypass some auth flows.',
        fix: {
          task: 'Restrict a redirect to safe, in-app destinations',
          where: `${file.path} — a redirect target comes from input at the line marked above`,
          problem:
            'A user-controlled redirect target lets an attacker craft a link on your trusted domain that forwards victims anywhere, defeating user trust and some OAuth/login protections.',
          goal: 'Only redirect to relative, in-app paths or an explicit allowlist of hosts.',
          steps: [
            'Allow only relative paths (reject absolute URLs and protocol-relative `//host` targets), or validate against an allowlist of trusted hosts.',
            'Map an opaque key to a known destination instead of redirecting to a raw URL where possible.',
            'Never pass a raw `returnTo`/`next`/`url` parameter straight into the redirect.'
          ]
        },
        test: {
          objective: 'Prove the redirect cannot be pointed at an external site.',
          steps: [
            'Send payloads like `https://evil.example`, `//evil.example`, and `/\\evil.example` to the redirect parameter.',
            'Assert each is rejected or normalized to a safe in-app path; confirm a legitimate relative path still works.'
          ]
        }
      })
    ]
  }
}

/** CWE-1321: Prototype pollution — assigning into an object using an attacker-controlled key. */
export const prototypePollutionRule: FileRule = {
  id: 'prototype-pollution',
  category: 'Input Validation',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /__proto__|prototype\[|\.merge\(|\.extend\(|Object\.assign\(|deepMerge|setWith\(/.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    const re =
      /\[\s*(?:req|request|ctx)\.(?:body|query|params)[^\]]*\]\s*=|(?:_\.|lodash\.)?(?:merge|defaultsDeep|mergeWith|setWith|set)\s*\([^)]*(?:req|request|ctx)\.(?:body|query|params)|Object\.assign\s*\(\s*\{?\s*\}?\s*,?\s*(?:req|request|ctx)\.(?:body|query)/
    const m = re.exec(masked)
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `prototype-pollution-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-1321 — Improperly Controlled Modification of Object Prototype Attributes',
        references: ['OWASP A08:2021 — Software and Data Integrity Failures'],
        title: 'Possible prototype pollution',
        detail:
          'An object is merged/assigned from request data (or written with a user-controlled key). A key like `__proto__` or `constructor.prototype` can poison every object in the process, leading to denial of service or RCE.',
        fix: {
          task: 'Prevent prototype pollution in an object merge/assignment',
          where: `${file.path} — request data is merged/assigned into an object at the line marked above`,
          problem:
            'Recursively merging untrusted input (or writing with a user-supplied key) lets an attacker set `__proto__`/`constructor`/`prototype`, corrupting object behavior across the whole app.',
          goal: 'Reject dangerous keys and avoid deep-merging untrusted data.',
          steps: [
            'Block the keys `__proto__`, `constructor`, and `prototype` before merging/assigning, or use a null-prototype object (Object.create(null)) / Map for untrusted data.',
            'Validate request bodies against an explicit schema and copy only allowed fields instead of deep-merging the whole object.',
            'Prefer a merge utility that is documented to be prototype-pollution-safe.'
          ]
        },
        test: {
          objective: 'Prove a polluting payload cannot modify Object.prototype.',
          steps: [
            'Send a body like `{ "__proto__": { "polluted": true } }` (and a `constructor.prototype` variant) to the endpoint.',
            'Assert `({}).polluted` is still undefined afterwards and the merge rejected the dangerous key.'
          ]
        }
      })
    ]
  }
}

/** Mass assignment: spreading a whole request body into an ORM create/update. */
export const massAssignmentRule: FileRule = {
  id: 'mass-assignment',
  category: 'Access Control',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /\b(?:create|update|insert|save|build|updateOne|updateMany|findOneAndUpdate|bulkCreate)\b/.test(c) && /req\.body|request\.body|ctx\.request\.body/.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    const re =
      /\.(create|update|insert|save|build|updateOne|updateMany|findOneAndUpdate|bulkCreate)\s*\(\s*(?:\{\s*\.\.\.\s*)?(?:req|request|ctx)\.(?:request\.)?body|new\s+\w+\s*\(\s*(?:req|request)\.body/
    const m = re.exec(masked)
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `mass-assignment-${file.path}`,
        category: 'Access Control',
        severity: 'high',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-915 — Improperly Controlled Modification of Dynamically-Determined Object Attributes',
        references: ['OWASP API6:2023 — Unrestricted Access to Sensitive Business Flows', 'OWASP A04:2021 — Insecure Design'],
        title: 'Possible mass assignment (over-posting)',
        detail:
          'A whole request body is passed into a model create/update. An attacker can add fields the UI never sends — like `role`, `isAdmin`, `ownerId`, or pricing — and have them persisted.',
        fix: {
          task: 'Allowlist the fields accepted by a create/update operation',
          where: `${file.path} — a request body is passed straight into a model write at the line marked above`,
          problem:
            'Binding the entire request body to a database write lets a caller set privileged or internal fields (role, isAdmin, ownerId, balance) that the form never exposes.',
          goal: 'Persist only an explicit set of user-editable fields.',
          steps: [
            'Pick only the allowed fields explicitly (a DTO/schema with a fixed field list) before writing to the database.',
            'Never spread `req.body` directly into a create/update; reject or ignore unknown fields.',
            'Set server-controlled fields (ownerId, role, timestamps) from the session/server, never from the body.'
          ]
        },
        test: {
          objective: 'Prove privileged fields cannot be set through the body.',
          steps: [
            'POST a normal payload plus extra fields like `role: "admin"`, `isAdmin: true`, and `ownerId: <other user>`.',
            'Assert the extra fields are ignored/rejected and never persisted; confirm the allowed fields still save.'
          ]
        }
      })
    ]
  }
}

/** CWE-1333: ReDoS — a regular expression compiled from untrusted input. */
export const redosRule: FileRule = {
  id: 'redos',
  category: 'Input Validation',
  scope: 'file',
  cap: 3,
  prefilter: (c) => /new RegExp\(/.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const picked = pickMatch(
      findSinkCalls(ctx, {
        match: (info) => info.calleeName === 'RegExp',
        argIndex: 0,
        requireDynamic: true
      })
    )
    if (!picked || !picked.match.tainted) return []
    return [
      fileFinding({
        input,
        file,
        index: picked.match.index,
        id: `redos-${file.path}`,
        category: 'Input Validation',
        severity: 'medium',
        confidence: picked.confidence,
        remediationEffort: 'moderate',
        cwe: 'CWE-1333 — Inefficient Regular Expression Complexity',
        references: ['OWASP A06:2021 — Vulnerable and Outdated Components'],
        title: 'Possible ReDoS (regex built from input)',
        detail:
          'A regular expression is compiled from untrusted input. An attacker can supply a pattern (or input) that triggers catastrophic backtracking and hangs the event loop, taking the service down.',
        fix: {
          task: 'Avoid compiling a regular expression from untrusted input',
          where: `${file.path} — a RegExp is built from input at the line marked above`,
          problem:
            'A user-controlled regex (or matching user input against a vulnerable pattern) can cause exponential backtracking, freezing the single-threaded event loop — a denial of service.',
          goal: 'Remove attacker control over regex patterns and bound matching cost.',
          steps: [
            'Do not let users provide raw regular expressions; offer a fixed set of safe, pre-defined patterns instead.',
            'If dynamic matching is unavoidable, escape user input before embedding it, and use a linear-time engine (e.g. RE2) or enforce a timeout/length limit.',
            'Audit existing literal patterns for nested quantifiers like (a+)+ or (.*)* that backtrack catastrophically.'
          ]
        },
        test: {
          objective: 'Prove a malicious pattern/input cannot hang the service.',
          steps: [
            'Feed a known ReDoS payload to the input that reaches this regex and measure response time under a strict timeout.',
            'Assert the request completes within the timeout (or is rejected) rather than blocking the event loop.'
          ]
        }
      })
    ]
  }
}

export const dataflowRules: FileRule[] = [
  ssrfRule,
  pathTraversalRule,
  openRedirectRule,
  prototypePollutionRule,
  massAssignmentRule,
  redosRule
]
