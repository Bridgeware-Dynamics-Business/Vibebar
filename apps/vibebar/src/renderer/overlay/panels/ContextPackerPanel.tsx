import { useEffect, useState } from 'react'
import type { PackNode, PackResult, ProjectProfile } from '@shared/types.js'
import { Icon } from '../../shared/icons'
import { DetachButton, PanelHeader } from '../../shared/ui'

export function ContextPackerPanel({
  profile,
  onClose,
  onCopyOutcome,
  solid,
  onToggleSolid,
  onDetach
}: {
  profile: ProjectProfile | null
  onClose: () => void
  onCopyOutcome: (copied: boolean, text: string) => void
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

  async function loadDir(dir: string): Promise<void> {
    const nodes = await window.vibebar.packer.tree(dir)
    setChildrenByDir((prev) => ({ ...prev, [dir]: nodes }))
  }

  useEffect(() => {
    if (profile?.rootPath) void loadDir('')
  }, [profile?.rootPath])

  async function toggleDir(path: string): Promise<void> {
    const next = new Set(expanded)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
      if (!childrenByDir[path]) await loadDir(path)
    }
    setExpanded(next)
  }

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
            automatically; dependencies and build output are ignored.
          </p>
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
          <div className="flex items-center gap-2 border-t border-vibe-border p-3">
            <span className="text-xs text-vibe-muted">{selected.size} selected</span>
            <div className="flex-1" />
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
