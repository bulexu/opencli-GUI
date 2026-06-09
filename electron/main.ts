import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { execFile, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

let mainWindow: BrowserWindow | null = null

// Resolve bundled opencli script path (vendored to avoid pnpm symlink issues)
// In packaged app: resources/app.asar.unpacked/vendor/opencli/dist/src/main.js
// In dev: project_root/vendor/opencli/dist/src/main.js
let OPENCLI_SCRIPT = ''
function resolveOpencliScript(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'vendor', 'opencli', 'dist', 'src', 'main.js')
  }
  // Dev: __dirname is dist-electron/, go up to project root
  return path.join(__dirname, '..', 'vendor', 'opencli', 'dist', 'src', 'main.js')
}

const PRESETS_PATH = path.join(app.getPath('userData'), 'presets.json')
const PRESETS_TMP_PATH = PRESETS_PATH + '.tmp'
const ADAPTERS_CACHE_PATH = path.join(app.getPath('userData'), 'adapters-cache.json')
const ADAPTERS_CACHE_TMP = ADAPTERS_CACHE_PATH + '.tmp'

// Track active child processes for cleanup on quit
const activeProcesses = new Map<string, ChildProcess>()
let isQuittingAfterCleanup = false

function terminateChildProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // Ignore and continue quitting.
      }
      finish()
    }, 2500)

    child.once('exit', () => {
      clearTimeout(timeout)
      finish()
    })
    child.once('error', () => {
      clearTimeout(timeout)
      finish()
    })

    try {
      if (process.platform === 'win32' && child.pid) {
        execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {
          // The exit event may arrive slightly later; timeout remains as a fallback.
        })
      } else {
        child.kill()
      }
    } catch {
      clearTimeout(timeout)
      finish()
    }
  })
}

async function cleanupActiveProcesses(): Promise<void> {
  const children = Array.from(activeProcesses.values())
  if (children.length === 0) return

  await Promise.all(children.map((child) => terminateChildProcess(child)))
}

function loadPresetsData(): unknown[] {
  try {
    if (fs.existsSync(PRESETS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8'))
      if (Array.isArray(raw)) return raw
    }
  } catch {
    // corrupt file — ignore
  }
  return []
}

function savePresetsData(data: unknown[]): void {
  const json = JSON.stringify(data, null, 2)
  fs.writeFileSync(PRESETS_TMP_PATH, json, 'utf-8')
  fs.renameSync(PRESETS_TMP_PATH, PRESETS_PATH)
}

// Adapters cache — returns data immediately, refreshes in background
// Priority: user-data cache (updated at runtime) > bundled cache (shipped with app)
function loadAdaptersCache(): unknown[] | null {
  // 1. Try user-data cache (written by background refresh)
  try {
    if (fs.existsSync(ADAPTERS_CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(ADAPTERS_CACHE_PATH, 'utf-8'))
      if (Array.isArray(raw) && raw.length > 0) return raw
    }
  } catch { /* corrupt — ignore */ }

  // 2. Fall back to bundled cache (packed with the app)
  try {
    const bundledPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'build', 'adapters-cache.json')
      : path.join(__dirname, '..', 'build', 'adapters-cache.json')
    if (fs.existsSync(bundledPath)) {
      const raw = JSON.parse(fs.readFileSync(bundledPath, 'utf-8'))
      if (Array.isArray(raw) && raw.length > 0) return raw
    }
  } catch { /* corrupt — ignore */ }

  return null
}

function saveAdaptersCache(data: unknown[]): void {
  const json = JSON.stringify(data)
  fs.writeFileSync(ADAPTERS_CACHE_TMP, json, 'utf-8')
  fs.renameSync(ADAPTERS_CACHE_TMP, ADAPTERS_CACHE_PATH)
}

// Background refresh: run opencli list, update cache, push to renderer if changed
let adaptersRefreshInFlight = false
function refreshAdaptersInBackground(): void {
  if (adaptersRefreshInFlight) return
  adaptersRefreshInFlight = true

  runOpencli(['list', '-f', 'json']).then((result) => {
    adaptersRefreshInFlight = false
    if (result.exitCode !== 0) return
    try {
      const freshData = JSON.parse(result.stdout)
      if (!Array.isArray(freshData)) return

      const cached = loadAdaptersCache()
      const changed = !cached || JSON.stringify(cached) !== JSON.stringify(freshData)
      if (changed) {
        saveAdaptersCache(freshData)
        mainWindow?.webContents.send('adapters:updated', freshData)
      }
    } catch { /* parse error — ignore */ }
  })
}

