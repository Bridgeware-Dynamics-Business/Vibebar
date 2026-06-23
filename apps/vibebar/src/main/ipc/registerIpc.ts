import { app, clipboard, ipcMain } from 'electron'
import type { PromptCategory, PromptTemplate } from '@vibebar/prompt-engine'
import { CH } from '@shared/channels.js'
import type { AuditReport, PackChangedPreview, PackNode, PackResult, ScanResult, ShellType, VibeSettings } from '@shared/types.js'
import type { SessionAppendInput } from '@shared/types.js'
import type { DetachablePanelId } from '@shared/tools.js'
import type { ResizeEdge } from '@shared/terminalApi.js'
import type { ErrorReport } from '@shared/api.js'
import type { AuditService } from '../audit/AuditService.js'
import type { CodeSyncController } from '../codesync/CodeSyncController.js'
import type { ErrorConsoleController } from '../errorconsole/ErrorConsoleController.js'
import type { ConfirmQuitController } from '../overlay/ConfirmQuitController.js'
import type { DetachedPanelController } from '../overlay/DetachedPanelController.js'
import type { OverlayManager } from '../overlay/OverlayManager.js'
import type { NoteWindowController } from '../notes/NoteWindowController.js'
import type { NotesService } from '../notes/NotesService.js'
import { listTree, packContext, estimatePaths, resolvePresetPaths } from '../packer/contextPacker.js'
import type { SessionService } from '../session/SessionService.js'
import type { ProjectService } from '../project/ProjectService.js'
import type { PromptStore } from '../prompts/PromptStore.js'
import { scanText } from '../scanner/secretScanner.js'
import { parsePayload } from '../security/validateIpc.js'
import type { AppStore } from '../settings/store.js'
import { computeOnboardingState } from '../settings/onboarding.js'
import type { TerminalController } from '../terminal/TerminalController.js'
import type { GitStatusService } from '../git/GitStatusService.js'
import type { GitDiffService } from '../git/GitDiffService.js'
import type { GitHubService } from '../github/GitHubService.js'
import type { QuickLaunchService } from '../quicklaunch/QuickLaunchService.js'
import type { SnipController } from '../snip/SnipController.js'
import type { HotkeyController } from '../hotkeys/HotkeyController.js'

export interface IpcDeps {
  store: AppStore
  overlay: OverlayManager
  projects: ProjectService
  prompts: PromptStore
  codesync: CodeSyncController
  detachedPanels: DetachedPanelController
  confirmQuit: ConfirmQuitController
  terminal: TerminalController
  audit: AuditService
  github: GitHubService
  gitStatus: GitStatusService
  gitDiff: GitDiffService
  quickLaunch: QuickLaunchService
  snip: SnipController
  errorConsole: ErrorConsoleController
  notes: NotesService
  noteWindows: NoteWindowController
  session: SessionService
  hotkeys?: HotkeyController
}

function headerLabel(deps: IpcDeps): string {
  const p = deps.projects.getProfile()
  if (!p) return 'project'
  const parts = [p.framework, p.language].filter((x) => x && x !== 'unknown')
  return parts.length ? `${p.folderName} (${parts.join(' \u00b7 ')})` : p.folderName
}

/**
 * Registers every renderer-facing channel through a single validated dispatcher. `handle`
 * runs the channel's allowlist + Zod check before the body, so no handler trusts raw input.
 */
