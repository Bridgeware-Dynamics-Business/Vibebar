import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { findContextFolder } from '@vibebar/project-detector'
import type { SnipCapture, SnipSaveResult } from '@shared/types.js'
import { createSnipWindow } from '../overlay/windowFactory.js'
import type { ProjectService } from '../project/ProjectService.js'

const PNG_PREFIX = 'data:image/png;base64,'

/** A sortable, filename-safe local timestamp, e.g. 20260621-090800. */
function timestamp(date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

/**
 * Turns an optional user-supplied name into a safe `.png` filename that cannot escape its folder.
 * Strips path separators and characters illegal on Windows, trims trailing dots/spaces, enforces
 * the `.png` extension, and falls back to a timestamped default when the result is empty.
 */
function sanitizeFileName(input: string | undefined): string {
  const fallback = `snip-${timestamp()}.png`
  if (!input) return fallback
  let name = input
    .trim()
    .replace(/[\\/]/g, '') // no directory traversal
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f]/g, '') // characters illegal in Windows filenames
    .replace(/[. ]+$/, '') // Windows forbids trailing dots/spaces
    .trim()
  if (!name) return fallback
  if (!/\.png$/i.test(name)) name += '.png'
  return name
}

/**
 * Drives the "Snip to AI Context" flow. On start it freezes the display under the cursor with
 * `desktopCapturer` *before* showing any UI, so the snip overlay itself never lands in the shot,
 * then opens a fullscreen overlay the user drags a box over. The cropped PNG is written into the
 * active project's AI context folder and a paste-ready prompt is returned for the user's AI.
 */
export class SnipController {
  private readonly projects: ProjectService
  private win: BrowserWindow | null = null
  private capture: SnipCapture | null = null

  constructor(projects: ProjectService) {
    this.projects = projects
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const scale = display.scaleFactor || 1
    const thumbnailSize = {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale)
    }

    let sources: Electron.DesktopCapturerSource[]
    try {
      sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    } catch {
      return { ok: false, error: 'Screen capture was blocked by the system.' }
    }

    const source =
      sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, error: 'Could not capture the screen.' }
    }

    const size = source.thumbnail.getSize()
    this.capture = {
      dataUrl: source.thumbnail.toDataURL(),
      width: size.width,
      height: size.height
    }

    this.close()
    const win = createSnipWindow(display.bounds)
    this.win = win
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.show()
      win.focus()
    })
    return { ok: true }
  }

  getCapture(): SnipCapture | null {
    return this.capture
  }

  async save(dataUrl: string, fileNameInput?: string): Promise<SnipSaveResult> {
    const root = this.projects.getProfile()?.rootPath
    if (!root) {
      return {
        ok: false,
        error: 'Select a project first so the snip has an AI context folder to live in.'
      }
    }

    let folder = await findContextFolder(root)
    if (!folder) {
      await this.projects.addContextFolder()
      folder = await findContextFolder(root)
    }
    if (!folder) {
      return { ok: false, error: 'Could not locate or create the AI context folder.' }
    }

    const base64 = dataUrl.startsWith(PNG_PREFIX) ? dataUrl.slice(PNG_PREFIX.length) : ''
    if (!base64) return { ok: false, error: 'The captured image was empty.' }

    const fileName = sanitizeFileName(fileNameInput)
    const filePath = join(folder, fileName)
    try {
      await writeFile(filePath, Buffer.from(base64, 'base64'))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Could not save the image: ${message}` }
    }

    const relPath = fileName
    const prompt = [
      'You have a UI screenshot saved for vision analysis.',
      '',
      `Image file: ${relPath}`,
      `Folder: ${folder}`,
      '',
      'Instructions:',
      '1. Open and inspect the image — describe what you see in the UI (layout, components, visible text).',
      '2. If this captures a bug or visual issue, explain the problem and likely root cause.',
      '3. Annotate specific regions of concern (e.g. "top-right button", "modal overlay") when relevant.',
      '4. Reference the image path above when suggesting code changes in the project.',
      '5. Do not guess file paths — ask or search the codebase if the relevant source file is unclear.'
    ].join('\n')
    return { ok: true, fileName, folderPath: folder, filePath, prompt }
  }

  cancel(): { ok: boolean } {
    this.close()
    return { ok: true }
  }

  private close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  dispose(): void {
    this.close()
    this.capture = null
  }
}
