import type { Adapter } from '../types'

interface Props {
  site: string
  commands: Adapter[]
  onSelect: (adapter: Adapter) => void
}

const STRATEGY_LABELS: Record<string, string> = {
  public: '公开',
  cookie: '需登录',
  ui: '浏览器',
  intercept: '拦截',
  local: '本地',
}

export default function CommandSelector({ site, commands, onSelect }: Props) {
  return (
    <div className="command-selector">
      <h2>{site} — 选择指令</h2>
      <div className="command-list">
        {commands.map((cmd) => (
          <button
            key={cmd.command}
            className="command-card"
            onClick={() => onSelect(cmd)}
          >
            <div className="command-header">
              <span className="command-name">{cmd.name}</span>
              <div className="command-badges">
                <span className={`badge strategy-${cmd.strategy}`}>
                  {STRATEGY_LABELS[cmd.strategy] || cmd.strategy}
                </span>
                <span className={`badge access-${cmd.access}`}>
                  {cmd.access === 'read' ? '读取' : '写入'}
                </span>
              </div>
            </div>
            <p className="command-desc">{cmd.description}</p>
            {cmd.args.length > 0 && (
              <div className="command-args-preview">
                {cmd.args.filter((a) => a.required).map((a) => (
                  <span key={a.name} className="arg-tag required">{a.name}*</span>
                ))}
                {cmd.args.filter((a) => !a.required).slice(0, 3).map((a) => (
                  <span key={a.name} className="arg-tag optional">{a.name}</span>
                ))}
                {cmd.args.filter((a) => !a.required).length > 3 && (
                  <span className="arg-tag more">+{cmd.args.filter((a) => !a.required).length - 3}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
