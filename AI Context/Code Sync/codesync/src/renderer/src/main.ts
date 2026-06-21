import './style.css'
import { MAX_SYNC_INSTANCES } from '../../shared/constants.js'

type InstanceRow = { id: string; sourcePath: string; syncPath: string }

const el = {
  instances: document.querySelector<HTMLDivElement>('#instances')!,
  btnAdd: document.querySelector<HTMLButtonElement>('#btn-add-instance')!,
  instanceHint: document.querySelector<HTMLSpanElement>('#instance-limit-hint')!,
  ignore: document.querySelector<HTMLTextAreaElement>('#ignore')!,
  debounce: document.querySelector<HTMLInputElement>('#debounce')!,
  maxbytes: document.querySelector<HTMLInputElement>('#maxbytes')!,
  btnSave: document.querySelector('#btn-save')!,
  settingsFeedback: document.querySelector<HTMLSpanElement>('#settings-feedback')!
}

let instances: InstanceRow[] = []
/** Running ids from main process — refreshed after start/stop/status */
const runningIds = new Set<string>()

/** Per-instance log lines (survives re-render; capped for memory) */
const instanceLogBuffers = new Map<string, string[]>()
const MAX_LINES_PER_INSTANCE = 250

function mbToBytes(mb: number): number | null {
  if (mb <= 0) return null
  return Math.round(mb * 1024 * 1024)
}

