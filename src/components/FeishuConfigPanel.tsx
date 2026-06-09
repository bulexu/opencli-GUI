import { useState, useEffect } from 'react'
import type { FeishuConfig } from '../types'
import { saveFeishuConfig, testFeishuWebhook } from '../services/opencli'

interface Props {
  config: FeishuConfig
  open: boolean
  onClose: () => void
  onSaved: (config: FeishuConfig) => void
}

function isValidWebhookUrl(url: string): boolean {
  if (!url) return true // empty is allowed (partial save)
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export default function FeishuConfigPanel({ config, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FeishuConfig>(config)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setForm(config)
    setUrlError(null)
    setTestResult(null)
    setSaveError(null)
  }, [config, open])

  if (!open) return null

  const handleSave = async () => {
    if (!isValidWebhookUrl(form.webhook.url)) {
      setUrlError('请输入有效的 Webhook URL')
      return
    }
    setUrlError(null)
    setSaving(true)
    try {
      const saved = await saveFeishuConfig(form)
      onSaved(saved)
    } catch {
      setSaveError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!form.webhook.url) return
    if (!isValidWebhookUrl(form.webhook.url)) {
      setUrlError('请输入有效的 Webhook URL')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testFeishuWebhook(form.webhook.url, form.webhook.keyword)
      setTestResult({ ok: res.success, msg: res.success ? 'Webhook 测试成功' : res.error || '测试失败' })
    } catch {
      setTestResult({ ok: false, msg: '请求失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="feishu-config-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>飞书配置</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <h3>Webhook</h3>
            <div className={`form-field ${urlError ? 'field-error' : ''}`}>
              <label>Webhook URL</label>
              <input
                type="text"
                value={form.webhook.url}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                onChange={(e) => {
                  setForm({ ...form, webhook: { ...form.webhook, url: e.target.value } })
                  setUrlError(null)
                  setTestResult(null)
                }}
              />
            </div>
            {urlError && <div className="field-error-msg">{urlError}</div>}

            <div className="form-field">
              <label>Webhook 关键词</label>
              <input
                type="text"
                value={form.webhook.keyword}
                placeholder="飞书 Webhook 安全设置关键词"
                onChange={(e) => setForm({ ...form, webhook: { ...form.webhook, keyword: e.target.value } })}
              />
            </div>

            {form.webhook.url && (
              <div className="webhook-test-row">
                <button
                  className="test-btn"
                  disabled={testing}
                  onClick={handleTest}
                >
                  {testing ? '测试中...' : '测试 Webhook'}
                </button>
                {testResult && (
                  <span className={`test-result ${testResult.ok ? 'test-ok' : 'test-fail'}`}>
                    {testResult.msg}
                  </span>
                )}
              </div>
            )}
          </div>

          {saveError && <div className="modal-save-error">{saveError}</div>}
        </div>

        <div className="modal-footer">
          <button className="save-btn" onClick={onClose}>取消</button>
          <button className="run-btn" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
