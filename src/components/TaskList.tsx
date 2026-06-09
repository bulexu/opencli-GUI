import type { ScheduledTask } from '../types'

interface Props {
  tasks: ScheduledTask[]
  editingTaskId: string | null
  onAdd: () => void
  onEdit: (task: ScheduledTask) => void
  onDelete: (id: string) => void
}

function scheduleSummary(task: ScheduledTask): string {
  if (task.schedule.type === 'interval') {
    return `每 ${task.schedule.intervalMinutes ?? '?'} 分钟`
  }
  return `每天 ${task.schedule.time ?? '??:??'}`
}

function statusClass(status?: string): string {
  if (status === 'success') return 'status-ok'
  if (status === 'error') return 'status-error'
  if (status === 'running') return 'status-running'
  return 'status-idle'
}

export default function TaskList({ tasks, editingTaskId, onAdd, onEdit, onDelete }: Props) {
  return (
    <div className="task-list">
      <div className="task-list-header">
        <h3>定时任务</h3>
        <button className="task-add-btn" onClick={onAdd} title="新建任务">+</button>
      </div>
      {tasks.length === 0 ? (
        <p className="task-empty">暂无定时任务</p>
      ) : (
        <div className="task-items">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`task-item${editingTaskId === task.id ? ' active' : ''}${!task.enabled ? ' disabled' : ''}`}
              onClick={() => onEdit(task)}
            >
              <span className={`task-status-dot ${statusClass(task.lastStatus)}`} />
              <div className="task-item-info">
                <span className="task-item-name">{task.name || '未命名任务'}</span>
                <span className="task-item-schedule">{scheduleSummary(task)}</span>
              </div>
              <button
                className="task-delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
                title="删除任务"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
