import type { Adapter, Preset, RunResult } from '../types'

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
