import type { Adapter, FeishuConfig, Preset, RunResult, ScheduledTask } from '../types'

export async function listCommands(): Promise<Adapter[]> {
  const result = await window.api.listCommands()
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to list commands')
  }
  return result.data as Adapter[]
}

export async function runCommand(platform: string, command: string, params: Record<string, unknown>, positionalArgs?: string[]): Promise<RunResult> {
  return window.api.runCommand(platform, command, params, positionalArgs)
}

export async function loadPresets(): Promise<Preset[]> {
  return (await window.api.loadPresets()) as Preset[]
}

export async function savePreset(preset: Preset): Promise<Preset[]> {
  return (await window.api.savePreset(preset)) as Preset[]
}

export async function deletePreset(id: string): Promise<Preset[]> {
  return (await window.api.deletePreset(id)) as Preset[]
}

export async function saveCsvDialog(filename: string, content: string): Promise<string | null> {
  return window.api.saveCsv(filename, content)
}

export async function loadFeishuConfig(): Promise<FeishuConfig> {
  return (await window.api.loadFeishuConfig()) as FeishuConfig
}

export async function saveFeishuConfig(config: FeishuConfig): Promise<FeishuConfig> {
  return (await window.api.saveFeishuConfig(config)) as FeishuConfig
}

export async function testFeishuWebhook(url: string, keyword: string): Promise<{ success: boolean; data?: string; error?: string }> {
  return window.api.testFeishuWebhook(url, keyword)
}

export async function loadTasks(): Promise<ScheduledTask[]> {
  return (await window.api.loadTasks()) as ScheduledTask[]
}

export async function saveTask(task: ScheduledTask): Promise<ScheduledTask[]> {
  return (await window.api.saveTask(task)) as ScheduledTask[]
}

export async function deleteTask(id: string): Promise<ScheduledTask[]> {
  return (await window.api.deleteTask(id)) as ScheduledTask[]
}

export async function runTaskNow(taskId: string): Promise<ScheduledTask[]> {
  return (await window.api.runTaskNow(taskId)) as ScheduledTask[]
}

export function onTasksUpdated(callback: (data: ScheduledTask[]) => void): () => void {
  return window.api.onTasksUpdated((data) => callback(data as ScheduledTask[]))
}
