import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { execFile, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as Papa from 'papaparse'

let mainWindow: BrowserWindow | null = null

// Resolve opencli wrapper path (vendored to avoid pnpm symlink issues).
// The wrapper (CJS) clears process.versions.electron before loading the real
// ESM entry, which prevents Commander v14's Electron argv auto-detection bug.
// In packaged app: extraResources copies to resources/vendor/ (outside asar)
// In dev: project_root/vendor/run-opencli.cjs
let OPENCLI_SCRIPT = ''
function resolveOpencliScript(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vendor', 'run-opencli.cjs')
  }
  return path.join(__dirname, '..', 'vendor', 'run-opencli.cjs')
}

const PRESETS_PATH = path.join(app.getPath('userData'), 'presets.json')
const PRESETS_TMP_PATH = PRESETS_PATH + '.tmp'
const ADAPTERS_CACHE_PATH = path.join(app.getPath('userData'), 'adapters-cache.json')
const ADAPTERS_CACHE_TMP = ADAPTERS_CACHE_PATH + '.tmp'

// Feishu config persistence
interface FeishuConfigData {
  webhook: { url: string; keyword: string }
}

const FEISHU_CONFIG_PATH = path.join(app.getPath('userData'), 'feishu-config.json')
const FEISHU_CONFIG_TMP = FEISHU_CONFIG_PATH + '.tmp'

function loadFeishuConfigData(): FeishuConfigData {
  try {
    if (fs.existsSync(FEISHU_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FEISHU_CONFIG_PATH, 'utf-8'))
      if (raw && typeof raw === 'object') {
        return {
          webhook: raw.webhook && typeof raw.webhook === 'object'
            ? {
                url: typeof raw.webhook.url === 'string' ? raw.webhook.url : '',
                keyword: typeof raw.webhook.keyword === 'string' ? raw.webhook.keyword : '',
              }
            : { url: '', keyword: '' },
        }
      }
    }
  } catch {
    // corrupt file — ignore
  }
  return { webhook: { url: '', keyword: '' } }
}

function saveFeishuConfigData(config: FeishuConfigData): void {
  const json = JSON.stringify(config, null, 2)
  fs.writeFileSync(FEISHU_CONFIG_TMP, json, 'utf-8')
  fs.renameSync(FEISHU_CONFIG_TMP, FEISHU_CONFIG_PATH)
}

async function sendFeishuNotification(text: string): Promise<void> {
  const config = loadFeishuConfigData()
  if (!config.webhook.url) return
  try {
    // Include keyword in message if configured (Feishu webhook validation)
    const message = config.webhook.keyword
      ? `${config.webhook.keyword}\n${text}`
      : text
    await fetch(config.webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: message } }),
    })
  } catch { /* best-effort — don't crash the app */ }
}

async function pushResultsToWebhook(webhookUrl: string, results: Array<{ platform: string; instruct: string; params: Record<string, unknown>; items: Record<string, string>[] }>): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    })
  } catch { /* best-effort */ }
}

// Scheduled tasks persistence
interface ScheduledTaskData {
  id: string
  name: string
  presetIds: string[]
  schedule: { type: 'interval' | 'daily' | 'weekly' | 'monthly'; intervalMinutes?: number; time?: string; dayOfWeek?: number; dayOfMonth?: number }
  enabled: boolean
  webhookUrl?: string
  lastRun?: string
  lastStatus?: 'success' | 'error' | 'running'
  lastError?: string
}

const TASKS_PATH = path.join(app.getPath('userData'), 'tasks.json')
const TASKS_TMP = TASKS_PATH + '.tmp'

