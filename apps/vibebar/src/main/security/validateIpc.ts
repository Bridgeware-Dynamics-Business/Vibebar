import { PROMPT_CATEGORIES } from '@vibebar/prompt-engine'
import { z } from 'zod'
import { CH, INVOKABLE_CHANNELS, type ChannelName } from '@shared/channels.js'
import { DETACHABLE_PANEL_IDS } from '@shared/tools.js'

const dockSchema = z.enum(['left', 'right', 'top'])

const promptVariableSchema = z.object({
  key: z.string().min(1).max(64),
  source: z.string().min(1).max(64),
  default: z.string().max(512),
  label: z.string().max(64).optional()
})

const promptTemplateSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  categories: z.array(z.enum(PROMPT_CATEGORIES)).min(1),
  stacks: z.array(z.string().min(1).max(40)).min(1),
  description: z.string().max(400),
  variables: z.array(promptVariableSchema).max(20),
  guardrails: z.array(z.string().min(1).max(64)).max(20),
  body: z.string().min(1).max(20000),
  favorite: z.boolean().optional(),
  usageCount: z.number().int().min(0).optional(),
  builtIn: z.boolean().optional()
})

const promptIdPayload = z.object({ promptId: z.string().min(1).max(128) })

/** Payload schemas per channel. Channels with no entry take no payload. */
const SCHEMAS: Partial<Record<ChannelName, z.ZodTypeAny>> = {
  [CH.overlaySetDock]: z.object({ dock: dockSchema }),
  [CH.overlaySetPanel]: z.object({ open: z.boolean() }),

  [CH.promptsPreview]: z.object({
    promptId: z.string().min(1).max(128),
    guardrails: z.boolean().optional()
  }),
  [CH.promptsCopy]: promptIdPayload,
  [CH.promptsToggleFavorite]: promptIdPayload,
  [CH.promptsDelete]: promptIdPayload,
  [CH.promptsCreate]: z.object({ template: promptTemplateSchema }),
  [CH.promptsNewDraft]: z.object({ category: z.enum(PROMPT_CATEGORIES) }),
  [CH.promptsSetGuardrails]: z.object({ enabled: z.boolean() }),

  [CH.scannerScan]: z.object({ text: z.string().max(500_000) }),
  [CH.scannerCopyRedacted]: z.object({ text: z.string().max(500_000) }),

  [CH.packerTree]: z.object({ dir: z.string().max(2048) }),
  [CH.packerPack]: z.object({
    paths: z.array(z.string().min(1).max(2048)).max(5000)
  }),

  [CH.clipboardWrite]: z.object({ text: z.string().max(1_000_000) }),

  [CH.panelDetach]: z.object({ panelId: z.enum(DETACHABLE_PANEL_IDS) }),

  // The cropped region is a PNG data URL. Bounded generously so a large selection still fits,
  // and pinned to the png data-URL prefix so the handler never decodes arbitrary input.
  [CH.snipSave]: z.object({
    dataUrl: z
      .string()
      .min(1)
      .max(64_000_000)
      .startsWith('data:image/png;base64,'),
    // Optional user-chosen name; sanitized + extension-enforced in the controller before any
    // filesystem use, so an unsafe value here can never escape the AI context folder.
    fileName: z.string().max(200).optional()
  }),

  // Error console — the renderer sends an already-redacted report. Bounds keep a runaway stack
  // from ballooning the IPC payload; strings are still rendered with textContent on the far side.
  [CH.errorsReport]: z.object({
    report: z
      .object({
        id: z.string().min(1).max(64),
        kind: z.enum(['error', 'unhandledrejection']),
        message: z.string().max(20_000),
        source: z.string().max(4096),
        line: z.number().int().nullable(),
        column: z.number().int().nullable(),
        stack: z.string().max(40_000),
        timestamp: z.string().max(40)
      })
      .strict()
  }),

  [CH.terminalRun]: z.object({ command: z.string().min(1).max(8000) }),
  [CH.auditRunInTerminal]: z.object({ quiet: z.boolean() }),

  [CH.shellStart]: z.object({ shell: z.enum(['powershell', 'cmd', 'bash']) }),
  [CH.shellSetShell]: z.object({ shell: z.enum(['powershell', 'cmd', 'bash']) }),
  // Allow empty strings (a bare Enter) and trailing whitespace; the shell handles them.
  [CH.shellInput]: z.object({ line: z.string().max(8000) }),

  // Quick Launch — the renderer only ever names an app by id; the path is resolved in main.
  [CH.quickLaunchRun]: z.object({ id: z.string().min(1).max(64) }),
  [CH.quickLaunchRemove]: z.object({ id: z.string().min(1).max(64) }),
  [CH.quickLaunchLocate]: z.object({ id: z.string().min(1).max(64) }),

  [CH.settingsSave]: z
    .object({
      dock: dockSchema.optional(),
      enabledDisplayIds: z.array(z.string().min(1).max(64)).max(16).optional(),
      guardrailsEnabled: z.boolean().optional(),
      launchOnStartup: z.boolean().optional()
    })
    .strict()
}

export function isInvokableChannel(channel: string): channel is ChannelName {
  return INVOKABLE_CHANNELS.includes(channel)
}

/**
 * Validates a payload for a channel. Throws on an unknown channel or a payload that fails
 * its schema. Channels with no schema accept no payload and return undefined.
 */
export function parsePayload(channel: string, payload: unknown): unknown {
  if (!isInvokableChannel(channel)) {
    throw new Error(`Channel not allowed: ${channel}`)
  }
  const schema = SCHEMAS[channel]
  if (!schema) return undefined
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new Error(`Invalid payload for ${channel}: ${result.error.issues[0]?.message ?? 'unknown'}`)
  }
  return result.data
}

export { promptTemplateSchema }
