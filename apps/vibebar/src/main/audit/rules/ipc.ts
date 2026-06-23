import type { AuditFinding } from '@shared/types.js'
import { isElectron, isMainProcessFile, isPreloadFile, isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import type { FileRule } from './types.js'

const VALIDATION_MARKERS =
  /parsePayload|validateIpc|safeParse\s*\(|\.safeParse\s*\(|z\.object\s*\(|zod|SCHEMAS\s*[:=]/i

const HANDLE_RE = /ipcMain\.handle(?:Sync)?\s*\(/g

/**
 * Electron IPC without schema validation is a common vibe-coding footgun: the renderer can send
 * arbitrary payloads that reach filesystem, shell, or spawn handlers in the main process.
 */
export const ipcValidationRule: FileRule = {
  id: 'ipc-validation',
  category: 'Input Validation',
  scope: 'file',
  cap: 8,
  prefilter: (c) => /ipcMain\.(?:handle|handleSync|on)\s*\(/.test(c),
  appliesTo: ({ file, input }) =>
    isElectron(input.ctx) && isMainProcessFile(file.path) && !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const source = file.content

    // Central dispatcher pattern (e.g. registerIpc): every handler calls parsePayload before use.
    if (/parsePayload\s*\(\s*channel|const\s+handle\s*=|function\s+handle\s*\(/i.test(source)) {
      if (VALIDATION_MARKERS.test(source)) return []
    }

    let m: RegExpExecArray | null
    HANDLE_RE.lastIndex = 0
    while ((m = HANDLE_RE.exec(source)) !== null) {
      const snippet = source.slice(m.index, m.index + 700)
      if (VALIDATION_MARKERS.test(snippet)) continue
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `ipc-validation-${file.path}`,
          category: 'Input Validation',
          severity: 'high',
          confidence: 'high',
          remediationEffort: 'moderate',
          cwe: 'CWE-20 — Improper Input Validation',
          references: ['OWASP A04:2021 — Insecure Design', 'Electron Security Checklist — IPC'],
          title: 'IPC handler without payload validation',
          detail:
            'An ipcMain.handle (or handleSync) in this file does not validate incoming renderer payloads with a schema or allowlist before use. A compromised or malicious renderer can send malformed or attacker-controlled data into privileged main-process code.',
          fix: {
            task: 'Validate every IPC payload before it reaches privileged logic',
            where: `${file.path} — ipcMain.handle at the line marked above`,
            problem:
              'Main-process IPC handlers trust renderer input by default. Without a typed schema (Zod, etc.) or a centralized parsePayload gate, any channel can receive unexpected shapes, oversized strings, or traversal paths.',
            goal: 'Route every ipcMain.handle through a single allowlisted, schema-validated dispatcher.',
            steps: [
              'Maintain an allowlist of channel names and a Zod (or equivalent) schema per channel that accepts a payload.',
              'Wrap registration in a helper that calls parsePayload(channel, raw) before the handler body runs.',
              'Reject unknown channels and invalid payloads with an error — never pass raw renderer input to fs, shell, spawn, or path joins.'
            ]
          },
          test: {
            objective: 'Prove invalid IPC payloads are rejected before privileged work runs.',
            steps: [
              'Invoke the channel from a test harness with a malformed payload and assert the handler throws or returns an error without side effects.',
              'Assert a valid minimal payload still succeeds end-to-end.'
            ]
          }
        })
      ]
    }

    return []
  }
}

/** Preload scripts must not expose ipcRenderer or Node primitives directly to the page. */
export const ipcPreloadExposureRule: FileRule = {
  id: 'ipc-preload-exposure',
  category: 'Input Validation',
  scope: 'file',
  cap: 4,
  prefilter: (c) => /contextBridge\.exposeInMainWorld|ipcRenderer/.test(c),
  appliesTo: ({ file, input }) =>
    isElectron(input.ctx) && isPreloadFile(file.path) && !isTestOrExampleFile(file.path),
  run(ctx) {
    const { file, input } = ctx
    const masked = ctx.masked()
    const checks: Array<{
      re: RegExp
      severity: AuditFinding['severity']
      title: string
      detail: string
      problem: string
      goal: string
      steps: string[]
    }> = [
      {
        re: /contextBridge\.exposeInMainWorld\s*\([^)]*ipcRenderer/i,
        severity: 'critical',
        title: 'Preload exposes ipcRenderer to the renderer',
        detail:
          'contextBridge exposes the raw ipcRenderer object to the page. Any XSS in the renderer can invoke every registered IPC channel with arbitrary payloads.',
        problem:
          'The preload bridge must expose a minimal, typed API — not the full ipcRenderer. Exposing ipcRenderer removes the boundary between untrusted page code and privileged IPC.',
        goal: 'Expose only narrow, named methods that forward to specific invoke channels with fixed shapes.',
        steps: [
          'Remove ipcRenderer from contextBridge.exposeInMainWorld.',
          'Define a small api object with one function per allowed operation, each calling ipcRenderer.invoke with a validated payload shape.',
          'Keep contextIsolation: true and never enable nodeIntegration in the BrowserWindow.'
        ]
      },
      {
        re: /contextBridge\.exposeInMainWorld\s*\([^)]*\brequire\b/i,
        severity: 'critical',
        title: 'Preload exposes require() to the renderer',
        detail: 'The preload exposes Node require to the page, effectively granting full main-process capability to renderer JavaScript.',
        problem: 'require in the renderer bypasses Electron sandboxing and turns any XSS into host code execution.',
        goal: 'Remove require from the exposed API; keep Node access in main process only.',
        steps: [
          'Delete require (and process, fs, child_process) from contextBridge.exposeInMainWorld.',
          'Move privileged operations behind validated ipcMain handlers in the main process.'
        ]
      }
    ]

    for (const c of checks) {
      const m = c.re.exec(masked)
      if (!m) continue
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `ipc-preload-exposure-${file.path}`,
          category: 'Input Validation',
          severity: c.severity,
          confidence: 'high',
          remediationEffort: 'moderate',
          cwe: 'CWE-749 — Exposed Dangerous Method or Function',
          references: ['Electron Security Checklist — contextIsolation', 'OWASP A04:2021 — Insecure Design'],
          title: c.title,
          detail: c.detail,
          fix: {
            task: 'Harden the preload bridge to a minimal typed API',
            where: `${file.path} — at the line marked above`,
            problem: c.problem,
            goal: c.goal,
            steps: c.steps
          },
          test: {
            objective: 'Prove the renderer cannot reach ipcRenderer or Node directly.',
            steps: [
              'From DevTools in the renderer, assert window.api (or equivalent) has no ipcRenderer, require, or process.',
              'Assert only the intended narrow methods are exposed.'
            ]
          }
        })
      ]
    }

    return []
  }
}