function loadTasksData(): ScheduledTaskData[] {
  try {
    if (fs.existsSync(TASKS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'))
      if (Array.isArray(raw)) return raw as ScheduledTaskData[]
    }
  } catch { /* corrupt — ignore */ }
  return []
}

function saveTasksData(data: ScheduledTaskData[]): void {
  const json = JSON.stringify(data, null, 2)
  fs.writeFileSync(TASKS_TMP, json, 'utf-8')
  fs.renameSync(TASKS_TMP, TASKS_PATH)
}

// Scheduler engine
const schedulerTimers = new Map<string, ReturnType<typeof setInterval>>()
const tasksRunning = new Set<string>()

function calcNextDailyMs(timeHHMM: string): number {
  const [h, m] = timeHHMM.split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

function calcNextWeeklyMs(timeHHMM: string, dayOfWeek: number): number {
  const [h, m] = timeHHMM.split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setHours(h, m, 0, 0)
  const currentDay = now.getDay()
  let daysAhead = dayOfWeek - currentDay
  if (daysAhead < 0 || (daysAhead === 0 && target.getTime() <= now.getTime())) {
    daysAhead += 7
  }
  target.setDate(target.getDate() + daysAhead)
  return target.getTime() - now.getTime()
}

function calcNextMonthlyMs(timeHHMM: string, dayOfMonth: number): number {
  const [h, m] = timeHHMM.split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setDate(Math.min(dayOfMonth, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()))
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setMonth(target.getMonth() + 1)
    target.setDate(Math.min(dayOfMonth, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()))
  }
  return target.getTime() - now.getTime()
}

function scheduleTask(task: ScheduledTaskData): void {
  if (!task.enabled) return
  unscheduleTask(task.id)

  if (task.schedule.type === 'interval' && task.schedule.intervalMinutes) {
    const ms = task.schedule.intervalMinutes * 60 * 1000
    schedulerTimers.set(task.id, setInterval(() => { runScheduledTask(task.id) }, ms))
  } else if (task.schedule.type === 'daily' && task.schedule.time) {
    const scheduleOnce = () => {
      const ms = calcNextDailyMs(task.schedule.time!)
      const timer = setTimeout(() => {
        runScheduledTask(task.id)
        scheduleOnce()
      }, ms)
      schedulerTimers.set(task.id, timer as unknown as ReturnType<typeof setInterval>)
    }
    scheduleOnce()
  } else if (task.schedule.type === 'weekly' && task.schedule.time && task.schedule.dayOfWeek !== undefined) {
    const scheduleOnce = () => {
      const ms = calcNextWeeklyMs(task.schedule.time!, task.schedule.dayOfWeek!)
      const timer = setTimeout(() => {
        runScheduledTask(task.id)
        scheduleOnce()
      }, ms)
      schedulerTimers.set(task.id, timer as unknown as ReturnType<typeof setInterval>)
    }
    scheduleOnce()
  } else if (task.schedule.type === 'monthly' && task.schedule.time && task.schedule.dayOfMonth !== undefined) {
    const scheduleOnce = () => {
      const ms = calcNextMonthlyMs(task.schedule.time!, task.schedule.dayOfMonth!)
      const timer = setTimeout(() => {
        runScheduledTask(task.id)
        scheduleOnce()
      }, ms)
      schedulerTimers.set(task.id, timer as unknown as ReturnType<typeof setInterval>)
    }
    scheduleOnce()
  }
}

function unscheduleTask(taskId: string): void {
  const timer = schedulerTimers.get(taskId)
  if (timer) {
    clearInterval(timer)
    clearTimeout(timer)
    schedulerTimers.delete(taskId)
  }
}

function startAllSchedulers(): void {
  for (const task of loadTasksData()) {
    if (task.enabled) scheduleTask(task)
  }
}

function stopAllSchedulers(): void {
  for (const [id] of schedulerTimers) unscheduleTask(id)
}

async function runScheduledTask(taskId: string): Promise<void> {
  if (tasksRunning.has(taskId)) return
  tasksRunning.add(taskId)

  try {
    const tasks = loadTasksData()
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const presets = loadPresetsData() as Record<string, unknown>[]
    const presetMap = new Map(presets.map((p) => [p.id as string, p]))

    // Validate referenced presets exist
    const missing = task.presetIds.filter((pid) => !presetMap.has(pid))
    if (missing.length > 0) {
      task.lastStatus = 'error'
      task.lastError = '关联预设已删除'
      task.lastRun = new Date().toISOString()
      saveTasksData(tasks)
      mainWindow?.webContents.send('tasks:updated', tasks)
      await sendFeishuNotification(
        `❌ 定时任务执行失败\n任务名称：${task.name}\n错误信息：关联预设已删除`
      )
      return
    }

    task.lastStatus = 'running'
    task.lastRun = new Date().toISOString()
    saveTasksData(tasks)
    mainWindow?.webContents.send('tasks:updated', tasks)

    let allSuccess = true
    let lastError = ''
    const presetCsvOutputs = new Map<string, string>() // presetId -> CSV stdout

    // Load adapters cache to look up positional args
    const adapters = (loadAdaptersCache() ?? []) as Record<string, unknown>[]

    for (const presetId of task.presetIds) {
      const preset = presetMap.get(presetId)!
      const platform = preset.platform as string
      const command = preset.command as string
      const params = preset.params as Record<string, unknown>

      // Find adapter to get positional args (preset.command stores adapter.name)
      const adapter = adapters.find((a) => a.site === platform && a.name === command)
      const positionalArgs = Array.isArray(adapter?.args)
        ? (adapter.args as Record<string, unknown>[]).filter((a) => a.positional).map((a) => a.name as string)
        : []

      // Build args (same logic as opencli:run handler)
      const args: string[] = [platform, command]
      // Append positional args first (in order), without --key prefix
      for (const name of positionalArgs) {
        const value = params[name]
        if (value === undefined || value === null || value === '') continue
        args.push(String(value))
      }
      // Then named (non-positional) args
      for (const [key, value] of Object.entries(params)) {
        if (positionalArgs.includes(key)) continue
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
      if (result.exitCode !== 0) {
        allSuccess = false
        lastError = result.stderr || `命令 ${command} 执行失败 (exit ${result.exitCode})`
        break
      }
      if (result.stdout.trim()) {
        presetCsvOutputs.set(presetId, result.stdout)
      }
    }

    // Push all results to webhook as a single array
    if (allSuccess && task.webhookUrl && presetCsvOutputs.size > 0) {
      const results: Array<{ platform: string; instruct: string; params: Record<string, unknown>; items: Record<string, string>[] }> = []
      for (const [presetId, csvOutput] of presetCsvOutputs) {
        const preset = presetMap.get(presetId)
        if (!preset) continue
        const parsed = Papa.parse<Record<string, string>>(csvOutput, { header: true, skipEmptyLines: true })
        results.push({
          platform: preset.platform as string,
          instruct: preset.command as string,
          params: preset.params as Record<string, unknown>,
          items: parsed.data,
        })
      }
      if (results.length > 0) {
        await pushResultsToWebhook(task.webhookUrl, results)
      }
    }

    // Reload in case of concurrent edits
    const updatedTasks = loadTasksData()
    const updatedTask = updatedTasks.find((t) => t.id === taskId)
    if (updatedTask) {
      updatedTask.lastStatus = allSuccess ? 'success' : 'error'
      updatedTask.lastError = allSuccess ? undefined : lastError
      updatedTask.lastRun = new Date().toISOString()
      saveTasksData(updatedTasks)
      mainWindow?.webContents.send('tasks:updated', updatedTasks)

      // Notify via Feishu webhook
      if (!allSuccess) {
        await sendFeishuNotification(
          `❌ 定时任务执行失败\n任务名称：${task.name}\n错误信息：${lastError}`
        )
      }
    }
  } catch (err) {
    // Unexpected error — update task status so it doesn't stay stuck in 'running'
    const tasks = loadTasksData()
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      task.lastStatus = 'error'
      task.lastError = err instanceof Error ? err.message : '任务执行异常'
      task.lastRun = new Date().toISOString()
      saveTasksData(tasks)
      mainWindow?.webContents.send('tasks:updated', tasks)
      await sendFeishuNotification(
        `❌ 定时任务执行异常\n任务名称：${task.name}\n错误信息：${task.lastError}`
      )
    }
  } finally {
    tasksRunning.delete(taskId)
  }
}

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
  startAllSchedulers()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Kill all active child processes on quit
app.on('before-quit', (event) => {
  stopAllSchedulers()

  if (isQuittingAfterCleanup || activeProcesses.size === 0) return

  event.preventDefault()
  isQuittingAfterCleanup = true

  cleanupActiveProcesses()
    .finally(() => {
      activeProcesses.clear()
      app.quit()
    })
})

// Helper: run opencli via the vendor wrapper.
// Uses process.execPath (Electron binary) with ELECTRON_RUN_AS_NODE=1 so it
// acts as a plain Node.js runtime. The wrapper clears process.versions.electron
// before loading opencli, preventing Commander's Electron argv bug.
function runOpencli(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const requestId = crypto.randomUUID()

  return new Promise((resolve) => {
    const cwd = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '..')

    const child = execFile(process.execPath, [OPENCLI_SCRIPT, ...args], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
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

// IPC: feishu config
ipcMain.handle('feishuConfig:load', () => {
  return loadFeishuConfigData()
})

ipcMain.handle('feishuConfig:save', (_event, config: unknown) => {
  if (!config || typeof config !== 'object') return loadFeishuConfigData()
  const c = config as Record<string, unknown>
  const data: FeishuConfigData = {
    webhook: c.webhook && typeof c.webhook === 'object'
      ? {
          url: typeof (c.webhook as Record<string, unknown>).url === 'string' ? (c.webhook as Record<string, unknown>).url as string : '',
          keyword: typeof (c.webhook as Record<string, unknown>).keyword === 'string' ? (c.webhook as Record<string, unknown>).keyword as string : '',
        }
      : { url: '', keyword: '' },
  }
  saveFeishuConfigData(data)
  return data
})

ipcMain.handle('feishuConfig:testWebhook', async (_event, url: string, keyword: string) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: keyword || 'OpenCLI GUI Webhook 测试' },
      }),
    })
    const body = await response.text()
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${body}` }
    }
    return { success: true, data: body }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '请求失败' }
  }
})

// IPC: scheduled tasks
ipcMain.handle('tasks:load', () => {
  return loadTasksData()
})

ipcMain.handle('tasks:save', (_event, task: ScheduledTaskData) => {
  const tasks = loadTasksData()
  const idx = tasks.findIndex((t) => t.id === task.id)
  if (idx >= 0) {
    tasks[idx] = task
  } else {
    tasks.push(task)
  }
  saveTasksData(tasks)
  // Re-schedule this task
  unscheduleTask(task.id)
  scheduleTask(task)
  return tasks
})

ipcMain.handle('tasks:delete', (_event, id: string) => {
  unscheduleTask(id)
  const tasks = loadTasksData().filter((t) => t.id !== id)
  saveTasksData(tasks)
  return tasks
})

ipcMain.handle('tasks:run', async (_event, taskId: string) => {
  await runScheduledTask(taskId)
  return loadTasksData()
})
