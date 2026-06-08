import { useState, useMemo } from 'react'
import type { Adapter } from '../types'

interface Props {
  sites: string[]
  adapters: Adapter[]
  onSelect: (site: string) => void
}

const STRATEGY_LABELS: Record<string, string> = {
  public: '公开',
  cookie: '需登录',
  ui: '浏览器',
  intercept: '拦截',
  local: '本地',
}

const STRATEGY_COLORS: Record<string, string> = {
  public: '#4caf50',
  cookie: '#ff9800',
  ui: '#2196f3',
  intercept: '#9c27b0',
  local: '#607d8b',
}

// Priority order for grouping: if a site has mixed strategies, use the "heaviest" one
const STRATEGY_PRIORITY = ['public', 'local', 'intercept', 'cookie', 'ui']

export default function PlatformSelector({ sites, adapters, onSelect }: Props) {
  const [search, setSearch] = useState('')

  const siteMeta = useMemo(() => {
    const map = new Map<string, { count: number; strategies: Set<string>; primaryStrategy: string }>()
    for (const a of adapters) {
      const existing = map.get(a.site)
      if (existing) {
        existing.count++
        existing.strategies.add(a.strategy)
      } else {
        map.set(a.site, { count: 1, strategies: new Set([a.strategy]), primaryStrategy: a.strategy })
      }
    }
    // Resolve primary strategy: pick the heaviest strategy for the site
    for (const meta of map.values()) {
      for (const s of STRATEGY_PRIORITY) {
        if (meta.strategies.has(s)) {
          meta.primaryStrategy = s
          break
        }
      }
    }
    return map
  }, [adapters])

  const filtered = useMemo(() => {
    if (!search.trim()) return sites
    const q = search.toLowerCase()
    return sites.filter((s) => s.toLowerCase().includes(q))
  }, [sites, search])

  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {}
    for (const site of filtered) {
      const meta = siteMeta.get(site)
      const strategy = meta?.primaryStrategy || 'public'
      if (!groups[strategy]) groups[strategy] = []
      groups[strategy].push(site)
    }
    return groups
  }, [filtered, siteMeta])

  return (
    <div className="platform-selector">
      <h2>选择平台</h2>
      <input
        type="text"
        className="search-input"
        placeholder="搜索平台..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="platform-groups">
        {Object.entries(grouped).map(([strategy, strategySites]) => (
          <div key={strategy} className="platform-group">
            <div className="group-header">
              <span
                className="strategy-badge"
                style={{ background: STRATEGY_COLORS[strategy] || '#999' }}
              >
                {STRATEGY_LABELS[strategy] || strategy}
              </span>
              <span className="group-count">{strategySites.length} 个平台</span>
            </div>
            <div className="platform-grid">
              {strategySites.map((site) => {
                const meta = siteMeta.get(site)
                return (
                  <button
                    key={site}
                    className="platform-card"
                    onClick={() => onSelect(site)}
                  >
                    <span className="platform-name">{site}</span>
                    <span className="platform-count">{meta?.count || 0} 个指令</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
