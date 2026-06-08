import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import type { Adapter, Preset } from './types'
import { listCommands, loadPresets, savePreset, deletePreset } from './services/opencli'
import PlatformSelector from './components/PlatformSelector'
import CommandSelector from './components/CommandSelector'
import ParamForm from './components/ParamForm'
import ResultTable from './components/ResultTable'
import PresetManager from './components/PresetManager'

type Step = 'platform' | 'command' | 'params'

function App() {
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('platform')
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const [selectedAdapter, setSelectedAdapter] = useState<Adapter | null>(null)
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [runResult, setRunResult] = useState<{ success: boolean; data?: string; error?: string; exitCode: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [presets, setPresets] = useState<Preset[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const batchCancelRef = useRef(false)

  useEffect(() => {
    // Decouple: adapter failure is fatal, preset failure is non-fatal
    Promise.allSettled([listCommands(), loadPresets()]).then(([adpsResult, prsResult]) => {
      if (adpsResult.status === 'rejected') {
        setError(adpsResult.reason?.message || '加载适配器列表失败')
      } else {
        setAdapters(adpsResult.value)
      }
      if (prsResult.status === 'fulfilled') {
        setPresets(prsResult.value)
      }
      setLoading(false)
    })

    // Listen for background adapter list updates (from cache refresh)
    const cleanup = window.api.onAdaptersUpdated((data) => {
      setAdapters(data as Adapter[])
    })
    return cleanup
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const sites = useMemo(() => Array.from(new Set(adapters.map((a) => a.site))).sort(), [adapters])

  const siteCommands = useMemo(() => adapters.filter((a) => a.site === selectedSite), [adapters, selectedSite])

  const handleSiteSelect = useCallback((site: string) => {
    setSelectedSite(site)
    setSelectedAdapter(null)
    setParams({})
    setRunResult(null)
    setStep('command')
  }, [])

  const handleAdapterSelect = useCallback((adapter: Adapter) => {
    setSelectedAdapter(adapter)
    const defaultParams: Record<string, unknown> = {}
    for (const arg of adapter.args) {
      if (arg.default !== null && arg.default !== undefined) {
        defaultParams[arg.name] = arg.default
      }
    }
    setParams(defaultParams)
    setRunResult(null)
    setStep('params')
  }, [])

  const handleSavePreset = useCallback(async (name: string) => {
    if (!selectedAdapter) return
    try {
      const preset: Preset = {
        id: crypto.randomUUID(),
        name,
        platform: selectedAdapter.site,
        command: selectedAdapter.name,
        params,
        createdAt: new Date().toISOString(),
      }
      const updated = await savePreset(preset)
      setPresets(updated)
      setToast('预设已保存')
    } catch {
      setToast('保存预设失败')
    }
  }, [selectedAdapter, params])

  const handleDeletePreset = useCallback(async (id: string) => {
    try {
      const updated = await deletePreset(id)
      setPresets(updated)
    } catch {
      setToast('删除预设失败')
    }
  }, [])

  const handleRename = useCallback(async (id: string, newName: string) => {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    try {
      const updated = await savePreset({ ...preset, name: newName })
      setPresets(updated)
    } catch {
      setToast('重命名失败')
    }
  }, [presets])

  const handleBatchRun = useCallback(async (batchPresets: Preset[]) => {
    setBatchRunning(true)
    setBatchProgress({ current: 0, total: batchPresets.length })
    batchCancelRef.current = false

    const allRows: Record<string, string>[] = []
    const errorRows: Record<string, string>[] = []
    let cancelled = false

    try {
      // Look up adapter once (all presets in a batch share the same platform+command)
      const samplePreset = batchPresets[0]
      const adapter = adapters.find((a) => a.site === samplePreset.platform && a.name === samplePreset.command)
      const positionalArgs = adapter?.args?.filter((a) => a.positional).map((a) => a.name) ?? []

      for (let i = 0; i < batchPresets.length; i++) {
        if (batchCancelRef.current) { cancelled = true; break }
        setBatchProgress({ current: i + 1, total: batchPresets.length })

        const preset = batchPresets[i]
        const result = await window.api.runCommand(preset.platform, preset.command, preset.params, positionalArgs)

        if (result.success && result.data) {
          const parsed = Papa.parse<Record<string, string>>(result.data, {
            header: true,
            skipEmptyLines: true,
          })
          for (const row of parsed.data) {
            allRows.push({ _preset_name: preset.name, ...row })
          }
        } else {
          errorRows.push({ _preset_name: preset.name, _错误: result.error || '执行失败' })
        }
      }

      // Inject error rows into results so they appear in the table
      for (const er of errorRows) {
        allRows.push(er)
      }

      if (allRows.length > 0) {
        const combinedCsv = Papa.unparse(allRows)
        setRunResult({ success: true, data: combinedCsv, exitCode: 0 })
        if (cancelled) {
          setToast(`批量已取消：已完成 ${allRows.length - errorRows.length} 条结果`)
        } else if (errorRows.length > 0) {
          setToast(`批量完成：${allRows.length - errorRows.length} 条结果，${errorRows.length} 个失败`)
        } else {
          setToast(`批量完成：${allRows.length} 条结果`)
        }
      } else if (cancelled) {
        setToast('批量运行已取消')
      } else {
        setRunResult({ success: false, error: errorRows.map((e) => `${e._preset_name}: ${e._错误}`).join('\n'), exitCode: -1 })
        setToast('批量运行全部失败')
      }
    } finally {
      setBatchRunning(false)
      setBatchProgress(null)
    }
  }, [adapters])

  const handleLoadPreset = useCallback((preset: Preset) => {
    const adapter = adapters.find((a) => a.site === preset.platform && a.name === preset.command)
    if (!adapter) {
      setToast('该预设对应的指令已不可用')
      return
    }
    setSelectedSite(preset.platform)
    setSelectedAdapter(adapter)
    setParams(preset.params)
    setRunResult(null)
    setStep('params')
  }, [adapters])

  const handleBack = useCallback(() => {
    if (step === 'params') {
      setStep('command')
      setSelectedAdapter(null)
      setRunResult(null)
    } else if (step === 'command') {
      setStep('platform')
      setSelectedSite(null)
      setSelectedAdapter(null)
      setRunResult(null)
    }
  }, [step])

  const handleRun = useCallback(async () => {
    if (!selectedAdapter) return
    setRunning(true)
    setRunResult(null)
    const currentAdapter = selectedAdapter
    const positionalArgs = currentAdapter.args.filter((a) => a.positional).map((a) => a.name)
    const result = await window.api.runCommand(currentAdapter.site, currentAdapter.name, params, positionalArgs)
    // Guard: only update if adapter hasn't changed
    setSelectedAdapter((prev) => {
      if (prev === currentAdapter) {
        setRunResult(result)
        setRunning(false)
      }
      return prev
    })
  }, [selectedAdapter, params])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>正在加载 OpenCLI 适配器列表...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-error">
        <h2>启动失败</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>重试</button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>OpenCLI GUI</h1>
        <div className="stepper">
          <div className={`step ${step === 'platform' ? 'active' : selectedSite ? 'done' : ''}`}>
            <span className="step-num">1</span> 选择平台
          </div>
          <div className={`step ${step === 'command' ? 'active' : selectedAdapter ? 'done' : ''}`}>
            <span className="step-num">2</span> 选择指令
          </div>
          <div className={`step ${step === 'params' ? 'active' : ''}`}>
            <span className="step-num">3</span> 配置运行
          </div>
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {batchRunning && batchProgress && (
        <div className="batch-progress">
          <span>批量运行中... {batchProgress.current}/{batchProgress.total}</span>
          <button onClick={() => { batchCancelRef.current = true }}>取消</button>
        </div>
      )}

      <div className="app-body">
        <div className="main-content">
          {step !== 'platform' && (
            <button className="back-btn" onClick={handleBack}>← 返回</button>
          )}

          {step === 'platform' && (
            <PlatformSelector
              sites={sites}
              adapters={adapters}
              onSelect={handleSiteSelect}
            />
          )}

          {step === 'command' && selectedSite && (
            <CommandSelector
              site={selectedSite}
              commands={siteCommands}
              onSelect={handleAdapterSelect}
            />
          )}

          {step === 'params' && selectedAdapter && (
            <>
              <ParamForm
                adapter={selectedAdapter}
                params={params}
                onParamsChange={setParams}
                runResult={runResult}
                running={running}
                onRun={handleRun}
                onSavePreset={handleSavePreset}
              />
              {runResult && (
                <ResultTable
                  result={runResult}
                  columns={selectedAdapter.columns}
                  filename={`${selectedAdapter.site}-${selectedAdapter.name}`}
                />
              )}
            </>
          )}
        </div>

        <aside className="sidebar">
          <PresetManager
            presets={presets}
            onLoad={handleLoadPreset}
            onDelete={handleDeletePreset}
            onRename={handleRename}
            onBatchRun={handleBatchRun}
            batchRunning={batchRunning}
          />
        </aside>
      </div>
    </div>
  )
}

export default App
