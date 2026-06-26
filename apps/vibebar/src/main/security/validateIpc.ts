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
  [CH.overlaySetPanel]: z.object({
    open: z.boolean(),
    panelId: z.enum(DETACHABLE_PANEL_IDS).optional()
  }),
  [CH.overlaySetCommandPalette]: z.object({ open: z.boolean() }),
  [CH.overlayDragEnd]: z.object({ x: z.number(), y: z.number() }),

  [CH.projectOpenRecent]: z.object({ path: z.string().min(1).max(4096) }),

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
    paths: z.array(z.string().min(1).max(2048)).max(5000),
    tier: z.enum(['micro', 'standard', 'full']).optional()
  }),
  [CH.packerPresetPaths]: z.object({
    preset: z.enum(['tests', 'config', 'entry'])
  }),
  [CH.packerPackChanged]: z.object({
    tier: z.enum(['micro', 'standard', 'full']).optional()
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

  // Notes — ids are server-generated UUIDs; titles/names are bounded, and the body is bounded so
  // a runaway paste can't balloon the IPC payload. The id is never used to build a path on its
  // own (the service resolves it through the folder's index), so no traversal is possible.
  [CH.notesInit]: z.object({
    projectName: z.string().max(120),
    addToGitignore: z.boolean()
  }),
  [CH.notesCreate]: z.object({ title: z.string().max(200) }),
  [CH.notesRead]: z.object({ id: z.string().min(1).max(64) }),
  [CH.notesSave]: z.object({
    id: z.string().min(1).max(64),
    title: z.string().max(200),
    markdown: z.string().max(500_000)
  }),
  [CH.notesDelete]: z.object({ id: z.string().min(1).max(64) }),
  [CH.notesSetProjectName]: z.object({ projectName: z.string().max(120) }),
  [CH.notesPopOut]: z.object({ id: z.string().min(1).max(64) }),
  [CH.notesAppendMarkdown]: z.object({
    id: z.string().min(1).max(64),
    markdown: z.string().max(50_000)
  }),

  [CH.sessionAppend]: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('prompt'),
      title: z.string().max(200),
      promptId: z.string().min(1).max(128),
      fullText: z.string().max(8192).optional()
    }),
    z.object({
      type: z.literal('terminal-issue'),
      title: z.string().max(200),
      issueId: z.string().min(1).max(64),
      command: z.string().max(8000).optional(),
      fullText: z.string().max(8192).optional(),
      verifyCommand: z.string().max(8000).nullable().optional(),
      verifyStatus: z.enum(['awaiting', 'verified', 'still-broken']).optional()
    }),
    z.object({
      type: z.literal('audit-finding'),
      title: z.string().max(200),
      fingerprint: z.string().min(1).max(128),
      severity: z.string().max(32),
      file: z.string().max(2048).optional(),
      fixExcerpt: z.string().max(2000).optional(),
      fullText: z.string().max(8192).optional(),
      verifyCommand: z.string().max(8000).nullable().optional(),
      verifyStatus: z.enum(['awaiting', 'verified', 'still-broken']).optional()
    }),
    z.object({
      type: z.literal('note'),
      title: z.string().max(200),
      noteId: z.string().min(1).max(64),
      text: z.string().max(2000),
      fullText: z.string().max(8192).optional()
    }),
    z.object({
      type: z.literal('git-diff'),
      title: z.string().max(200),
      fullText: z.string().max(8192).optional()
    })
  ]),
  [CH.sessionTogglePin]: z.object({ id: z.string().min(1).max(64) }),
  [CH.sessionCopyHandoff]: z.object({
    includeGitDiff: z.boolean().optional(),
    pinRecentIfEmpty: z.number().int().min(1).max(20).optional()
  }),
  [CH.sessionCopyFixPrompts]: z.object({}),
  [CH.sessionSetIntent]: z.object({
    goal: z.string().max(2000),
    constraints: z.array(z.string().max(500)).max(32).optional(),
    filesInScope: z.array(z.string().max(512)).max(64).optional(),
    acceptanceCriteria: z.array(z.string().max(500)).max(32).optional(),
    verifyCommand: z.string().max(8000).nullable().optional()
  }),
  [CH.sessionClearIntent]: z.object({}),
  [CH.sessionRerunVerify]: z.object({ entryId: z.string().min(1).max(64) }),
  [CH.projectAppendAgentsMd]: z.object({ markdown: z.string().max(50_000) }),
  [CH.projectSaveStackOverrides]: z.object({
    language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go', 'php', 'unknown', '']).optional(),
    framework: z
      .enum(['electron', 'next', 'react', 'vue', 'svelte', 'fastapi', 'flask', 'django', 'laravel', 'unknown', ''])
      .optional(),
    testRunner: z.enum(['vitest', 'jest', 'pytest', 'playwright', 'unknown', '']).optional()
  }),
  [CH.githubSetDesktopPath]: z.object({ path: z.string().max(4096) }),
  [CH.auditSetRuleDisabled]: z.object({
    ruleId: z.string().min(1).max(64),
    disabled: z.boolean()
  }),

  [CH.terminalRun]: z.object({ command: z.string().min(1).max(8000) }),
  // Resize deltas are bounded to a sane screen-pixel range so a malformed payload can't drive
  // the window to an absurd size; the controller also clamps to min dimensions.
  [CH.terminalResize]: z.object({
    edge: z.enum(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']),
    dx: z.number().finite().min(-20000).max(20000),
    dy: z.number().finite().min(-20000).max(20000)
  }),
  [CH.terminalFixWithContext]: z.object({ issueId: z.string().min(1).max(64).optional() }),
  [CH.terminalDismissIssue]: z.object({ fingerprint: z.string().min(1).max(512) }),
  [CH.auditRunInTerminal]: z.object({ quiet: z.boolean() }),

  [CH.shellStart]: z.object({ shell: z.enum(['powershell', 'cmd', 'bash']) }),
  [CH.shellSetShell]: z.object({ shell: z.enum(['powershell', 'cmd', 'bash']) }),
  // Allow empty strings (a bare Enter) and trailing whitespace; the shell handles them.
  [CH.shellInput]: z.object({ line: z.string().max(8000) }),

  // Quick Launch — the renderer only ever names an app by id; the path is resolved in main.
  [CH.quickLaunchRun]: z.object({
    id: z.string().min(1).max(64),
    pasteAfterOpen: z.boolean().optional(),
    fromCopyToast: z.boolean().optional()
  }),
  [CH.quickLaunchPrepareCursor]: z.object({}),
  [CH.quickLaunchRemove]: z.object({ id: z.string().min(1).max(64) }),
  [CH.quickLaunchLocate]: z.object({ id: z.string().min(1).max(64) }),
  [CH.quickLaunchSetVisible]: z.object({
    id: z.string().min(1).max(64),
    visible: z.boolean()
  }),

  [CH.overlaySetAgentDrawer]: z.object({ open: z.boolean() }),

  [CH.agentCompanionSetDrawerOpen]: z.object({ open: z.boolean() }),
  [CH.agentCompanionSendPrompt]: z.object({ text: z.string().min(1).max(32_000) }),
  [CH.agentCompanionSetMode]: z.object({ mode: z.enum(['agent', 'plan', 'ask']) }),
  [CH.agentCompanionSetModel]: z.object({ modelId: z.string().min(1).max(256) }),
  [CH.agentCompanionSelectChat]: z.object({ chatId: z.string().min(1).max(128) }),
  [CH.agentCompanionDeleteChat]: z.object({ chatId: z.string().min(1).max(128) }),
  [CH.agentCompanionRespondPermission]: z.object({ optionId: z.string().min(1).max(64) }),
  [CH.agentCompanionRespondQuestion]: z.object({
    answers: z.array(
      z.object({
        questionId: z.string().min(1).max(64),
        selectedOptionIds: z.array(z.string().min(1).max(64)).max(32)
      })
    ).max(16)
  }),

  [CH.settingsSave]: z
    .object({
      dock: dockSchema.optional(),
      enabledDisplayIds: z.array(z.string().min(1).max(64)).max(16).optional(),
      errorConsoleDisplayIds: z.array(z.string().min(1).max(64)).max(16).optional(),
      guardrailsEnabled: z.boolean().optional(),
      launchOnStartup: z.boolean().optional(),
      hotkeysEnabled: z.boolean().optional(),
      mcpServerEnabled: z.boolean().optional(),
      pasteAfterOpenCursor: z.boolean().optional(),
      prePasteSafetyGate: z.boolean().optional(),
      autoPinFixWithContext: z.boolean().optional(),
      autoRunVerifyAfterFix: z.boolean().optional(),
      resourceMonitorEnabled: z.boolean().optional(),
      resourceMonitorDisplayIds: z.array(z.string().min(1).max(64)).max(16).optional(),
      resourceMonitorWidgets: z.array(z.enum(['ram', 'cpu', 'disk', 'appMem'])).max(4).optional(),
      resourceMonitorSyncWithToolbar: z.boolean().optional(),
      resourceMonitorPlacement: z.enum(['below', 'above']).optional()
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
