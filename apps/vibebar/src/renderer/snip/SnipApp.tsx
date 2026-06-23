import { useCallback, useEffect, useRef, useState } from 'react'
import type { SnipCapture, SnipSaveResult } from '@shared/types.js'
import { Icon } from '../shared/icons'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

type Mode = 'loading' | 'selecting' | 'preview' | 'saved' | 'error'

/** Below this many pixels in either axis a drag is treated as an accidental click, not a selection. */
const MIN_SELECTION = 6

/** A sensible default base name (no extension) suggested in the preview's file-name field. */
function defaultSnipName(date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `snip-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  }
}

export function SnipApp(): JSX.Element {
  const [capture, setCapture] = useState<SnipCapture | null>(null)
  const [mode, setMode] = useState<Mode>('loading')
  const [drag, setDrag] = useState<{ origin: { x: number; y: number }; rect: Rect } | null>(null)
  const [cropped, setCropped] = useState<string | null>(null)
  // User-chosen base name (without the .png extension). Seeded with a timestamped default and
  // preserved across retakes so a name the user typed isn't clobbered when they re-select.
  const [fileName, setFileName] = useState('')
  const [saved, setSaved] = useState<SnipSaveResult | null>(null)
  // The prompt is seeded from the save result but kept editable so the user can append their own
  // instructions ("…and explain the layout bug") before copying it to their AI.
  const [promptText, setPromptText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const cancel = useCallback(() => {
    void window.vibebar.snip.cancel()
  }, [])

  useEffect(() => {
    void window.vibebar.snip.getCapture().then((c) => {
      if (c) {
        setCapture(c)
        setMode('selecting')
      } else {
        setErrorMsg('No screenshot was captured.')
        setMode('error')
      }
    })
  }, [])

  // Esc backs out of the snip entirely; the main process tears the overlay window down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  // Crop the live selection out of the frozen screenshot. The displayed <img> fills the window at
  // 1 CSS px per display point, while its natural size is the device-pixel capture, so the ratio
  // of natural-to-client size maps a CSS-space selection back to source pixels at full resolution.
  const cropSelection = useCallback((rect: Rect): string | null => {
    const img = imgRef.current
    if (!img || !img.clientWidth || !img.clientHeight) return null
    const scaleX = img.naturalWidth / img.clientWidth
    const scaleY = img.naturalHeight / img.clientHeight
    const sw = Math.max(1, Math.round(rect.w * scaleX))
    const sh = Math.max(1, Math.round(rect.h * scaleY))
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, Math.round(rect.x * scaleX), Math.round(rect.y * scaleY), sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL('image/png')
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (mode !== 'selecting' || e.button !== 0) return
      const origin = { x: e.clientX, y: e.clientY }
      setDrag({ origin, rect: { x: origin.x, y: origin.y, w: 0, h: 0 } })
    },
    [mode]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent): void => {
      if (!drag) return
      setDrag({ origin: drag.origin, rect: rectFrom(drag.origin, { x: e.clientX, y: e.clientY }) })
    },
    [drag]
  )

  const onMouseUp = useCallback((): void => {
    if (!drag) return
    const { rect } = drag
    setDrag(null)
    if (rect.w < MIN_SELECTION || rect.h < MIN_SELECTION) return
    const result = cropSelection(rect)
    if (result) {
      setCropped(result)
      setFileName((prev) => prev || defaultSnipName())
      setMode('preview')
    }
  }, [drag, cropSelection])

  const retake = useCallback((): void => {
    setCropped(null)
    setSaved(null)
    setCopied(false)
    setErrorMsg(null)
    setMode('selecting')
  }, [])

  // After a save, start a brand-new snip: also clear the file name so the next capture gets a
  // fresh default rather than reusing (and overwriting) the name we just wrote.
  const snipAnother = useCallback((): void => {
    setFileName('')
    retake()
  }, [retake])

  const doSave = useCallback(async (): Promise<void> => {
    if (!cropped) return
    setSaving(true)
    const result = await window.vibebar.snip.save(cropped, fileName)
    setSaving(false)
    if (result.ok && result.prompt) {
      setSaved(result)
      setPromptText(result.prompt)
      setMode('saved')
      if (result.copied) setCopied(true)
    } else {
      setErrorMsg(result.error ?? 'Could not save the image.')
      setMode('error')
    }
  }, [cropped, fileName])

  const copyPrompt = useCallback(async (): Promise<void> => {
    const text = promptText.trim()
    if (!text) return
    await window.vibebar.clipboard.write(promptText)
    setCopied(true)
  }, [promptText])

  const showCrosshair = mode === 'selecting'

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden ${showCrosshair ? 'cursor-crosshair' : 'cursor-default'}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {capture && (
        <img
          ref={imgRef}
          src={capture.dataUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          style={{ objectFit: 'fill' }}
        />
      )}

      {mode === 'selecting' && (
        <>
          {/* When idle, a flat dim covers everything; mid-drag the selection cuts a bright hole
              into the dim via a huge spread box-shadow, mirroring the OS snipping tool. */}
          {!drag && <div className="pointer-events-none absolute inset-0 bg-black/45" />}
          {drag && drag.rect.w > 0 && drag.rect.h > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-vibe-accent-2"
              style={{
                left: drag.rect.x,
                top: drag.rect.y,
                width: drag.rect.w,
                height: drag.rect.h,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)'
              }}
            >
              <span className="absolute -top-6 left-0 rounded bg-vibe-bg/90 px-1.5 py-0.5 text-[11px] font-medium text-vibe-text">
                {Math.round(drag.rect.w)} × {Math.round(drag.rect.h)}
              </span>
            </div>
          )}
          {!drag && (
            <div className="vibe-glass pointer-events-none absolute left-1/2 top-8 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm text-vibe-text shadow-lg">
              <Icon name="Crop" size={16} className="text-vibe-accent-2" />
              Drag a box around any area · press Esc to cancel
            </div>
          )}
        </>
      )}

      {(mode === 'preview' || mode === 'saved' || mode === 'error') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
          <div className="vibe-glass is-solid flex max-h-[92vh] w-full max-w-xl flex-col gap-4 rounded-2xl p-5 shadow-2xl">
            {mode === 'preview' && cropped && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-vibe-text">
                  <Icon name="Crop" size={16} className="text-vibe-accent-2" />
                  Preview your snip
                </div>
                <div className="flex max-h-[50vh] items-center justify-center overflow-hidden rounded-lg border border-vibe-border bg-black/30 p-2">
                  <img
                    src={cropped}
                    alt="Snip preview"
                    className="max-h-[45vh] max-w-full rounded"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-vibe-muted">
                    File name
                  </label>
                  <div className="flex items-center rounded-lg border border-vibe-border bg-black/40 focus-within:border-vibe-accent-2">
                    <input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      spellCheck={false}
                      placeholder={defaultSnipName()}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-vibe-text focus:outline-none"
                    />
                    <span className="select-none px-3 text-sm text-vibe-muted">.png</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={retake}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-vibe-text transition-colors hover:bg-white/10"
                  >
                    <Icon name="RotateCcw" size={15} />
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => void doSave()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg border border-vibe-accent bg-vibe-accent/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-vibe-accent/30 disabled:opacity-60"
                  >
                    <Icon name={saving ? 'Loader2' : 'Check'} size={15} className={saving ? 'animate-spin' : ''} />
                    {saving ? 'Saving…' : 'Save to AI Context'}
                  </button>
                </div>
              </>
            )}

            {mode === 'saved' && saved && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <Icon name="Check" size={16} />
                  Saved to your AI context folder
                </div>
                {cropped && (
                  <div className="flex max-h-[34vh] items-center justify-center overflow-hidden rounded-lg border border-vibe-border bg-black/30 p-2">
                    <img src={cropped} alt="Saved snip" className="max-h-[30vh] max-w-full rounded" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-vibe-muted">
                    Paste this to your AI — click to edit and add your own notes
                  </label>
                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value)
                      setCopied(false)
                    }}
                    rows={3}
                    spellCheck={false}
                    placeholder="Look at the image…"
                    className="vibe-scroll w-full resize-y rounded-lg border border-vibe-border bg-black/40 px-3 py-2 text-sm text-vibe-text focus:border-vibe-accent-2 focus:outline-none"
                  />
                  <span className="break-all text-[11px] text-vibe-muted">{saved.filePath}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={snipAnother}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-vibe-text transition-colors hover:bg-white/10"
                  >
                    <Icon name="Crop" size={15} />
                    Snip another
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    disabled={!promptText.trim()}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      copied
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-vibe-accent-2/60 bg-vibe-accent-2/15 text-vibe-accent-2 hover:bg-vibe-accent-2/25'
                    }`}
                  >
                    <Icon name={copied ? 'Check' : 'Copy'} size={15} />
                    {copied ? 'Copied!' : 'Copy text'}
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-vibe-text transition-colors hover:bg-white/10"
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            {mode === 'error' && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <Icon name="AlertTriangle" size={16} />
                  Couldn’t finish the snip
                </div>
                <p className="text-sm text-vibe-text">{errorMsg}</p>
                <div className="flex justify-end gap-2">
                  {capture && (
                    <button
                      type="button"
                      onClick={retake}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-vibe-text transition-colors hover:bg-white/10"
                    >
                      <Icon name="RotateCcw" size={15} />
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancel}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-vibe-text transition-colors hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
