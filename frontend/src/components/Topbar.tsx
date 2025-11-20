import React from 'react'

interface Props {
  connectOpen: boolean
  onToggleConnect: () => void
  onToggleRecording: () => void
  recording: boolean
  onImport: () => void
  onExport: () => void
  onSettings: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onToggleDevTools?: () => void
  onToggleFileTransfer?: () => void
}

export default function Topbar({ connectOpen, onToggleConnect, onToggleRecording, recording, onImport, onExport, onSettings, theme, onToggleTheme, onToggleDevTools, onToggleFileTransfer }: Props) {
  return (
    <div className="topbar">
      <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/logo.png" alt="Logo" style={{ width: 24, height: 24 }} />
        XGoTerm
      </strong>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />
      <button onClick={onToggleConnect} style={{ background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }}>
        {connectOpen ? '关闭面板' : '⚡ 新建连接'}
      </button>
      <button onClick={onToggleFileTransfer} title="文件传输">
        📁 文件
      </button>
      
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button className="icon-btn" onClick={onToggleRecording} title={recording ? '停止录制' : '开始录制'} style={recording ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : {}}>
          {recording ? '⏹' : '⏺'}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <button className="icon-btn" onClick={onImport} title="导入配置">📥</button>
        <button className="icon-btn" onClick={onExport} title="导出配置">📤</button>
        <button className="icon-btn" onClick={onToggleTheme} title="切换主题">
          {theme === 'dark' ? '🌙' : '🌞'}
        </button>
        <button className="icon-btn" onClick={onToggleDevTools} title="开发者工具 (F12)">🔧</button>
        <button className="icon-btn" onClick={onSettings} title="设置">⚙️</button>
      </div>
    </div>
  )
}
