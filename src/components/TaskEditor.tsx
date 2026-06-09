import { useState, useMemo } from 'react'
import type { Preset, ScheduledTask } from '../types'

interface Props {
  task: ScheduledTask | null // null = creating new
  presets: Preset[]
  onSave: (task: ScheduledTask) => void
  onCancel: () => void
  onRunNow: (taskId: string) => void
}

export default function TaskEditor({ task, presets, onSave, onCancel, onRunNow }: Props) {
  const [name, setName] = useState(task?.name ?? '')
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(
    new Set(task?.presetIds ?? [])
  )
  const [scheduleType, setScheduleType] = useState<'interval' | 'daily' | 'weekly' | 'monthly'>(
    task?.schedule.type ?? 'interval'
  )
  const [intervalMinutes, setIntervalMinutes] = useState<string>(
    String(task?.schedule.intervalMinutes ?? 30)
  )
  const [time, setTime] = useState(task?.schedule.time ?? '09:00')
  const [dayOfWeek, setDayOfWeek] = useState<number>(task?.schedule.dayOfWeek ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState<string>(
    String(task?.schedule.dayOfMonth ?? 1)
  )
  const [enabled, setEnabled] = useState(task?.enabled ?? true)
  const [webhookUrl, setWebhookUrl] = useState(task?.webhookUrl ?? '')
  const [saveError, setSaveError] = useState('')

  // Group presets by platform -> command
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

  const togglePreset = (id: string) => {
    setSelectedPresetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    if (!name.trim()) { setSaveError('请输入任务名称'); return }
    if (selectedPresetIds.size === 0) { setSaveError('请至少选择一个预设'); return }

    const mins = Number(intervalMinutes)
    if (scheduleType === 'interval' && (!mins || mins < 1)) {
      setSaveError('间隔时间至少为 1 分钟')
      return
    }
    if ((scheduleType === 'daily' || scheduleType === 'weekly' || scheduleType === 'monthly') && !/^\d{2}:\d{2}$/.test(time)) {
      setSaveError('请输入有效的时间格式 HH:MM')
      return
    }
    const dom = Number(dayOfMonth)
    if (scheduleType === 'monthly' && (!dom || dom < 1 || dom > 31)) {
      setSaveError('每月日期请输入 1-31')
      return
    }

    setSaveError('')
    const schedule = scheduleType === 'interval'
      ? { type: 'interval' as const, intervalMinutes: mins }
      : scheduleType === 'daily'
      ? { type: 'daily' as const, time }
      : scheduleType === 'weekly'
      ? { type: 'weekly' as const, time, dayOfWeek }
      : { type: 'monthly' as const, time, dayOfMonth: dom }
    onSave({
      id: task?.id ?? crypto.randomUUID(),
      name: name.trim(),
      presetIds: Array.from(selectedPresetIds),
      schedule,
      enabled,
      webhookUrl: webhookUrl.trim() || undefined,
      lastRun: task?.lastRun,
      lastStatus: task?.lastStatus,
      lastError: task?.lastError,
    })
  }

  const lastRunLabel = task?.lastRun
    ? new Date(task.lastRun).toLocaleString('zh-CN')
    : null

  return (
    <div className="task-editor">
      <div className="task-editor-header">
        <h2>{task ? '编辑定时任务' : '新建定时任务'}</h2>
      </div>

      <div className="task-editor-body">
        {/* Task name */}
        <label className="task-field">
          <span className="task-field-label">任务名称</span>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaveError('') }}
            placeholder="例如：每日数据采集"
            autoFocus
          />
        </label>

        {/* Preset multi-select */}
        <div className="task-field">
          <span className="task-field-label">关联预设</span>
          <div className="task-preset-picker">
            {Array.from(grouped.entries()).map(([platform, commandMap]) => (
              <div key={platform} className="task-preset-platform">
                <div className="task-preset-platform-header">{platform}</div>
                {Array.from(commandMap.entries()).map(([command, cmdPresets]) => (
                  <div key={command} className="task-preset-command">
                    <div className="task-preset-command-header">{command}</div>
                    {cmdPresets.map((p) => (
                      <label key={p.id} className="task-preset-option">
                        <input
                          type="checkbox"
                          checked={selectedPresetIds.has(p.id)}
                          onChange={() => togglePreset(p.id)}
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {presets.length === 0 && (
              <p className="task-preset-empty">暂无可用预设，请先在左侧创建预设</p>
            )}
          </div>
        </div>

        {/* Schedule config */}
        <div className="task-field">
          <span className="task-field-label">调度方式</span>
          <div className="task-schedule-toggle">
            <button
              className={scheduleType === 'interval' ? 'active' : ''}
              onClick={() => setScheduleType('interval')}
            >
              固定间隔
            </button>
            <button
              className={scheduleType === 'daily' ? 'active' : ''}
              onClick={() => setScheduleType('daily')}
            >
              每日
            </button>
            <button
              className={scheduleType === 'weekly' ? 'active' : ''}
              onClick={() => setScheduleType('weekly')}
            >
              每周
            </button>
            <button
              className={scheduleType === 'monthly' ? 'active' : ''}
              onClick={() => setScheduleType('monthly')}
            >
              每月
            </button>
          </div>

          {scheduleType === 'interval' && (
            <div className="task-schedule-input">
              <input
                type="number"
                min={1}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
              />
              <span>分钟</span>
            </div>
          )}
          {scheduleType === 'daily' && (
            <div className="task-schedule-input">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}
          {scheduleType === 'weekly' && (
            <div className="task-schedule-input">
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                <option value={1}>周一</option>
                <option value={2}>周二</option>
                <option value={3}>周三</option>
                <option value={4}>周四</option>
                <option value={5}>周五</option>
                <option value={6}>周六</option>
                <option value={0}>周日</option>
              </select>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}
          {scheduleType === 'monthly' && (
            <div className="task-schedule-input">
              <span>每月</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                style={{ width: 60 }}
              />
              <span>日</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Data push webhook (optional) */}
        <label className="task-field">
          <span className="task-field-label">数据推送 Webhook（可选）</span>
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook — 任务执行后推送结果数据"
          />
        </label>

        {/* Enabled toggle */}
        <label className="task-field task-toggle-field">
          <span className="task-field-label">启用</span>
          <input
            type="checkbox"
            className="task-enabled-toggle"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>

        {/* Last run info (only when editing) */}
        {task && (
          <div className="task-field">
            <span className="task-field-label">上次运行</span>
            <div className="task-last-run">
              {lastRunLabel ? (
                <>
                  <span className={`task-last-status status-${task.lastStatus ?? 'idle'}`}>
                    {task.lastStatus === 'success' ? '成功' :
                     task.lastStatus === 'error' ? '失败' :
                     task.lastStatus === 'running' ? '运行中' : '未知'}
                  </span>
                  <span className="task-last-time">{lastRunLabel}</span>
                  {task.lastError && (
                    <span className="task-last-error">{task.lastError}</span>
                  )}
                </>
              ) : (
                <span className="task-last-none">尚未运行</span>
              )}
            </div>
          </div>
        )}

        {saveError && <div className="task-save-error">{saveError}</div>}
      </div>

      {/* Footer actions */}
      <div className="task-editor-footer">
        <button className="task-save-btn" onClick={handleSave}>保存</button>
        <button className="task-cancel-btn" onClick={onCancel}>取消</button>
        {task && (
          <button
            className="task-run-now-btn"
            onClick={() => onRunNow(task.id)}
          >
            立即运行
          </button>
        )}
      </div>
    </div>
  )
}
