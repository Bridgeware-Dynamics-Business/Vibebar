import { isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import { confidenceAt } from './astUtils.js'
import type { FileRule } from './types.js'

/** CWE-502: Insecure deserialization of untrusted data into live objects/code. */
export const deserializationRule: FileRule = {
  id: 'insecure-deserialization',
  category: 'Input Validation',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /pickle|marshal|yaml\.load|unserialize|node-serialize|fromJSON\s*\(|cPickle|shelve/.test(c),
  appliesTo: ({ file }) => !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input, isPython } = ctx
    const masked = ctx.masked()
    const re = isPython
      ? /\b(?:pickle|cPickle)\.loads?\s*\(|\bmarshal\.loads?\s*\(|\byaml\.load\s*\((?![^)]*Loader\s*=\s*(?:yaml\.)?(?:Safe|CSafe)Loader)/
      : /\b(?:unserialize|node-serialize)\s*\(|require\(\s*["']node-serialize["']\s*\)/
    const m = re.exec(masked)
    if (!m) return []
    const what = isPython
      ? 'Python pickle/marshal/yaml.load on untrusted data'
      : 'node-serialize unserialize() on untrusted data'
    return [
      fileFinding({
        input,
        file,
        index: m.index,
        id: `insecure-deserialization-${file.path}`,
        category: 'Input Validation',
        severity: 'critical',
        confidence: confidenceAt(ctx, m.index),
        remediationEffort: 'moderate',
        cwe: 'CWE-502 — Deserialization of Untrusted Data',
        references: ['OWASP A08:2021 — Software and Data Integrity Failures'],
        title: 'Insecure deserialization',
        detail: `This uses ${what}. These deserializers can instantiate arbitrary objects or invoke code embedded in the payload, so deserializing attacker-controlled data is remote code execution.`,
        fix: {
          task: 'Replace unsafe deserialization with a safe, data-only format',
          where: `${file.path} — uses an unsafe deserializer at the line marked above`,
          problem:
            'pickle/marshal/node-serialize (and yaml.load without a safe loader) reconstruct live objects and can execute embedded gadgets, turning a crafted payload into code execution.',
          goal: 'Only deserialize untrusted input with a format that cannot execute code.',
          steps: [
            isPython
              ? 'Use yaml.safe_load instead of yaml.load, and prefer JSON for data interchange; never unpickle untrusted bytes.'
              : 'Use JSON.parse for data interchange instead of node-serialize; never unserialize untrusted input.',
            'If a richer format is required, validate the parsed data against a strict schema and disallow custom type construction.',
            'If the data must be trusted, authenticate it (signature/HMAC) before deserializing.'
          ]
        },
        test: {
          objective: 'Prove a malicious serialized payload cannot execute code.',
          steps: [
            'Submit a crafted payload with an embedded gadget/constructor to the input that reaches this deserializer.',
            'Assert no code executes (no spawned process/file/side effect) and the payload is rejected by schema validation.'
          ]
        }
      })
    ]
  }
}
