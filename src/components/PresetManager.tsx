import { useState, useMemo, useCallback, useRef } from 'react'
import type { Preset } from '../types'

interface Props {
  presets: Preset[]
  onLoad: (preset: Preset) => void
  onDelete: (id: string) => void
  onRename: (id: string, newName: string) => void
  onBatchRun: (presets: Preset[]) => void
  batchRunning: boolean
}

export default function PresetManager({ presets, onLoad, onDelete, onRename, onBatchRun, batchRunning }: Props) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set())
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set())
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Group: platform -> command -> presets[]
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Preset[]>>()
    for (const p of presets) {
      let platformGroup = map.get(p.platform)
      if (!platformGroup) {
        platformGroup = new Map()
        map.set(p.platform, platformGroup)
      }
      let cmdPresets = platformGroup.get(p.command)
      if (!cmdPresets) {
        cmdPresets = []
        platformGroup.set(p.command, cmdPresets)
      }
      cmdPresets.push(p)
    }
    return map
  }, [presets])

  const togglePlatform = useCallback((platform: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }, [])

  const toggleCommand = useCallback((cmdKey: string) => {
    setExpandedCommands((prev) => {
      const next = new Set(prev)
      if (next.has(cmdKey)) next.delete(cmdKey)
      else next.add(cmdKey)
      return next
    })
  }, [])

  const startEdit = useCallback((preset: Preset) => {
    setEditingId(preset.id)
    setEditName(preset.name)
  }, [])

  const commitEdit = useCallback(() => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }, [editingId, editName, onRename])

  const toggleSelect = useCallback((presetId: string) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev)
      if (next.has(presetId)) next.delete(presetId)
      else next.add(presetId)
      return next
    })
  }, [])

  const selectAllInGroup = useCallback((cmdPresets: Preset[]) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev)
      const allSelected = cmdPresets.every((p) => next.has(p.id))
      if (allSelected) {
        for (const p of cmdPresets) next.delete(p.id)
      } else {
        for (const p of cmdPresets) next.add(p.id)
      }
      return next
    })
  }, [])

  const handleBatchRun = useCallback((cmdPresets: Preset[]) => {
    const toRun = cmdPresets.filter((p) => selectedPresets.has(p.id))
    if (toRun.length === 0) return
    setSelectedPresets(new Set())
    onBatchRun(toRun)
  }, [selectedPresets, onBatchRun])

  if (presets.length === 0) {
    return (
      <div className="preset-manager">
        <h3>已保存预设</h3>
        <p className="preset-empty">暂无预设</p>
      </div>
    )
  }

  return (
    <div className="preset-manager">
      <h3>已保存预设</h3>
      <div className="preset-tree">
        {Array.from(grouped.entries()).map(([platform, commandMap]) => (
          <div key={platform} className="preset-group-platform">
            <div
              className="preset-group-header platform-header"
              onClick={() => togglePlatform(platform)}
            >
              <span className="group-toggle">{expandedPlatforms.has(platform) ? '▼' : '▶'}</span>
              <span className="group-label">{platform}</span>
              <span className="group-count">
                {Array.from(commandMap.values()).reduce((sum, arr) => sum + arr.length, 0)}
              </span>
            </div>

            {expandedPlatforms.has(platform) && (
              <div className="preset-group-children">
                {Array.from(commandMap.entries()).map(([command, cmdPresets]) => {
                  const cmdKey = `${platform}\x00${command}`
                  return (
                    <div key={command} className="preset-group-command">
                      <div
                        className="preset-group-header command-header"
                        onClick={() => toggleCommand(cmdKey)}
                      >
                        <span className="group-toggle">{expandedCommands.has(cmdKey) ? '▼' : '▶'}</span>
                        <span className="group-label">{command}</span>
                        <span className="group-count">{cmdPresets.length}</span>
                      </div>

                      {expandedCommands.has(cmdKey) && (
                        <div className="preset-group-children">
                          {cmdPresets.length >= 2 && (
                            <div className="batch-bar">
                              <button
                                className="batch-select-all"
                                onClick={() => selectAllInGroup(cmdPresets)}
                              >
                                {cmdPresets.every((p) => selectedPresets.has(p.id)) ? '取消全选' : '全选'}
                              </button>
                              <button
                                className="batch-run-btn"
                                disabled={batchRunning || !cmdPresets.some((p) => selectedPresets.has(p.id))}
                                onClick={() => handleBatchRun(cmdPresets)}
                              >
                                批量运行
                              </button>
                            </div>
                          )}

                          {cmdPresets.map((preset) => (
                            <div key={preset.id} className="preset-item">
                              {cmdPresets.length >= 2 && (
                                <input
                                  type="checkbox"
                                  className="preset-checkbox"
                                  checked={selectedPresets.has(preset.id)}
                                  onChange={() => toggleSelect(preset.id)}
                                />
                              )}

                              {editingId === preset.id ? (
                                <input
                                  type="text"
                                  className="preset-inline-edit"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit()
                                    if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="preset-name"
                                  onClick={() => {
                                    // Delay load to distinguish from double-click
                                    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
                                    clickTimerRef.current = setTimeout(() => onLoad(preset), 250)
                                  }}
                                  onDoubleClick={() => {
                                    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null }
                                    startEdit(preset)
                                  }}
                                  title="单击加载，双击重命名"
                                >
                                  {preset.name}
                                </span>
                              )}

                              <div className="preset-actions">
                                <button
                                  className="preset-edit"
                                  onClick={(e) => { e.stopPropagation(); startEdit(preset) }}
                                  title="重命名"
                                >
                                  ✎
                                </button>
                                <button
                                  className="preset-delete"
                                  onClick={(e) => { e.stopPropagation(); onDelete(preset.id) }}
                                  title="删除"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