function validatePreset(preset: unknown): Record<string, unknown> | null {
  if (typeof preset !== 'object' || preset === null) return null
  const p = preset as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null
  if (typeof p.platform !== 'string' || typeof p.command !== 'string') return null
  if (typeof p.params !== 'object' || p.params === null) return null
  return p
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OpenCLI GUI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Set CSP only in production (dev mode needs Vite dev server access)
  if (!process.env.VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"],
        },
      })
    })
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  OPENCLI_SCRIPT = resolveOpencliScript()
  console.log('[opencli-gui] opencli script:', OPENCLI_SCRIPT)
  console.log('[opencli-gui] script exists:', fs.existsSync(OPENCLI_SCRIPT))
  if (app.isPackaged) {
    const unpackedDir = path.join(process.resourcesPath, 'app.asar.unpacked')
    console.log('[opencli-gui] app.asar.unpacked exists:', fs.existsSync(unpackedDir))
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Kill all active child processes on quit
app.on('before-quit', (event) => {
  if (isQuittingAfterCleanup || activeProcesses.size === 0) return

  event.preventDefault()
  isQuittingAfterCleanup = true

  cleanupActiveProcesses()
    .finally(() => {
      activeProcesses.clear()
      app.quit()
    })
})

// Helper: run bundled opencli script
// In dev: use `node` directly to avoid Commander v14's Electron auto-detection
//   (which does argv.slice(1) instead of slice(2) when process.defaultApp is unset,
//   causing the script path to be treated as a command argument).
// In packaged: use process.execPath (Electron binary) with ELECTRON_RUN_AS_NODE=1.
function runOpencli(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const requestId = crypto.randomUUID()

  return new Promise((resolve) => {
    let cwd: string
    if (app.isPackaged) {
      const unpackedDir = path.join(process.resourcesPath, 'app.asar.unpacked')
      cwd = fs.existsSync(unpackedDir) ? unpackedDir : process.resourcesPath
    } else {
      cwd = path.join(__dirname, '..')
    }

    const execBin = app.isPackaged ? process.execPath : 'node'
    const execEnv = app.isPackaged ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : { ...process.env }

    const child = execFile(execBin, [OPENCLI_SCRIPT, ...args], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      cwd,
      env: execEnv,
    }, (error, stdout, stderr) => {
      activeProcesses.delete(requestId)

      if (error && error.killed) {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 75 })
      } else if (error && 'code' in error && typeof error.code === 'number') {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: error.code })
      } else if (error) {
        resolve({ stdout: stdout || '', stderr: error.message, exitCode: -1 })
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 })
      }
    })

    activeProcesses.set(requestId, child)
  })
}

// IPC: list all commands (cache-first, background refresh)
ipcMain.handle('opencli:list', async () => {
  const cached = loadAdaptersCache()
  if (cached) {
    // Return cached data immediately, refresh in background
    refreshAdaptersInBackground()
    return { success: true, data: cached, fromCache: true }
  }

  // No cache (first launch) — must wait for opencli
  const result = await runOpencli(['list', '-f', 'json'])
  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr, exitCode: result.exitCode }
  }
  try {
    const data = JSON.parse(result.stdout)
    saveAdaptersCache(data)
    return { success: true, data }
  } catch {
    return { success: false, error: 'Failed to parse opencli list output', exitCode: -1 }
  }
})

// IPC: run a command
ipcMain.handle('opencli:run', async (_event, platform: string, command: string, params: Record<string, unknown>, positionalArgs?: string[]) => {
  const args: string[] = [platform, command]

  // Append positional args first (in order), without --key prefix
  if (positionalArgs) {
    for (const name of positionalArgs) {
      const value = params[name]
      if (value === undefined || value === null || value === '') continue
      args.push(String(value))
    }
  }

  // Then named (non-positional) args
  for (const [key, value] of Object.entries(params)) {
    if (positionalArgs?.includes(key)) continue // already handled
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'number' && isNaN(value)) continue
    if (typeof value === 'boolean') {
      if (value) args.push(`--${key}`)
    } else {
      args.push(`--${key}`, String(value))
    }
  }

  args.push('-f', 'csv')

  const result = await runOpencli(args)

  if (result.exitCode === -1) {
    return { success: false, error: 'opencli 执行出错：' + (result.stderr || '未知错误'), exitCode: -1 }
  }

  if (result.exitCode === 69) {
    return { success: false, error: '请先启动 Chrome 并安装 OpenCLI 扩展', exitCode: 69 }
  }

  if (result.exitCode === 77) {
    return { success: false, error: '请先在 Chrome 中登录该平台', exitCode: 77 }
  }

  if (result.exitCode === 75) {
    return { success: false, error: '命令执行超时，请重试', exitCode: 75 }
  }

  if (result.exitCode === 66) {
    return { success: true, data: '', exitCode: 66 }
  }

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr || `命令执行失败 (exit ${result.exitCode})`, exitCode: result.exitCode }
  }

  return { success: true, data: result.stdout, exitCode: 0 }
})

// IPC: presets CRUD
ipcMain.handle('presets:load', () => {
  return loadPresetsData()
})

ipcMain.handle('presets:save', (_event, preset: unknown) => {
  const p = validatePreset(preset)
  if (!p) return loadPresetsData()

  const presets = loadPresetsData() as Record<string, unknown>[]
  const idx = presets.findIndex((x) => x.id === p.id)
  if (idx >= 0) {
    presets[idx] = p
  } else {
    presets.push(p)
  }
  savePresetsData(presets)
  return presets
})

ipcMain.handle('presets:delete', (_event, id: string) => {
  const presets = (loadPresetsData() as Record<string, unknown>[]).filter((x) => x.id !== id)
  savePresetsData(presets)
  return presets
})

// IPC: save CSV file via dialog
ipcMain.handle('dialog:saveCsv', async (_event, filename: string, content: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 CSV',
    defaultPath: filename,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.promises.writeFile(result.filePath, content, 'utf-8')
  return result.filePath
})
