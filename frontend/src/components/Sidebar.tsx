import React, { useCallback } from 'react'

export type HostItem = {
  id: string
  name: string
  host: string
  port: number
  username: string
  tags?: string[]
}

interface Props {
  hosts: HostItem[]
  onConnect: (h: HostItem) => void
  onDelete?: (id: string) => void
  onEdit?: (h: HostItem) => void
  onWebPreview?: (h: HostItem) => void
  onClone?: (h: HostItem) => void
}

export default function Sidebar({ hosts, onConnect, onDelete, onEdit, onWebPreview, onClone }: Props) {
  const [groupBy, setGroupBy] = React.useState<'none' | 'tag'>('tag')
  const [searchText, setSearchText] = React.useState('')
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())
  
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }
  
  const handleHostDoubleClick = useCallback((h: HostItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onConnect(h)
  }, [onConnect])

  const handleDeleteClick = useCallback((h: HostItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`确认删除主机 "${h.name || h.host}" 吗？`)) {
      onDelete?.(h.id)
    }
  }, [onDelete])

  const handleContextMenu = useCallback((h: HostItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 创建右键菜单
    const menu = document.createElement('div')
    menu.className = 'context-menu'
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      z-index: 10000;
    `
    
    menu.innerHTML = `
      <div class="context-menu-item" data-action="edit">✏️ 编辑主机</div>
      <div class="context-menu-item" data-action="connect">🔌 立即连接</div>
      <div class="context-menu-item" data-action="clone">📋 快速复制</div>
      <div class="context-menu-item" data-action="webpreview">🌐 Web预览 (SSH隧道)</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item context-menu-danger" data-action="delete">🗑️ 删除主机</div>
    `
    
    document.body.appendChild(menu)
    
    // 处理菜单点击
    const handleMenuClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const action = target.getAttribute('data-action')
      
      if (action === 'edit') {
        onEdit?.(h)
      } else if (action === 'connect') {
        onConnect(h)
      } else if (action === 'clone') {
        onClone?.(h)
      } else if (action === 'webpreview') {
        onWebPreview?.(h)
      } else if (action === 'delete') {
        if (confirm(`确认删除主机 "${h.name || h.host}" 吗？`)) {
          onDelete?.(h.id)
        }
      }
      
      cleanup()
    }
    
    // 点击其他地方关闭菜单
    const handleClickOutside = () => cleanup()
    
    const cleanup = () => {
      menu.removeEventListener('click', handleMenuClick)
      document.removeEventListener('click', handleClickOutside)
      menu.remove()
    }
    
    menu.addEventListener('click', handleMenuClick)
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
  }, [onEdit, onConnect, onDelete, onWebPreview, onClone])

  // 过滤搜索
  const filteredHosts = React.useMemo(() => {
    if (!searchText) return hosts
    const search = searchText.toLowerCase()
    return hosts.filter(h => 
      (h.name || h.host).toLowerCase().includes(search) ||
      h.host.toLowerCase().includes(search) ||
      h.username.toLowerCase().includes(search) ||
      (h.tags || []).some(t => t.toLowerCase().includes(search))
    )
  }, [hosts, searchText])

  // 按标签分组
  const groupedHosts = React.useMemo(() => {
    if (groupBy === 'none') {
      return { '全部': filteredHosts }
    }
    
    const groups: Record<string, HostItem[]> = {}
    const ungrouped: HostItem[] = []
    
    filteredHosts.forEach(h => {
      if (h.tags && h.tags.length > 0) {
        h.tags.forEach(tag => {
          if (!groups[tag]) groups[tag] = []
          groups[tag].push(h)
        })
      } else {
        ungrouped.push(h)
      }
    })
    
    if (ungrouped.length > 0) {
      groups['未分组'] = ungrouped
    }
    
    return groups
  }, [filteredHosts, groupBy])
  
  // 当切换到分组模式时，自动展开所有组
  React.useEffect(() => {
    if (groupBy === 'tag') {
      setExpandedGroups(new Set(Object.keys(groupedHosts)))
    }
  }, [groupBy, groupedHosts])

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span>主机列表 ({hosts.length})</span>
        <button 
          className="icon-btn" 
          style={{ width: 24, height: 24, fontSize: 14 }} 
          onClick={() => setGroupBy(groupBy === 'none' ? 'tag' : 'none')} 
          title={groupBy === 'none' ? '按标签分组' : '取消分组'}
        >
          {groupBy === 'none' ? '📋' : '📁'}
        </button>
      </div>
      
      <div style={{ padding: '0 12px 12px 12px' }}>
        <input
          type="text"
          placeholder="🔍 搜索主机..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1.5px solid var(--border)',
            borderRadius: 6,
            background: 'var(--panel2)',
            color: 'var(--text)',
            fontSize: 13,
            transition: 'all 0.2s',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.background = 'var(--panel)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'var(--panel2)'
          }}
        />
      </div>
      
      <div className="sidebar-body">
        {hosts.length === 0 && (
          <div className="sidebar-empty">
            <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
            暂无主机<br/>
            <span style={{ opacity: 0.5 }}>新建连接后可保存到此处</span>
          </div>
        )}
        
        {Object.entries(groupedHosts).map(([groupName, groupHosts]) => {
          const isExpanded = expandedGroups.has(groupName)
          return (
            <div key={groupName} style={{ marginBottom: 4 }}>
              {groupBy !== 'none' && (
                <div 
                  onClick={() => toggleGroup(groupName)}
                  style={{ 
                    padding: '10px 12px', 
                    margin: '0 0 8px 0',
                    fontSize: 13, 
                    fontWeight: 600, 
                    color: 'var(--text)',
                    background: 'var(--bg)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    userSelect: 'none',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.background = 'var(--panel2)'
                    e.currentTarget.style.borderColor = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.background = 'var(--bg)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <span style={{ fontSize: 10, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  📁 {groupName}
                  <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>({groupHosts.length})</span>
                </div>
              )}
              {(groupBy === 'none' || isExpanded) && groupHosts.map(h => (
              <div 
                key={h.id} 
                className="host-item"
                style={{ 
                  marginLeft: groupBy !== 'none' ? '12px' : '0',
                  marginRight: groupBy !== 'none' ? '0' : '0',
                  position: 'relative'
                }}
                title={`双击连接 / 右键更多操作: ${h.username}@${h.host}:${h.port}`}
                onDoubleClick={(e) => handleHostDoubleClick(h, e)}
                onContextMenu={(e) => handleContextMenu(h, e)}
              >
                <div className="dot" />
                <div className="host-text" style={{ flex: 1 }}>
                  <div className="host-name">{h.name || h.host}</div>
                  <div className="host-sub">
                    {h.username}@{h.host}:{h.port}
                    {h.tags && h.tags.length > 0 && groupBy === 'none' && (
                      <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>
                        {h.tags.map(t => `#${t}`).join(' ')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="host-actions">
                  {onDelete && (
                    <button 
                      onClick={(e) => handleDeleteClick(h, e)}
                      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      title="删除"
                    >✖</button>
                  )}
                </div>
              </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
