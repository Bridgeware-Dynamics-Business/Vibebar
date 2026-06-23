import type { AuditFinding } from '@shared/types.js'
import { isElectron, isTestOrExampleFile } from '../engine/context.js'
import { fileFinding } from '../engine/prompts.js'
import { confidenceAt } from './astUtils.js'
import type { FileRule } from './types.js'

/**
 * Electron-specific renderer-to-RCE pitfalls beyond the BrowserWindow flags (covered by
 * electronMisconfigRule): opening attacker-controlled URLs externally, enabling <webview>, and
 * loading remote content into a privileged window.
 */
export const electronHardeningRule: FileRule = {
  id: 'electron-hardening',
  category: 'Config',
  scope: 'file',
  cap: 5,
  prefilter: (c) => /openExternal|webviewTag|loadURL|loadFile|setWindowOpenHandler/.test(c),
  appliesTo: ({ file, input }) => isElectron(input.ctx) && !isTestOrExampleFile(file.path),
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
      taintAware?: boolean
    }> = [
      {
        re: /webviewTag\s*:\s*true/,
        severity: 'high',
        title: 'Electron <webview> tag enabled',
        detail: 'webviewTag: true re-introduces the powerful, hard-to-sandbox <webview> element, expanding the renderer attack surface considerably.',
        problem: 'The <webview> tag is notoriously difficult to secure and has a history of sandbox-escape bugs; enabling it widens the path from renderer compromise to host code execution.',
        goal: 'Disable <webview> unless absolutely required, and isolate it if it is.',
        steps: [
          'Set webviewTag: false (the default) unless you genuinely need it.',
          'If a webview is required, set its own secure webPreferences, restrict allowed URLs, and validate every will-navigate / will-attach-webview event.',
          'Prefer a BrowserView or sandboxed iframe with a strict CSP where possible.'
        ]
      },
      {
        re: /\.loadURL\s*\(\s*[`"']https?:\/\//,
        severity: 'medium',
        title: 'Privileged window loads remote content',
        detail: 'A BrowserWindow loads a remote http(s) URL. Remote content in a privileged window means a compromised or MITM\u2019d page can attack your app and, if isolation is weak, the host.',
        problem: 'Loading remote content into the main window exposes it to anything the remote site (or a network attacker) serves; combined with any isolation weakness this becomes host RCE.',
        goal: 'Load only local, packaged content into privileged windows.',
        steps: [
          'Load the app from local files (or a packaged bundle); keep remote content out of privileged windows.',
          'If remote content is unavoidable, render it in a sandboxed BrowserView with contextIsolation + sandbox and a strict CSP.',
          'Handle setWindowOpenHandler and will-navigate to block navigation to untrusted origins.'
        ]
      },
      {
        re: /shell\.openExternal\s*\(/,
        severity: 'high',
        taintAware: true,
        title: 'shell.openExternal with a dynamic target',
        detail: 'shell.openExternal opens a URL/path with the OS handler. If the argument is attacker-influenced, a `file://` or custom-scheme target can execute a local program.',
        problem: 'A dynamic openExternal target lets a malicious link launch arbitrary protocols/programs on the user\u2019s machine (e.g. file:// to a payload), turning a click into code execution.',
        goal: 'Only open vetted, http(s) URLs you control the shape of.',
        steps: [
          'Validate the argument is an http(s) URL (parse it and check the protocol) before calling openExternal; reject file://, custom schemes, and anything else.',
          'Prefer an allowlist of destinations where feasible.',
          'Never pass renderer-supplied strings directly to shell.openExternal without validation.'
        ]
      }
    ]

    for (const c of checks) {
      const m = c.re.exec(masked)
      if (!m) continue
      const confidence = c.taintAware ? confidenceAt(ctx, m.index) : 'high'
      return [
        fileFinding({
          input,
          file,
          index: m.index,
          id: `electron-hardening-${file.path}`,
          category: 'Config',
          severity: c.severity,
          confidence,
          remediationEffort: 'moderate',
          cwe: 'CWE-829 — Inclusion of Functionality from Untrusted Control Sphere',
          references: ['Electron Security Checklist'],
          title: c.title,
          detail: c.detail,
          fix: {
            task: 'Harden an Electron renderer/navigation setting',
            where: `${file.path} — at the line marked above`,
            problem: c.problem,
            goal: c.goal,
            steps: c.steps
          },
          test: {
            objective: 'Prove the hardening holds against a hostile input.',
            steps: [
              'Drive the affected code path with a hostile value (e.g. a file:// URL for openExternal, or a remote URL for navigation).',
              'Assert the dangerous action is blocked/validated and only the intended safe behavior remains.'
            ]
          }
        })
      ]
    }
    return []
  }
}
