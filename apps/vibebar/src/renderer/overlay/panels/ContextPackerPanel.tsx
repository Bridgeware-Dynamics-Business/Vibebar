import { useEffect, useMemo, useRef, useState } from 'react'
import { buildContextHealthWarnings } from '@shared/contextHealth.js'
import type { PackChangedPreview, PackNode, PackResult, ProjectProfile } from '@shared/types.js'
import { ContextHealthBanners } from '../../shared/ContextHealthBanners'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader } from '../../shared/ui'

export function ContextPackerPanel({
  profile,
  onClose,
  onCopyOutcome,
  onPackChanged,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  onClose: () => void
  onCopyOutcome: (copied: boolean, text: string) => void
  onPackChanged?: () => void
  solid?: boolean
  onToggleSolid?: () => void
  /** When provided, shows a Detach button that pops the panel out into a floating window. */
  onDetach?: () => void
}): JSX.Element {
  const [childrenByDir, setChildrenByDir] = useState<Record<string, PackNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<PackResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [changedPreview, setChangedPreview] = useState<PackChangedPreview | null>(null)
  const [changedPaths, setChangedPaths] = useState<string[]>([])
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadDir(dir: string): Promise<void> {
    setLoadingDirs((prev) => new Set(prev).add(dir))
    try {
      const nodes = await window.vibebar.packer.tree(dir)
      setChildrenByDir((prev) => ({ ...prev, [dir]: nodes }))
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev)
        next.delete(dir)
        return next
      })
    }
  }

  useEffect(() => {
    if (profile?.rootPath) {
      void loadDir('')
      void window.vibebar.packer.previewChanged().then(setChangedPreview)
      void window.vibebar.git.changedFiles().then(setChangedPaths)
    } else {
      setChangedPreview(null)
      setChangedPaths([])
    }
  }, [profile?.rootPath])

  const packCharCount = useMemo(() => {
    if (result?.text) return result.text.length
    if (!changedPreview || changedPreview.noProject || changedPreview.noFiles) return 0
    const sel = [...selected]
    if (sel.length === 0) return 0
    const allChangedSelected =
      sel.length === changedPreview.paths.length &&
      sel.every((p) => changedPreview.paths.includes(p))
    return allChangedSelected ? changedPreview.charCount : 0
  }, [result, changedPreview, selected])

  const packerHealthWarnings = useMemo(
    () =>
      buildContextHealthWarnings({
        profile,
        packCharCount,
        selectedPaths: [...selected],
        changedPaths
      }).filter((w) =>
        (['stack-unknown', 'pack-oversized', 'changed-not-in-pack'] as const).includes(w.id)
      ),
    [profile, packCharCount, selected, changedPaths]
  )

  async function toggleDir(path: string): Promise<void> {
    const next = new Set(expanded)
    if (next.has(path)) {
      next.delete(path)
      setExpanded(next)
      return
    }
    next.add(path)
    setExpanded(next)
    if (childrenByDir[path]) return
    if (expandTimer.current) clearTimeout(expandTimer.current)
    expandTimer.current = setTimeout(() => {
      void loadDir(path)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
    }
  }, [])

  function toggleFile(path: string): void {
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
    setResult(null)
  }

  async function pack(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.vibebar.packer.pack([...selected])
      setResult(r)
      onCopyOutcome(r.copied, r.text)
    } finally {
      setBusy(false)
    }
  }

  async function applyPreset(preset: 'changed' | 'tests' | 'config' | 'entry'): Promise<void> {
    if (preset === 'changed') {
      if (onPackChanged) {
        onPackChanged()
        return
      }
      const paths = await window.vibebar.git.changedFiles()
      setSelected(new Set(paths))
      setResult(null)
      return
    }
    const { paths } = await window.vibebar.packer.presetPaths(preset)
    setSelected(new Set(paths))
    setResult(null)
    if (paths.length === 0) return
    for (const dir of [...new Set(paths.map((p) => p.split('/').slice(0, -1).join('/')).filter(Boolean))]) {
      if (!childrenByDir[dir]) await loadDir(dir)
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const p of paths) {
        const parts = p.split('/')
        for (let i = 0; i < parts.length - 1; i++) {
          next.add(parts.slice(0, i + 1).join('/'))
        }
      }
      return next
    })
  }

  function renderNodes(dir: string, depth: number): JSX.Element[] {
    const nodes = childrenByDir[dir] ?? []
    return nodes.flatMap((node) => {
      const rows: JSX.Element[] = [
        <div
          key={node.path}
          className="flex items-center gap-1.5 rounded-md py-1 pr-2 hover:bg-white/5"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {node.isDir ? (
            <button
              type="button"
              onClick={() => void toggleDir(node.path)}
              className="flex items-center gap-1 text-left text-sm text-vibe-text"
            >
              <Icon name={expanded.has(node.path) ? 'ChevronDown' : 'ChevronRight'} size={14} />
              {node.name}
            </button>
          ) : (
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-vibe-muted">
              <input
                type="checkbox"
                checked={selected.has(node.path)}
                onChange={() => toggleFile(node.path)}
                className="accent-vibe-accent"
              />
              {node.name}
            </label>
          )}
        </div>
      ]
      if (node.isDir && expanded.has(node.path)) {
        if (loadingDirs.has(node.path) && !childrenByDir[node.path]?.length) {
          rows.push(
            <div
              key={`${node.path}-loading`}
              className="py-1 pr-2 text-xs text-vibe-muted"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              Loading…
            </div>
          )
        }
        rows.push(...renderNodes(node.path, depth + 1))
      }
      return rows
    })
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Context Packer"
        onClose={onClose}
        solid={solid}
        onToggleSolid={onToggleSolid}
      >
        {onDetach && <DetachButton onDetach={onDetach} label="Detach Context Packer" />}
      </PanelHeader>

      {!profile ? (
        <p className="p-6 text-center text-xs text-vibe-muted">
          Select a project first to browse and pack its files.
        </p>
      ) : (
        <>
          <p className="px-4 pt-3 text-xs text-vibe-muted">
            Pick files to bundle into a clipboard-ready context block. Secrets are stripped
            automatically; dependencies and build output are ignored. Bundles trim to ~32k chars
            (changed files kept first).
          </p>
          <ContextHealthBanners warnings={packerHealthWarnings} className="mx-4 mt-2" />
          <div className="flex flex-wrap gap-1.5 px-4 pt-2">
            {(
              [
                { id: 'changed' as const, label: 'Changed files', icon: 'GitBranch' },
                { id: 'tests' as const, label: 'Tests', icon: 'FlaskConical' },
                { id: 'config' as const, label: 'Config', icon: 'Settings' },
                { id: 'entry' as const, label: 'Entry points', icon: 'Play' }
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => void applyPreset(preset.id)}
                className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium text-vibe-muted hover:bg-white/10 hover:text-vibe-text"
              >
                <Icon name={preset.icon} size={11} />
                {preset.label}
              </button>
            ))}
          </div>
          <div className="vibe-scroll flex-1 overflow-y-auto px-3 py-2">
            {renderNodes('', 0)}
          </div>
          {result && (
            <p className="px-4 py-1.5 text-xs text-vibe-muted">
              Packed {result.fileCount} file{result.fileCount === 1 ? '' : 's'}
              {result.skipped > 0 ? `, skipped ${result.skipped}` : ''}
              {result.findings.length > 0 ? ` \u00b7 ${result.findings.length} secret(s) redacted` : ''}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-vibe-border p-3">
            <span className="text-xs text-vibe-muted">{selected.size} selected</span>
            <div className="flex-1" />
            {onPackChanged && changedPreview && !changedPreview.noProject && !changedPreview.noFiles && (
              <button
                type="button"
                onClick={onPackChanged}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-vibe-text hover:bg-white/15"
                title={`${changedPreview.fileCount} changed file(s), ~${changedPreview.tokenEstimate.toLocaleString()} tokens`}
              >
                <Icon name="GitBranch" size={13} />
                Pack changed (~{changedPreview.tokenEstimate.toLocaleString()} tok)
              </button>
            )}
            <button
              type="button"
              onClick={() => void pack()}
              disabled={selected.size === 0 || busy}
              className="flex items-center gap-1.5 rounded-lg bg-vibe-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              <Icon name="Copy" size={14} /> Pack &amp; copy
            </button>
          </div>
        </>
      )}
    </div>
  )
}
