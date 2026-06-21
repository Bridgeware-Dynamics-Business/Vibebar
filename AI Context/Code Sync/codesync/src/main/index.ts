import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import { SyncManager } from './sync/manager.js'
import { validateConfigSave, validateSyncStart } from './validate.js'
import type { AppConfig } from './validate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolvePreloadPath(): string {
  const js = join(__dirname, '../preload/index.js')
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(js)) return js
  if (existsSync(mjs)) return mjs
  return js
}

const syncManager = new SyncManager()

const store = new Store<AppConfig>({
  defaults: {
    instances: [],
    ignoreText: '',
    maxFileBytes: 100 * 1024 * 1024,
    debounceMs: 350
  }
})

function migrateConfigFromV1(): void {
  const s = store.store as unknown as Record<string, unknown>
  if (!Array.isArray(s['instances'])) {
    const sp = typeof s['sourcePath'] === 'string' ? s['sourcePath'] : ''
    const sy = typeof s['syncPath'] === 'string' ? s['syncPath'] : ''
    store.set('instances', [{ id: randomUUID(), sourcePath: sp, syncPath: sy }])
  } else if ((s['instances'] as unknown[]).length === 0) {
    const sp = typeof s['sourcePath'] === 'string' ? s['sourcePath'] : ''
    const sy = typeof s['syncPath'] === 'string' ? s['syncPath'] : ''
    if (sp || sy) {
      store.set('instances', [{ id: randomUUID(), sourcePath: sp, syncPath: sy }])
    } else {
      store.set('instances', [{ id: randomUUID(), sourcePath: '', syncPath: '' }])
    }
  }
  if ('sourcePath' in s) {
    store.delete('sourcePath' as keyof AppConfig)
  }
  if ('syncPath' in s) {
    store.delete('syncPath' as keyof AppConfig)
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 780,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Code Sync'
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function pickFolderParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

app.whenReady().then(() => {
  migrateConfigFromV1()
  createWindow()

  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(pickFolderParent(), { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('config:load', () => ({ ...store.store }))

  ipcMain.handle('config:save', (_, payload: unknown) => {
    const partial = validateConfigSave(payload)
    store.set({ ...store.store, ...partial })
  })

  ipcMain.handle('sync:start', async (event, payload: unknown) => {
    try {
      const v = await validateSyncStart(payload)
      const { instanceId, ...rest } = v
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false as const, error: 'No window' }
      await syncManager.start(instanceId, rest, win)
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle('sync:stop', (_, instanceId: unknown) => {
    if (typeof instanceId !== 'string' || instanceId.length < 1) {
      return { ok: false as const, error: 'Invalid instance id' }
    }
    syncManager.stop(instanceId)
    return { ok: true as const }
  })

  ipcMain.handle('sync:status', () => ({ instances: syncManager.listStatus() }))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  syncManager.stopAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
