import { isClientFile, isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import { confidenceAt } from './astUtils.js'
import type { FileRule } from './types.js'

/** CWE-79: dangerous DOM sinks that AI code introduces 2.7x more often. */
export const dangerousSinkRule: FileRule = {
  id: 'xss-sink',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|v-html|@html|eval|new Function/.test(c),
  appliesTo: ({ file, input }) => isClientFile(file.path, input.ctx),
  run(ctx) {
    const { file, input } = ctx
    const re = /(dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\(|v-html|\{@html|\beval\(|new Function\()/
    const m = re.exec(ctx.masked())
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `xss-sink-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-79 — Improper Neutralization of Input During Web Page Generation (XSS)',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Dangerous DOM/eval sink',
        detail: `\`${m[1]}\` can introduce XSS or code injection if it ever receives untrusted data.`,
        fix: {
          task: 'Replace a dangerous DOM/eval sink with safe rendering',
          where: `${file.path} — uses \`${m[1]}\` at the line marked above`,
          problem: `\`${m[1]}\` executes or injects raw markup/code. If the data it receives can ever be influenced by a user, this becomes XSS or code injection.`,
          goal: 'Render untrusted data inertly so it can never execute.',
          steps: [
            'Determine whether the data passed to this sink can ever be user-influenced (directly or via stored/fetched values).',
            'If it can, replace the sink with safe rendering: text nodes / framework text binding, or sanitize with a vetted library (e.g. DOMPurify) before insertion.',
            'Prefer eliminating the sink entirely over sanitizing where possible.'
          ],
          extraSafety: ['Do not "fix" this by sanitizing on the client only if the same data is also rendered elsewhere — sanitize at the point of insertion.']
        },
        test: {
          objective: 'Prove an injected payload is rendered as inert text and never executes.',
          steps: [
            'Submit a payload like `<img src=x onerror=alert(1)>` through the input that reaches this sink.',
            'Assert it appears as escaped/inert text in the DOM.',
            'Assert no script/handler from the payload executes (e.g. no dialog/side effect fires).'
          ]
        }
      })
    ]
  }
}

/** CWE-89: SQL built from user input via interpolation/concatenation instead of parameters. */
export const sqlInjectionRule: FileRule = {
  id: 'sql-injection',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /query|execute|raw|executemany|\.text\(/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    const jsRe = /\b(?:query|execute|raw)\s*\(\s*`[^`]*\$\{|\b(?:query|execute)\s*\(\s*["'][^"']*["']\s*\+/
    const pyRe =
      /\b(?:execute|executemany|raw|text)\s*\(\s*f["']|\b(?:execute|executemany)\s*\(\s*["'][^"']*%[^"']*["']\s*%|\.execute\([^)]*\.format\(/
    const re = isPython ? pyRe : jsRe
    const m = re.exec(ctx.masked())
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `sql-injection-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-89 — Improper Neutralization of Special Elements used in an SQL Command',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Possible SQL injection (query built from input)',
        detail:
          'A database query appears to be assembled with string interpolation or concatenation. If any interpolated value comes from a request, an attacker can rewrite the query (read/dump/drop data).',
        fix: {
          task: 'Convert a string-built SQL query to a parameterized query',
          where: `${file.path} — a query is built with interpolation/concatenation at the line marked above`,
          problem:
            'The query text is assembled from strings. If user input flows into it, the input becomes executable SQL — this is the classic SQL injection vulnerability.',
          goal: 'Send all values as bound parameters so input can never alter the query structure.',
          steps: [
            'Rewrite the query to use placeholders/bound parameters (or the ORM), passing values separately from the SQL text.',
            'For any dynamic identifier (table/column/ORDER BY) that cannot be parameterized, validate it against a fixed allowlist.',
            'Trace each interpolated value back to its source and confirm none of it reaches the SQL string directly.'
          ]
        },
        test: {
          objective: 'Prove the endpoint is not exploitable via SQL injection.',
          steps: [
            'Send injection payloads (e.g. `\' OR \'1\'=\'1`, `; DROP TABLE`, UNION SELECT) to the field that reaches this query.',
            'Assert the input is treated as data: the query returns no extra rows and no error reveals the SQL.',
            'Confirm a normal value still returns the correct result.'
          ]
        }
      })
    ]
  }
}

/** CWE-78: OS command built from input / shell=True with dynamic content. */
export const commandInjectionRule: FileRule = {
  id: 'command-injection',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /exec|execSync|os\.system|subprocess/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    const jsRe = /\b(?:exec|execSync)\s*\(\s*`[^`]*\$\{|\b(?:exec|execSync)\s*\(\s*["'][^"']*["']\s*\+/
    const pyRe = /\bos\.system\s*\(\s*f["']|\bos\.system\s*\([^)]*\+|subprocess\.\w+\([^)]*shell\s*=\s*True/
    const re = isPython ? pyRe : jsRe
    const m = re.exec(ctx.masked())
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `command-injection-${file.path}`,
        category: 'Input Validation',
        severity: 'critical',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-78 — Improper Neutralization of Special Elements used in an OS Command',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Possible OS command injection',
        detail:
          'A shell command appears to be built from dynamic input (string interpolation/concatenation, or shell=True). If input reaches it, an attacker can run arbitrary commands on the server.',
        fix: {
          task: 'Eliminate OS command injection by avoiding the shell and passing args safely',
          where: `${file.path} — a command is built from dynamic input at the line marked above`,
          problem:
            'Building a shell command from input (or running with the shell enabled) lets an attacker inject extra commands via metacharacters (;, |, &&, $()). This is remote code execution.',
          goal: 'Run the program directly with an argument array and no shell, or remove the shell-out entirely.',
          steps: [
            'Replace the shell invocation with a call that passes the program and an explicit args array (no shell interpretation).',
            'If a value must be dynamic, validate it strictly against an allowlist; never pass raw input to a shell.',
            'Prefer a native library over shelling out where one exists.'
          ]
        },
        test: {
          objective: 'Prove command injection is not possible through this code path.',
          steps: [
            'Send payloads with shell metacharacters (e.g. `; id`, `&& whoami`, `$(touch /tmp/x)`) to the input that reaches the command.',
            'Assert no injected command executes (no side effect/file created) and the input is treated as a literal argument.'
          ]
        }
      })
    ]
  }
}

/** CWE-943: NoSQL/Mongo operator injection from a request object. */
export const nosqlInjectionRule: FileRule = {
  id: 'nosql-injection',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /\$where|find|findOne|updateOne|deleteOne|deleteMany|aggregate/.test(c),
  appliesTo: ({ file, isPython }) => !isTestOrExampleFile(file.path) && !isPython,
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    // Either a $where with a dynamic expression, or a collection op fed straight from the request.
    const re =
      /\$where\s*:|\.(find|findOne|updateOne|updateMany|deleteOne|deleteMany|aggregate|count|countDocuments)\s*\(\s*(?:req|request|ctx)\.(?:body|query|params)/
    const m = re.exec(masked)
    if (!m) return []
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `nosql-injection-${file.path}`,
        category: 'Input Validation',
        severity: 'high',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-943 — Improper Neutralization of Special Elements in Data Query Logic',
        references: ['OWASP A03:2021 — Injection'],
        title: 'Possible NoSQL injection',
        detail:
          'A document-store query is built from a request object (or uses $where with a dynamic expression). An attacker can pass operator objects like `{ "$ne": null }` or `{ "$gt": "" }` to bypass filters or auth.',
        fix: {
          task: 'Harden a NoSQL query against operator injection',
          where: `${file.path} — a query is built from request input at the line marked above`,
          problem:
            'Passing a raw request object as a query filter lets an attacker substitute MongoDB operators (`$ne`, `$gt`, `$where`, `$regex`) for scalar values, turning a lookup into an authorization or filter bypass.',
          goal: 'Coerce query inputs to their expected scalar types and never accept attacker-supplied operators.',
          steps: [
            'Validate and coerce each query field to its expected primitive type (string/number/ObjectId) with a schema before querying.',
            'Reject objects where a scalar is expected; never spread `req.body`/`req.query` directly into a filter.',
            'Avoid `$where` and any JavaScript-evaluated query; use typed query builders instead.'
          ]
        },
        test: {
          objective: 'Prove operator-injection payloads cannot bypass the query.',
          steps: [
            'Send payloads such as `{ "$ne": null }`, `{ "$gt": "" }`, and `{ "$regex": ".*" }` to the field that reaches this query.',
            'Assert each is rejected (4xx) or treated as a literal that matches nothing — never as a query operator.',
            'Confirm a normal scalar value still returns the correct document.'
          ]
        }
      })
    ]
  }
}
