import { dialog } from 'electron'
import { scanText } from '../scanner/secretScanner.js'

export const PRE_PASTE_CHAR_WARN = 32_768

export type PrePasteFindingKind = 'secret' | 'oversized' | 'risky-shell'

export interface PrePasteFinding {
  kind: PrePasteFindingKind
  message: string
}

export interface PrePasteScanResult {
  findings: PrePasteFinding[]
  /** Secrets or other warnings require explicit confirmation before paste. */
  requiresConfirmation: boolean
  charCount: number
}

const RISKY_SHELL_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\brm\s+-rf\b/i, label: 'rm -rf' },
  { re: /\bcurl\s+[^\n|]*\|\s*(ba)?sh\b/i, label: 'curl | bash' },
  { re: /\bwget\s+[^\n|]*\|\s*(ba)?sh\b/i, label: 'wget | sh' },
  { re: /\|\s*sudo\s+/i, label: 'pipe to sudo' },
  { re: /powershell\s+-(?:enc|e)\s+/i, label: 'encoded PowerShell' }
]

/** Pure scan of clipboard text before paste-after-open (Quick Launch / Prepare Cursor). */
export function scanPrePasteContent(text: string): PrePasteScanResult {
  const findings: PrePasteFinding[] = []
  const secretScan = scanText(text)

  for (const f of secretScan.findings.slice(0, 5)) {
    findings.push({
      kind: 'secret',
      message: `Possible ${f.kind} detected in clipboard`
    })
  }

  if (text.length > PRE_PASTE_CHAR_WARN) {
    findings.push({
      kind: 'oversized',
      message: `Prompt is ${text.length.toLocaleString()} chars (>${PRE_PASTE_CHAR_WARN.toLocaleString()} warning threshold)`
    })
  }

  for (const { re, label } of RISKY_SHELL_PATTERNS) {
    if (re.test(text)) {
      findings.push({ kind: 'risky-shell', message: `Risky shell pattern: ${label}` })
      break
    }
  }

  return {
    findings,
    requiresConfirmation: findings.length > 0,
    charCount: text.length
  }
}

export type PrePasteDecision = 'paste' | 'copy-only' | 'cancel'

/** Shows native confirmation when scan found issues. Returns paste decision. */
export async function confirmPrePasteGate(scan: PrePasteScanResult): Promise<PrePasteDecision> {
  if (!scan.requiresConfirmation) return 'paste'

  const detail = [
    ...scan.findings.map((f) => `• ${f.message}`),
    '',
    'Paste anyway sends clipboard to Cursor. Copy only opens Cursor without paste.'
  ].join('\n')

  const { response } = await dialog.showMessageBox({
    type: scan.findings.some((f) => f.kind === 'secret') ? 'warning' : 'question',
    title: 'Pre-paste safety check',
    message: 'Review clipboard before pasting into Cursor',
    detail,
    buttons: ['Paste anyway', 'Copy only (no paste)', 'Cancel'],
    defaultId: scan.findings.some((f) => f.kind === 'secret') ? 1 : 0,
    cancelId: 2
  })

  if (response === 0) return 'paste'
  if (response === 1) return 'copy-only'
  return 'cancel'
}

/** Whether the safety gate should run for current settings. */
export function isPrePasteGateEnabled(settings: {
  pasteAfterOpenCursor?: boolean
  prePasteSafetyGate?: boolean
}): boolean {
  if (!settings.pasteAfterOpenCursor) return false
  return settings.prePasteSafetyGate !== false
}
