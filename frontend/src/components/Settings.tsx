import { useState, useEffect } from 'react'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

interface SettingsData {
  copyOnSelect: boolean
  pasteOnMiddleClick: boolean
  fontSize: number
  fontFamily: string
  lineHeight: number
  theme: string
}

const DEFAULT_SETTINGS: SettingsData = {
  copyOnSelect: true,
  pasteOnMiddleClick: true,
  fontSize: 14,
  fontFamily: 'Consolas, "Courier New", monospace',
  lineHeight: 1.2,
  theme: 'dark'
}

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)

  // 从localStorage加载设置
  useEffect(() => {
    const saved = localStorage.getItem('xgoterm_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setSettings({ ...DEFAULT_SETTINGS, ...parsed })
      } catch {
        // ignore
      }
    }
  }, [])

  // 保存设置到localStorage
  const saveSettings = (newSettings: SettingsData) => {
    setSettings(newSettings)
    localStorage.setItem('xgoterm_settings', JSON.stringify(newSettings))
  }

  if (!isOpen) return null

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: 8,
          padding: 24,
          minWidth: 500,
          maxWidth: 700,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--accent)' }}>⚙️ 设置</h2>
        
        {/* 复制粘贴设置 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12, color: 'var(--text)' }}>复制 & 粘贴</h3>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.copyOnSelect}
              onChange={(e) => saveSettings({ ...settings, copyOnSelect: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontWeight: 500 }}>选中文本自动复制</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>鼠标选中终端文本时自动复制到剪贴板</div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.pasteOnMiddleClick}
              onChange={(e) => saveSettings({ ...settings, pasteOnMiddleClick: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontWeight: 500 }}>鼠标中键粘贴</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>点击鼠标中键（滚轮）粘贴剪贴板内容</div>
            </div>
          </label>
        </div>

        {/* 终端外观 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12, color: 'var(--text)' }}>终端外观</h3>
          
          {/* 字体family */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ minWidth: 100 }}>字体:</span>
            <select
              value={settings.fontFamily}
              onChange={(e) => saveSettings({ ...settings, fontFamily: e.target.value })}
              style={{ flex: 1, padding: '6px 8px' }}
            >
              <option value='Consolas, "Courier New", monospace'>Consolas</option>
              <option value='"Cascadia Code", Consolas, monospace'>Cascadia Code</option>
              <option value='"Fira Code", Consolas, monospace'>Fira Code</option>
              <option value='"JetBrains Mono", Consolas, monospace'>JetBrains Mono</option>
              <option value='"Source Code Pro", Consolas, monospace'>Source Code Pro</option>
              <option value='Menlo, Monaco, "Courier New", monospace'>Menlo</option>
              <option value='"Microsoft YaHei", "微软雅黑", monospace'>微软雅黑</option>
            </select>
          </label>
          
          {/* 字体大小 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ minWidth: 100 }}>字体大小:</span>
            <input
              type="number"
              min="10"
              max="28"
              value={settings.fontSize}
              onChange={(e) => saveSettings({ ...settings, fontSize: parseInt(e.target.value) || 14 })}
              style={{ width: 80, padding: '4px 8px' }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>px</span>
          </label>
          
          {/* 行间距 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ minWidth: 100 }}>行间距:</span>
            <input
              type="number"
              min="1.0"
              max="2.0"
              step="0.1"
              value={settings.lineHeight}
              onChange={(e) => saveSettings({ ...settings, lineHeight: parseFloat(e.target.value) || 1.2 })}
              style={{ width: 80, padding: '4px 8px' }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>倍行距</span>
          </label>
          
          {/* 主题 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ minWidth: 100 }}>终端主题:</span>
            <select
              value={settings.theme}
              onChange={(e) => saveSettings({ ...settings, theme: e.target.value })}
              style={{ flex: 1, padding: '6px 8px' }}
            >
              <option value="dark">深色 (默认)</option>
              <option value="light">浅色</option>
              <option value="dracula">Dracula</option>
              <option value="monokai">Monokai</option>
              <option value="solarized-dark">Solarized Dark</option>
              <option value="solarized-light">Solarized Light</option>
              <option value="nord">Nord</option>
              <option value="gruvbox">Gruvbox Dark</option>
            </select>
          </label>
          
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, padding: 8, background: 'var(--panel2)', borderRadius: 4 }}>
            💡 修改设置后会立即应用到新打开的终端，已打开的终端需要重新连接
          </div>
        </div>

        {/* 快捷键设置 - 预留 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12, color: 'var(--text)' }}>快捷键</h3>
          <div style={{ 
            padding: 16, 
            background: 'var(--panel2)', 
            borderRadius: 4,
            color: 'var(--muted)',
            fontSize: 14
          }}>
            <div style={{ marginBottom: 8 }}><strong>Ctrl+C</strong> - 复制选中文本</div>
            <div style={{ marginBottom: 8 }}><strong>Ctrl+V</strong> - 粘贴</div>
            <div style={{ marginBottom: 8 }}><strong>Ctrl+Shift+F</strong> - 搜索（即将支持）</div>
            <div><strong>中键点击</strong> - 粘贴</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
            💡 未来版本将支持自定义快捷键配置
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '8px 20px' }}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// 导出获取设置的工具函数
export function getSettings(): SettingsData {
  const saved = localStorage.getItem('xgoterm_settings')
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
    } catch {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}
