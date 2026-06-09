import { contextBridge, ipcRenderer } from 'electron'

export interface OpencliApi {
  listCommands: () => Promise<{ success: boolean; data?: unknown[]; error?: string; exitCode: number }>
  runCommand: (platform: string, command: string, params: Record<string, unknown>, positionalArgs?: string[]) => Promise<{ success: boolean; data?: string; error?: string; exitCode: number }>
  loadPresets: () => Promise<unknown[]>
  savePreset: (preset: unknown) => Promise<unknown[]>
  deletePreset: (id: string) => Promise<unknown[]>
  saveCsv: (filename: string, content: string) => Promise<string | null>
  onAdaptersUpdated: (callback: (data: unknown[]) => void) => () => void
  loadFeishuConfig: () => Promise<unknown>
  saveFeishuConfig: (config: unknown) => Promise<unknown>
  testFeishuWebhook: (url: string, keyword: string) => Promise<{ success: boolean; data?: string; error?: string }>
}

contextBridge.exposeInMainWorld('api', {
  listCommands: () => ipcRenderer.invoke('opencli:list'),
  runCommand: (platform: string, command: string, params: Record<string, unknown>, positionalArgs?: string[]) =>
    ipcRenderer.invoke('opencli:run', platform, command, params, positionalArgs),
  loadPresets: () => ipcRenderer.invoke('presets:load'),
  savePreset: (preset: unknown) => ipcRenderer.invoke('presets:save', preset),
  deletePreset: (id: string) => ipcRenderer.invoke('presets:delete', id),
  saveCsv: (filename: string, content: string) => ipcRenderer.invoke('dialog:saveCsv', filename, content),
  onAdaptersUpdated: (callback: (data: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown[]) => callback(data)
    ipcRenderer.on('adapters:updated', handler)
    return () => { ipcRenderer.removeListener('adapters:updated', handler) }
  },
  loadFeishuConfig: () => ipcRenderer.invoke('feishuConfig:load'),
  saveFeishuConfig: (config: unknown) => ipcRenderer.invoke('feishuConfig:save', config),
  testFeishuWebhook: (url: string, keyword: string) => ipcRenderer.invoke('feishuConfig:testWebhook', url, keyword),
} satisfies OpencliApi)
