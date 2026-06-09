export interface Arg {
  name: string
  type: 'str' | 'string' | 'int' | 'number' | 'float' | 'boolean' | 'bool'
  required: boolean
  valueRequired: boolean
  positional: boolean
  choices: string[]
  default: unknown
  help: string
}

export interface Adapter {
  command: string
  site: string
  name: string
  aliases: string[]
  description: string
  access: 'read' | 'write'
  strategy: 'public' | 'cookie' | 'intercept' | 'ui' | 'local'
  browser: boolean
  args: Arg[]
  columns: string[]
  domain: string
  example: string
  defaultFormat: string | null
  siteSession: string | null
}

export interface Preset {
  id: string
  name: string
  platform: string
  command: string
  params: Record<string, unknown>
  createdAt: string
}

export interface FeishuConfig {
  webhook: {
    url: string
    keyword: string
  }
}

export interface ScheduledTask {
  id: string
  name: string
  presetIds: string[]
  schedule: {
    type: 'interval' | 'daily' | 'weekly' | 'monthly'
    intervalMinutes?: number
    time?: string // HH:MM
    dayOfWeek?: number // 0-6, 0=Sunday (for weekly)
    dayOfMonth?: number // 1-31 (for monthly)
  }
  enabled: boolean
  webhookUrl?: string
  lastRun?: string
  lastStatus?: 'success' | 'error' | 'running'
  lastError?: string
}

export interface RunResult {
  success: boolean
  data?: string
  error?: string
  exitCode: number
}

declare global {
  interface Window {
    api: import('../electron/preload').OpencliApi
  }
}
