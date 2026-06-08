import { useState } from 'react'
import type { Adapter, Arg } from '../types'

interface Props {
  adapter: Adapter
  params: Record<string, unknown>
  onParamsChange: (params: Record<string, unknown>) => void
  runResult: { success: boolean; error?: string; exitCode: number } | null
  running: boolean
  onRun: () => void
  onSavePreset: (name: string) => void
}

function isNumericType(type: string): boolean {
  return ['int', 'number', 'float'].includes(type)
}

function isBooleanType(type: string): boolean {
  return ['boolean', 'bool'].includes(type)
}

function ArgInput({ arg, value, onChange }: { arg: Arg; value: unknown; onChange: (v: unknown) => void }) {
  if (arg.choices && arg.choices.length > 0) {
    // Validate current value against choices; reset if invalid
    const currentIsValid = value !== undefined && value !== null && value !== '' && arg.choices.includes(String(value))
    return (
      <select
        value={currentIsValid ? String(value) : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {!arg.required && <option value="">(不设置)</option>}
        {arg.choices.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    )
  }

  if (isBooleanType(arg.type)) {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  }

  if (isNumericType(arg.type)) {
    return (
      <input
        type="number"
        value={value !== null && value !== undefined ? String(value) : ''}
        placeholder={arg.default !== null ? String(arg.default) : ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') {
            onChange(undefined)
          } else {
            const num = Number(v)
            onChange(isNaN(num) ? undefined : num)
          }
        }}
      />
    )
  }

  return (
    <input
      type="text"
      value={value !== null && value !== undefined ? String(value) : ''}
      placeholder={arg.default !== null ? String(arg.default) : arg.help}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  )
}

export default function ParamForm({ adapter, params, onParamsChange, runResult, running, onRun, onSavePreset }: Props) {
  const [presetName, setPresetName] = useState('')
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set())

  const positionalArgs = adapter.args.filter((a) => a.positional)
  const namedArgs = adapter.args.filter((a) => !a.positional)

  const updateParam = (name: string, value: unknown) => {
    onParamsChange({ ...params, [name]: value })
    // Clear validation error on change
    setValidationErrors((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }

  const handleSavePreset = () => {
    const name = presetName.trim() || `${adapter.site}/${adapter.name}`
    onSavePreset(name)
    setPresetName('')
  }

  const handleRun = () => {
    // Validate required fields
    const errors = new Set<string>()
    for (const arg of adapter.args) {
      if (arg.required) {
        const val = params[arg.name]
        if (val === undefined || val === null || val === '') {
          errors.add(arg.name)
        }
      }
    }
    if (errors.size > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors(new Set())
    onRun()
  }

  return (
    <div className="param-form">
      <div className="form-header">
        <h2>
          <span className="form-platform">{adapter.site}</span>
          <span className="form-sep">/</span>
          <span className="form-command">{adapter.name}</span>
        </h2>
        <p className="form-desc">{adapter.description}</p>
      </div>

      {positionalArgs.length > 0 && (
        <div className="form-section">
          <h3>必填参数</h3>
          {positionalArgs.map((arg) => (
            <div key={arg.name} className={`form-field ${validationErrors.has(arg.name) ? 'field-error' : ''}`}>
              <label>
                {arg.name}
                {arg.required && <span className="required-star">*</span>}
              </label>
              <ArgInput
                arg={arg}
                value={params[arg.name]}
                onChange={(v) => updateParam(arg.name, v)}
              />
              {validationErrors.has(arg.name) && <span className="field-error-msg">此项为必填</span>}
              {arg.help && !validationErrors.has(arg.name) && <span className="field-help">{arg.help}</span>}
            </div>
          ))}
        </div>
      )}

      {namedArgs.length > 0 && (
        <div className="form-section">
          <h3>可选参数</h3>
          {namedArgs.map((arg) => (
            <div key={arg.name} className={`form-field ${validationErrors.has(arg.name) ? 'field-error' : ''}`}>
              <label>
                {arg.name}
                {arg.required && <span className="required-star">*</span>}
                <span className="field-type">{arg.type}</span>
              </label>
              <ArgInput
                arg={arg}
                value={params[arg.name]}
                onChange={(v) => updateParam(arg.name, v)}
              />
              {validationErrors.has(arg.name) && <span className="field-error-msg">此项为必填</span>}
              {arg.help && !validationErrors.has(arg.name) && <span className="field-help">{arg.help}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="form-actions">
        <button className="run-btn" onClick={handleRun} disabled={running}>
          {running ? '运行中...' : '▶ 运行'}
        </button>
        <div className="preset-save">
          <input
            type="text"
            placeholder="预设名称"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button className="save-btn" onClick={handleSavePreset}>保存预设</button>
        </div>
      </div>

      {runResult && !runResult.success && (
        <div className="run-error">
          <p>{runResult.error}</p>
          {runResult.exitCode === 75 && (
            <button onClick={onRun}>重试</button>
          )}
        </div>
      )}

      {runResult && runResult.success && runResult.exitCode === 66 && (
        <div className="run-empty">
          <p>查询结果为空</p>
        </div>
      )}
    </div>
  )
}