export function registerIpc(deps: IpcDeps): void {
  const {
    store,
    overlay,
    projects,
    prompts,
    codesync,
    detachedPanels,
    confirmQuit,
    terminal,
    audit,
    github,
    gitStatus,
    gitDiff,
    quickLaunch,
    snip,
    errorConsole,
    notes,
    noteWindows,
    session,
    hotkeys
  } = deps

  const handle = <T>(channel: string, fn: (payload: unknown) => T | Promise<T>): void => {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const payload = parsePayload(channel, raw)
      return fn(payload)
    })
  }

  const handleEvent = <T>(
    channel: string,
    fn: (event: Electron.IpcMainInvokeEvent, payload: unknown) => T | Promise<T>
  ): void => {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      const payload = parsePayload(channel, raw)
      return fn(event, payload)
    })
  }

  // Overlay — getState is sender-aware so each monitor's window inits to its own dock.
  handleEvent(CH.overlayGetState, (event) => ({
    layout: overlay.layoutForSender(event.sender),
    settings: store.getSettings(),
    profile: projects.getProfile()
  }))
  handle(CH.overlaySetDock, (p) => overlay.setDock((p as { dock: VibeSettings['dock'] }).dock))
  handleEvent(CH.overlaySetPanel, (event, p) => {
    const { open, panelId } = p as { open: boolean; panelId?: DetachablePanelId }
    return overlay.setPanelForSender(event.sender, open, panelId)
  })
  handle(CH.overlayResetToolbar, () => {
    overlay.resetToolbar()
    return { ok: true }
  })
  handle(CH.overlayCollapsePanel, () => {
    overlay.collapseAllPanels()
    return { ok: true }
  })
  handleEvent(CH.overlaySetCommandPalette, (event, p) => {
    const { open } = p as { open: boolean }
    return overlay.setCommandPaletteForSender(event.sender, open)
  })
  handleEvent(CH.overlaySetActive, (event) => {
    overlay.setActiveForSender(event.sender)
  })

  // Project
  const broadcastProject = (profile: ReturnType<ProjectService['getProfile']>): typeof profile => {
    overlay.broadcast(CH.projectChanged, profile)
    detachedPanels.send(CH.projectChanged, profile)
    noteWindows.broadcast(CH.projectChanged, profile)
    terminal.setProject(profile)
    gitStatus.setProject(profile)
    return profile
  }

  handle(CH.projectSelect, async () => broadcastProject(await projects.select()))
  handle(CH.projectGet, () => projects.getProfile())
  handle(CH.projectListRecents, () => projects.listRecents())
  handle(CH.projectOpenRecent, async (p) => {
    const path = (p as { path: string }).path
    const profile = await projects.openPath(path)
    if (profile) broadcastProject(profile)
    return profile
  })
  handle(CH.projectAddContextFolder, async () => {
    const profile = await projects.addContextFolder()
    overlay.broadcast(CH.projectChanged, profile)
    detachedPanels.send(CH.projectChanged, profile)
    return profile
  })
  handle(CH.projectOpenContextFolder, () => projects.openContextFolder())
  handle(CH.projectGetAiDocs, () => projects.getAiDocs())
  handle(CH.projectAppendAgentsMd, async (p) => {
    const { markdown } = p as { markdown: string }
    return projects.appendAgentsMd(markdown)
  })

  // Prompts
  handle(CH.promptsList, () => prompts.list())
  handle(CH.promptsPreview, (p) => {
    const { promptId, guardrails } = p as { promptId: string; guardrails?: boolean }
    return prompts.preview(promptId, guardrails)
  })
  handle(CH.promptsCopy, async (p) => {
    const promptId = (p as { promptId: string }).promptId
    const result = prompts.copy(promptId)
    if (result.copied) {
      const template = prompts.list().prompts.find((t) => t.id === promptId)
      if (template) {
        await broadcastSession(
          await session.append({
            type: 'prompt',
            title: template.title,
            promptId,
            fullText: result.text
          })
        )
      }
    }
    return result
  })
  handle(CH.promptsToggleFavorite, (p) =>
    prompts.toggleFavorite((p as { promptId: string }).promptId)
  )
  handle(CH.promptsCreate, (p) => prompts.create((p as { template: PromptTemplate }).template))
  handle(CH.promptsDelete, (p) => prompts.delete((p as { promptId: string }).promptId))
  handle(CH.promptsNewDraft, (p) => prompts.newDraft((p as { category: PromptCategory }).category))
  handle(CH.promptsHistory, () => prompts.history())
  handle(CH.promptsSetGuardrails, (p) => prompts.setGuardrails((p as { enabled: boolean }).enabled))

  // Secret Scanner
  handle(CH.scannerScan, (p): ScanResult => scanText((p as { text: string }).text))
  handle(CH.scannerCopyRedacted, (p) => {
    const { redactedText } = scanText((p as { text: string }).text)
    clipboard.writeText(redactedText)
    return { copied: true, redactedText }
  })

  // Context Packer
  handle(CH.packerTree, async (p): Promise<PackNode[]> => {
    const profile = projects.getProfile()
    if (!profile?.rootPath) return []
    return listTree(profile.rootPath, (p as { dir: string }).dir)
  })
  handle(CH.packerPack, async (p): Promise<PackResult> => {
    const profile = projects.getProfile()
    if (!profile?.rootPath) {
      return { copied: false, text: '', fileCount: 0, skipped: 0, findings: [] }
    }
    const out = await packContext({
      rootPath: profile.rootPath,
      relPaths: (p as { paths: string[] }).paths,
      headerLabel: headerLabel(deps)
    })
    let copied = false
    try {
      clipboard.writeText(out.redactedText)
      copied = true
    } catch {
      copied = false
    }
    return {
      copied,
      text: out.redactedText,
      fileCount: out.fileCount,
      skipped: out.skipped,
      findings: out.findings
    }
  })
  handle(CH.packerPreviewChanged, async (): Promise<PackChangedPreview> => {
    const profile = projects.getProfile()
    if (!profile?.rootPath) {
      return { paths: [], charCount: 0, tokenEstimate: 0, fileCount: 0, skipped: 0, noProject: true }
    }
    const paths = await gitDiff.changedFiles()
    if (paths.length === 0) {
      return { paths: [], charCount: 0, tokenEstimate: 0, fileCount: 0, skipped: 0, noFiles: true }
    }
    const est = await estimatePaths(profile.rootPath, paths)
    return {
      paths,
      charCount: est.charCount,
      tokenEstimate: Math.ceil(est.charCount / 4),
      fileCount: est.fileCount,
      skipped: est.skipped
    }
  })
  handle(CH.packerPresetPaths, async (p) => {
    const profile = projects.getProfile()
    if (!profile?.rootPath) return { paths: [], noProject: true }
    const preset = (p as { preset: 'tests' | 'config' | 'entry' }).preset
    const paths = await resolvePresetPaths(profile.rootPath, preset)
    return { paths, noProject: false }
  })
  handle(CH.packerPackChanged, async (): Promise<PackResult> => {
    const profile = projects.getProfile()
    if (!profile?.rootPath) {
      return { copied: false, text: '', fileCount: 0, skipped: 0, findings: [] }
    }
    const paths = await gitDiff.changedFiles()
    if (paths.length === 0) {
      return { copied: false, text: '', fileCount: 0, skipped: 0, findings: [] }
    }
    const out = await packContext({
      rootPath: profile.rootPath,
      relPaths: paths,
      headerLabel: headerLabel(deps)
    })
    let copied = false
    try {
      clipboard.writeText(out.redactedText)
      copied = true
    } catch {
      copied = false
    }
    return {
      copied,
      text: out.redactedText,
      fileCount: out.fileCount,
      skipped: out.skipped,
      findings: out.findings
    }
  })

  // Clipboard fallback
  handle(CH.clipboardWrite, (p) => {
    clipboard.writeText((p as { text: string }).text)
    return { copied: true }
  })

  // Settings
  handle(CH.settingsGet, () => ({ settings: store.getSettings(), displays: overlay.displays() }))
  handle(CH.settingsDisplays, () => overlay.displays())
  handle(CH.settingsSave, (p) => {
    const partial = p as Partial<VibeSettings>
    const prev = store.getSettings()
    const next = store.saveSettings(partial)
    if (partial.launchOnStartup !== undefined) {
      app.setLoginItemSettings({ openAtLogin: next.launchOnStartup })
    }
    if (partial.dock && partial.dock !== prev.dock) {
      overlay.setDock(partial.dock)
    } else {
      overlay.onSettingsChanged()
    }
    // Re-apply the console's monitor selection when it changes (create/destroy per-display windows).
    if (partial.errorConsoleDisplayIds !== undefined) {
      errorConsole.onSettingsChanged()
    }
    if (partial.hotkeysEnabled !== undefined) {
      hotkeys?.refresh()
    }
    return { settings: next, displays: overlay.displays() }
  })

  // Code Sync floating overlay
  handle(CH.codesyncToggle, () => codesync.toggle())
  handle(CH.codesyncHide, () => {
    codesync.hide()
    return { ok: true }
  })

  // Detached panel overlays (popped-out menus). Toggle also hides when visible, so a detached
  // window's own close button reuses this channel.
  handle(CH.panelDetach, (p) =>
    detachedPanels.toggle((p as { panelId: DetachablePanelId }).panelId)
  )

  // Smart Terminal
  handle(CH.terminalToggle, () => terminal.toggle())
  handle(CH.terminalRun, (p) => terminal.run((p as { command: string }).command))
  handle(CH.terminalCancel, () => {
    terminal.cancel()
    return { ok: true }
  })
  handle(CH.terminalClear, () => {
    terminal.clear()
    return { ok: true }
  })
  handle(CH.terminalGetState, () => terminal.getState())
  handle(CH.terminalIsOpen, () => ({ open: terminal.isOpen() }))
  handle(CH.terminalGetHints, () => terminal.getHints())
  handle(CH.terminalHide, () => {
    terminal.hide()
    return { ok: true }
  })
  // Renderer-driven resize: the terminal window is frameless + transparent (no OS resize border
  // on Windows), so its edge grips snapshot the bounds then stream cumulative deltas here.
  handle(CH.terminalResizeStart, () => {
    terminal.resizeStart()
    return { ok: true }
  })
  handle(CH.terminalResize, (p) => {
    const { edge, dx, dy } = p as { edge: ResizeEdge; dx: number; dy: number }
    terminal.resizeBy(edge, dx, dy)
    return { ok: true }
  })

  // Built-in interactive shell (expandable bottom terminal)
  handle(CH.shellStart, (p) => {
    terminal.shellStart((p as { shell: ShellType }).shell)
    return { ok: true }
  })
  handle(CH.shellInput, (p) => {
    terminal.shellInput((p as { line: string }).line)
    return { ok: true }
  })
  handle(CH.shellSetShell, (p) => {
    terminal.shellSetShell((p as { shell: ShellType }).shell)
    return { ok: true }
  })
  handle(CH.shellStop, () => {
    terminal.shellStop()
    return { ok: true }
  })
  handle(CH.shellProjectCommands, () => terminal.projectCommands())

  // Security Audit — `run` returns the report for the panel and, when the Smart Terminal is
  // already open, mirrors the findings there live (no window is forced open). `scan` always
  // opens the terminal and presents the full banner. Both carry copy-to-LLM context.
  handle(CH.auditRun, async (): Promise<AuditReport> => {
    const report = await audit.run()
    const mirrored = terminal.mirrorAuditIfOpen(report)
    return { ...report, mirroredToTerminal: mirrored }
  })
  handle(CH.auditScan, async () => {
    await terminal.beginAudit()
    const report = await audit.run()
    terminal.presentAudit(report)
    return { visible: true, findings: report.findings.length, noProject: report.noProject }
  })
  // Triggered from inside the Smart Terminal (its Run audit button + auto-scan). Presents in the
  // already-open terminal; `quiet` keeps the scrollback clean for repeated/auto runs.
  handle(CH.auditRunInTerminal, async (p) => {
    const quiet = Boolean((p as { quiet?: boolean } | undefined)?.quiet)
    const report = await audit.run()
    terminal.presentAudit(report, { quiet })
    return { findings: report.findings.length, noProject: report.noProject }
  })
  // Export the latest audit as SARIF 2.1.0 (CI / GitHub code scanning) or a Markdown report.
  handle(CH.auditExportSarif, () => audit.exportTo('sarif'))
  handle(CH.auditExportMarkdown, () => audit.exportTo('markdown'))
  handle(CH.auditGetConfig, () => audit.getConfigView())
  handle(CH.auditAcceptRisk, async (p) => {
    const { fingerprint } = p as { fingerprint: string }
    return audit.acceptRisk(fingerprint)
  })
  handle(CH.auditSetRuleDisabled, async (p) => {
    const { ruleId, disabled } = p as { ruleId: string; disabled: boolean }
    return audit.setRuleDisabled(ruleId, disabled)
  })

  // Snip to AI Context — freeze the screen, draw a box, save the crop, hand back a paste-ready
  // prompt. `save` accepts only a png data URL (validated in validateIpc) and writes inside the
  // active project's AI context folder.
  handle(CH.snipStart, () => snip.start())
  handle(CH.snipGetCapture, () => snip.getCapture())
  handle(CH.snipSave, async (p) => {
    const { dataUrl, fileName } = p as { dataUrl: string; fileName?: string }
    const result = await snip.save(dataUrl, fileName)
    if (result.ok && result.prompt) {
      try {
        clipboard.writeText(result.prompt)
        return { ...result, copied: true }
      } catch {
        return { ...result, copied: false }
      }
    }
    return result
  })
  handle(CH.snipCancel, () => snip.cancel())

  // Notes — project-scoped Markdown notes. Mutations broadcast the refreshed state so the inline
  // panel, any detached Notes window, and every open sticky note stay in sync regardless of which
  // surface made the change.
  function broadcastNotes<T>(result: T): T {
    const state = result && typeof result === 'object' && 'state' in result ? result.state : result
    overlay.broadcast(CH.notesChanged, state)
    detachedPanels.send(CH.notesChanged, state)
    noteWindows.broadcast(CH.notesChanged, state)
    return result
  }
  handle(CH.notesGetState, () => notes.getState())
  handle(CH.notesInit, async (p) => {
    const { projectName, addToGitignore } = p as { projectName: string; addToGitignore: boolean }
    return broadcastNotes(await notes.init(projectName, addToGitignore))
  })
  handle(CH.notesCreate, async (p) =>
    broadcastNotes(await notes.create((p as { title: string }).title))
  )
  handle(CH.notesRead, (p) => notes.read((p as { id: string }).id))
  handle(CH.notesSave, async (p) => {
    const { id, title, markdown } = p as { id: string; title: string; markdown: string }
    return broadcastNotes(await notes.save(id, title, markdown))
  })
  handle(CH.notesDelete, async (p) =>
    broadcastNotes(await notes.delete((p as { id: string }).id))
  )
  handle(CH.notesSetProjectName, async (p) =>
    broadcastNotes(await notes.setProjectName((p as { projectName: string }).projectName))
  )
  handle(CH.notesPopOut, (p) => noteWindows.popOut((p as { id: string }).id))
  handle(CH.notesAppendMarkdown, async (p) => {
    const { id, markdown } = p as { id: string; markdown: string }
    return broadcastNotes(await notes.appendMarkdown(id, markdown))
  })
  handle(CH.notesFindSessionLog, async () => broadcastNotes(await notes.findOrCreateSessionLog()))

  function broadcastSession(state: Awaited<ReturnType<SessionService['getState']>>): typeof state {
    overlay.broadcast(CH.sessionChanged, state)
    detachedPanels.send(CH.sessionChanged, state)
    return state
  }
  handle(CH.sessionGetState, () => session.getState())
  handle(CH.sessionAppend, async (p) =>
    broadcastSession(await session.append(p as SessionAppendInput))
  )
  handle(CH.sessionTogglePin, async (p) =>
    broadcastSession(await session.togglePin((p as { id: string }).id))
  )
  handle(CH.sessionClear, async () => broadcastSession(await session.clear()))
  handle(CH.sessionCopyHandoff, async (p) => {
    const includeGitDiff = (p as { includeGitDiff?: boolean } | undefined)?.includeGitDiff ?? true
    return session.buildHandoffPrompt(includeGitDiff)
  })
  handle(CH.sessionCopyFixPrompts, () => session.buildFixPromptsBundle())

  // GitHub Desktop + live change tracking
  handle(CH.githubOpen, () => github.open(projects.getProfile()?.rootPath ?? null))
  handle(CH.gitStatus, () => gitStatus.getStatus())
  handle(CH.gitCopyDiffPrompt, async () => {
    const result = await gitDiff.copyDiffPrompt()
    if (result.copied) {
      await broadcastSession(
        await session.append({
          type: 'git-diff',
          title: 'Git diff copied',
          fullText: result.text
        })
      )
    }
    return result
  })
  handle(CH.gitChangedFiles, () => gitDiff.changedFiles())

  // In-app error console — a renderer reports an already-redacted error (validated above); main is
  // a pure local forwarder that surfaces the always-on-top console window. Nothing leaves the app.
  handle(CH.errorsReport, (p) => {
    errorConsole.report((p as { report: ErrorReport }).report)
    return { ok: true }
  })
  handle(CH.errorsClear, () => {
    errorConsole.clear()
    return { ok: true }
  })
  handle(CH.errorsClose, () => {
    errorConsole.close()
    return { ok: true }
  })

  // Quick Launch — mutations broadcast the new list so the toolbar and any detached Settings
  // window stay in sync regardless of which surface triggered the change.
  const broadcastQuickLaunch = (apps: ReturnType<QuickLaunchService['list']>): typeof apps => {
    overlay.broadcast(CH.quickLaunchChanged, apps)
    detachedPanels.send(CH.quickLaunchChanged, apps)
    return apps
  }
  handle(CH.quickLaunchList, () => quickLaunch.list())
  handle(CH.quickLaunchRun, (p) =>
    quickLaunch.launch((p as { id: string }).id, projects.getProfile()?.rootPath ?? null)
  )
  handle(CH.quickLaunchAdd, async () => broadcastQuickLaunch(await quickLaunch.add()))
  handle(CH.quickLaunchRemove, (p) =>
    broadcastQuickLaunch(quickLaunch.remove((p as { id: string }).id))
  )
  handle(CH.quickLaunchLocate, async (p) =>
    broadcastQuickLaunch(await quickLaunch.locate((p as { id: string }).id))
  )
  handle(CH.quickLaunchSetVisible, (p) => {
    const { id, visible } = p as { id: string; visible: boolean }
    return broadcastQuickLaunch(quickLaunch.setVisible(id, visible))
  })

  // Lifecycle — the overlay has no taskbar entry, so the renderer needs an explicit quit. The
  // power button opens a centered confirmation popup; its Yes reuses appQuit, its No cancels.
  handle(CH.appGetOnboardingState, () =>
    computeOnboardingState(Boolean(projects.getProfile()), store.isOnboardingComplete())
  )
  handle(CH.appCompleteOnboarding, () => {
    store.setOnboardingComplete(true)
    return computeOnboardingState(Boolean(projects.getProfile()), true)
  })
  handle(CH.appQuit, () => {
    app.quit()
    return { ok: true }
  })
  handle(CH.appConfirmQuit, () => {
    confirmQuit.open()
    return { ok: true }
  })
  handle(CH.appCancelQuit, () => {
    confirmQuit.close()
    return { ok: true }
  })
}