function bytesToMb(bytes: number | null): string {
  if (bytes === null) return '0'
  return String(Math.round(bytes / 1024 / 1024))
}

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`
}

function appendInstanceLog(instanceId: string, line: string): void {
  let buf = instanceLogBuffers.get(instanceId)
  if (!buf) {
    buf = []
    instanceLogBuffers.set(instanceId, buf)
  }
  buf.push(line)
  if (buf.length > MAX_LINES_PER_INSTANCE) {
    buf.splice(0, buf.length - MAX_LINES_PER_INSTANCE)
  }
  const ta = getCard(instanceId)?.querySelector<HTMLTextAreaElement>('.instance-mini-log')
  if (ta) {
    ta.value = buf.join('\n')
    ta.scrollTop = ta.scrollHeight
  }
}

function appendLocalLog(instanceId: string, message: string): void {
  appendInstanceLog(instanceId, `[${new Date().toISOString()}] ${message}`)
}

function updateToolbar(): void {
  const n = instances.length
  el.btnAdd.disabled = n >= MAX_SYNC_INSTANCES
  el.instanceHint.textContent =
    n >= MAX_SYNC_INSTANCES ? `Maximum ${MAX_SYNC_INSTANCES} instances.` : ''
}

function getCard(instanceId: string): HTMLElement | null {
  for (const node of el.instances.querySelectorAll<HTMLElement>('.instance-card')) {
    if (node.dataset.instanceId === instanceId) return node
  }
  return null
}

function syncRunningStateFromMain(): void {
  void window.codesync.syncStatus().then((st) => {
    runningIds.clear()
    for (const x of st.instances) {
      if (x.running) runningIds.add(x.id)
    }
    for (const inst of instances) {
      const card = getCard(inst.id)
      if (!card) continue
      const btnStart = card.querySelector<HTMLButtonElement>('[data-action="start"]')!
      const btnStop = card.querySelector<HTMLButtonElement>('[data-action="stop"]')!
      const btnRemove = card.querySelector<HTMLButtonElement>('[data-action="remove"]')!
      const on = runningIds.has(inst.id)
      btnStart.disabled = on
      btnStop.disabled = !on
      btnRemove.disabled = on || instances.length <= 1
    }
  })
}

function renderInstances(): void {
  el.instances.replaceChildren()
  for (const inst of instances) {
    const card = document.createElement('section')
    card.className = 'instance-card'
    card.dataset.instanceId = inst.id

    const main = document.createElement('div')
    main.className = 'instance-card-main'

    const head = document.createElement('div')
    head.className = 'instance-card-header'
    head.innerHTML = `<span class="instance-title">Instance <code>${shortId(inst.id)}</code></span>`
    main.appendChild(head)

    const srcField = document.createElement('div')
    srcField.className = 'field'
    srcField.innerHTML = `
      <label>Source folder</label>
      <div class="row">
        <input type="text" class="inp-source" readonly placeholder="Choose folder…" value="${escapeAttr(inst.sourcePath)}" />
        <button type="button" data-action="browse-source">Browse…</button>
      </div>
    `
    main.appendChild(srcField)

    const syncField = document.createElement('div')
    syncField.className = 'field'
    syncField.innerHTML = `
      <label>Sync folder</label>
      <div class="row">
        <input type="text" class="inp-sync" readonly placeholder="Choose folder…" value="${escapeAttr(inst.syncPath)}" />
        <button type="button" data-action="browse-sync">Browse…</button>
      </div>
    `
    main.appendChild(syncField)

    const actions = document.createElement('div')
    actions.className = 'instance-actions'
    const on = runningIds.has(inst.id)
    actions.innerHTML = `
      <button type="button" class="primary" data-action="start" ${on ? 'disabled' : ''}>Start</button>
      <button type="button" data-action="stop" ${on ? '' : 'disabled'}>Stop</button>
      <button type="button" data-action="remove" ${on || instances.length <= 1 ? 'disabled' : ''}>Remove</button>
    `
    main.appendChild(actions)

    card.appendChild(main)

    const logWrap = document.createElement('div')
    logWrap.className = 'instance-card-log-wrap'
    const logLabel = document.createElement('label')
    logLabel.className = 'mini-log-label'
    logLabel.textContent = 'Log'
    logLabel.setAttribute('for', `mini-log-${inst.id}`)
    const miniLog = document.createElement('textarea')
    miniLog.id = `mini-log-${inst.id}`
    miniLog.className = 'instance-mini-log'
    miniLog.readOnly = true
    miniLog.spellcheck = false
    miniLog.rows = 10
    miniLog.value = instanceLogBuffers.get(inst.id)?.join('\n') ?? ''
    logWrap.appendChild(logLabel)
    logWrap.appendChild(miniLog)
    card.appendChild(logWrap)

    el.instances.appendChild(card)
  }

  el.instances.querySelectorAll('.instance-card').forEach((card) => {
    const id = (card as HTMLElement).dataset.instanceId
    if (!id) return

    card.querySelector('[data-action="browse-source"]')?.addEventListener('click', async () => {
      const p = await window.codesync.pickFolder()
      if (!p) return
      const inp = card.querySelector<HTMLInputElement>('.inp-source')!
      inp.value = p
      const row = instances.find((i) => i.id === id)
      if (row) row.sourcePath = p
    })

    card.querySelector('[data-action="browse-sync"]')?.addEventListener('click', async () => {
      const p = await window.codesync.pickFolder()
      if (!p) return
      const inp = card.querySelector<HTMLInputElement>('.inp-sync')!
      inp.value = p
      const row = instances.find((i) => i.id === id)
      if (row) row.syncPath = p
    })

    card.querySelector('[data-action="start"]')?.addEventListener('click', () => void startOne(id))
    card.querySelector('[data-action="stop"]')?.addEventListener('click', () => void stopOne(id))
    card.querySelector('[data-action="remove"]')?.addEventListener('click', () => removeOne(id))
  })

  updateToolbar()
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

async function startOne(instanceId: string): Promise<void> {
  const card = getCard(instanceId)
  if (!card) return
  const sourceRoot = card.querySelector<HTMLInputElement>('.inp-source')!.value.trim()
  const destRoot = card.querySelector<HTMLInputElement>('.inp-sync')!.value.trim()
  if (!sourceRoot || !destRoot) {
    appendLocalLog(instanceId, 'Choose both folders first.')
    return
  }
  const debounceMs = Number(el.debounce.value)
  const maxMb = Number(el.maxbytes.value)
  const btnStart = card.querySelector<HTMLButtonElement>('[data-action="start"]')!
  btnStart.disabled = true
  const r = await window.codesync.startSync({
    instanceId,
    sourceRoot,
    destRoot,
    ignoreText: el.ignore.value,
    maxFileBytes: mbToBytes(maxMb),
    debounceMs: Number.isFinite(debounceMs) ? debounceMs : 350
  })
  if (r.ok) {
    runningIds.add(instanceId)
    appendLocalLog(instanceId, 'Sync started.')
    const btnStop = card.querySelector<HTMLButtonElement>('[data-action="stop"]')!
    const btnRemove = card.querySelector<HTMLButtonElement>('[data-action="remove"]')!
    btnStart.disabled = true
    btnStop.disabled = false
    btnRemove.disabled = true
  } else {
    appendLocalLog(instanceId, `Start failed: ${r.error}`)
    btnStart.disabled = false
  }
}

async function stopOne(instanceId: string): Promise<void> {
  const card = getCard(instanceId)
  await window.codesync.stopSync(instanceId)
  runningIds.delete(instanceId)
  appendLocalLog(instanceId, 'Sync stopped.')
  if (card) {
    const btnStart = card.querySelector<HTMLButtonElement>('[data-action="start"]')!
    const btnStop = card.querySelector<HTMLButtonElement>('[data-action="stop"]')!
    const btnRemove = card.querySelector<HTMLButtonElement>('[data-action="remove"]')!
    btnStart.disabled = false
    btnStop.disabled = true
    btnRemove.disabled = instances.length <= 1
  }
}

function removeOne(instanceId: string): void {
  if (instances.length <= 1) return
  if (runningIds.has(instanceId)) return
  instanceLogBuffers.delete(instanceId)
  instances = instances.filter((i) => i.id !== instanceId)
  renderInstances()
}

function addInstance(): void {
  if (instances.length >= MAX_SYNC_INSTANCES) return
  instances.push({
    id: crypto.randomUUID(),
    sourcePath: '',
    syncPath: ''
  })
  renderInstances()
}

async function load(): Promise<void> {
  const c = await window.codesync.loadConfig()
  el.ignore.value = c.ignoreText
  el.debounce.value = String(c.debounceMs)
  el.maxbytes.value = bytesToMb(c.maxFileBytes)
  instances = c.instances.map((x) => ({ ...x }))
  if (instances.length === 0) {
    instances.push({ id: crypto.randomUUID(), sourcePath: '', syncPath: '' })
  }
  renderInstances()
  syncRunningStateFromMain()
}

async function saveSettings(): Promise<void> {
  for (const card of el.instances.querySelectorAll<HTMLElement>('.instance-card')) {
    const id = card.dataset.instanceId
    if (!id) continue
    const row = instances.find((i) => i.id === id)
    if (!row) continue
    row.sourcePath = card.querySelector<HTMLInputElement>('.inp-source')!.value
    row.syncPath = card.querySelector<HTMLInputElement>('.inp-sync')!.value
  }

  const debounceMs = Number(el.debounce.value)
  const maxMb = Number(el.maxbytes.value)
  await window.codesync.saveConfig({
    instances,
    ignoreText: el.ignore.value,
    debounceMs: Number.isFinite(debounceMs) ? debounceMs : 350,
    maxFileBytes: mbToBytes(maxMb)
  })
  el.settingsFeedback.textContent = 'Settings saved.'
  window.setTimeout(() => {
    el.settingsFeedback.textContent = ''
  }, 4000)
}

el.btnAdd.addEventListener('click', () => {
  addInstance()
})

el.btnSave.addEventListener('click', () => void saveSettings())

const un = window.codesync.onLog((entry) => {
  if (!entry?.instanceId || typeof entry.line !== 'string') return
  appendInstanceLog(entry.instanceId, entry.line)
})

void load()

window.addEventListener('beforeunload', () => {
  un()
})
