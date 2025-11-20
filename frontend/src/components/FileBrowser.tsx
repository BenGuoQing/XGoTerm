import React, { useState, useCallback, useEffect } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'

interface FileBrowserProps {
  sessionId: string
  onClose: () => void
}

interface RemoteFile {
  name: string
  path: string
  size: number
  mode: string
  modTime: number
  isDir: boolean
}

interface Transfer {
  id: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  progress: TransferProgress | null
}

interface TransferProgress {
  transferId: string
  transferred: number
  total: number
  percent: number
  speed: number
  status: string
  error?: string
}

export default function FileBrowser({ sessionId, onClose }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState<RemoteFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<RemoteFile | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: RemoteFile } | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [lastSessionId, setLastSessionId] = useState(sessionId)

  // 加载目录
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const { ListRemoteDir } = await import('../../wailsjs/go/main/FileManager')
      const fileList = await ListRemoteDir(sessionId, path)
      setFiles(fileList || [])
      setCurrentPath(path)
    } catch (e: any) {
      alert('加载目录失败: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // 初始加载
  useEffect(() => {
    loadDirectory('/')
  }, [loadDirectory])

  // 监听会话切换
  useEffect(() => {
    if (sessionId !== lastSessionId) {
      console.log(`[FileBrowser] 会话切换: ${lastSessionId} -> ${sessionId}`)
      setLastSessionId(sessionId)
      setCurrentPath('/')
      setFiles([])
      loadDirectory('/')
    }
  }, [sessionId, lastSessionId, loadDirectory])

  // 监听传输进度
  useEffect(() => {
    const unsubscribers: Array<() => void> = []
    transfers.forEach(transfer => {
      // 只为新的传输任务注册监听器
      if (!transfer.progress) {
        console.log(`[FileBrowser] 开始监听传输进度: ${transfer.id}`)
        const unsub = EventsOn(`file:progress:${transfer.id}`, (progress: TransferProgress) => {
          console.log(`[FileBrowser] 收到进度更新:`, progress)
          setTransfers(prev => prev.map(t => 
            t.id === transfer.id ? { ...t, progress } : t
          ))
        })
        unsubscribers.push(unsub)
      }
    })
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [transfers.length]) // 改为只在transfers数量变化时重新订阅

  // 双击文件/文件夹
  const handleDoubleClick = useCallback((file: RemoteFile) => {
    if (file.isDir) {
      loadDirectory(file.path)
    }
  }, [loadDirectory])

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, file: RemoteFile) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }, [])

  // 关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // 下载文件
  const handleDownload = useCallback(async (file: RemoteFile) => {
    try {
      // 调用 Go 后端的文件保存对话框
      const { SelectSaveFile } = await import('../../wailsjs/go/main/App')
      const localPath = await SelectSaveFile(file.name)
      
      if (!localPath) return // 用户取消了

      const { DownloadFile } = await import('../../wailsjs/go/main/FileManager')
      const transferId = await DownloadFile(sessionId, file.path, localPath)
      setTransfers(prev => [...prev, {
        id: transferId,
        type: 'download',
        localPath,
        remotePath: file.path,
        progress: null
      }])
    } catch (e: any) {
      alert('下载失败: ' + (e?.message || String(e)))
    }
    setContextMenu(null)
  }, [sessionId])

  // 删除文件
  const handleDelete = useCallback(async (file: RemoteFile) => {
    if (!confirm(`确认删除 "${file.name}" 吗？`)) return

    try {
      const { DeleteRemoteFile } = await import('../../wailsjs/go/main/FileManager')
      await DeleteRemoteFile(sessionId, file.path)
      loadDirectory(currentPath)
    } catch (e: any) {
      alert('删除失败: ' + (e?.message || String(e)))
    }
    setContextMenu(null)
  }, [sessionId, currentPath, loadDirectory])

  // 重命名文件
  const handleRename = useCallback(async (file: RemoteFile) => {
    const newName = prompt('新名称：', file.name)
    if (!newName || newName === file.name) return

    const newPath = file.path.replace(/[^/]+$/, newName)
    try {
      const { RenameRemoteFile } = await import('../../wailsjs/go/main/FileManager')
      await RenameRemoteFile(sessionId, file.path, newPath)
      loadDirectory(currentPath)
    } catch (e: any) {
      alert('重命名失败: ' + (e?.message || String(e)))
    }
    setContextMenu(null)
  }, [sessionId, currentPath, loadDirectory])

  // 新建文件夹
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName) return

    const newPath = `${currentPath}/${newFolderName}`.replace(/\/+/g, '/')
    try {
      const { CreateRemoteDir } = await import('../../wailsjs/go/main/FileManager')
      await CreateRemoteDir(sessionId, newPath)
      loadDirectory(currentPath)
      setShowNewFolder(false)
      setNewFolderName('')
    } catch (e: any) {
      alert('创建文件夹失败: ' + (e?.message || String(e)))
    }
  }, [sessionId, currentPath, newFolderName, loadDirectory])

  // 上传文件
  const handleUpload = useCallback(async (localFiles: FileList) => {
    try {
      const { UploadFile } = await import('../../wailsjs/go/main/FileManager')
      
      for (let i = 0; i < localFiles.length; i++) {
        const file = localFiles[i]
        // @ts-ignore
        const localPath = file.path || file.name
        const remotePath = `${currentPath}/${file.name}`.replace(/\/+/g, '/')

        const transferId = await UploadFile(sessionId, localPath, remotePath)
        setTransfers(prev => [...prev, {
          id: transferId,
          type: 'upload',
          localPath,
          remotePath,
          progress: null
        }])
      }
      // 上传完成后刷新目录
      setTimeout(() => loadDirectory(currentPath), 1000)
    } catch (e: any) {
      alert('上传失败: ' + (e?.message || String(e)))
    }
  }, [sessionId, currentPath, loadDirectory])

  // 拖拽上传
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleUpload(e.dataTransfer.files)
  }, [handleUpload])

  // 返回上一级
  const handleGoUp = useCallback(() => {
    const parent = currentPath.replace(/\/[^/]*$/, '') || '/'
    loadDirectory(parent)
  }, [currentPath, loadDirectory])

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: isCollapsed ? 50 : 600,
      height: '100%',
      background: 'var(--panel)',
      borderLeft: '2px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      transition: 'width 0.3s ease'
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {!isCollapsed && <div style={{ fontWeight: 600, fontSize: 14 }}>📁 文件浏览器</div>}
        <div style={{ display: 'flex', gap: 4 }}>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? '展开' : '折叠'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 16,
              padding: 4
            }}
          >
            {isCollapsed ? '◀' : '▶'}
          </button>
          {!isCollapsed && (
            <button 
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 18,
                padding: 4
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* 折叠状态下的提示 */}
      {isCollapsed && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          writingMode: 'vertical-rl',
          fontSize: 12,
          color: 'var(--muted)',
          letterSpacing: 2
        }}>
          文件浏览器
        </div>
      )}

      {/* 工具栏 */}
      {!isCollapsed && (
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handleGoUp} disabled={currentPath === '/'} title="返回上一级">
          ⬆️
        </button>
        <button onClick={() => loadDirectory(currentPath)} title="刷新">
          🔄
        </button>
        <button onClick={() => setShowNewFolder(true)} title="新建文件夹">
          📁+
        </button>
        <label style={{ marginLeft: 'auto' }}>
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            height: 32,
            background: 'var(--btn-bg1)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>⬆️ 上传文件</span>
        </label>
      </div>
      )}

      {/* 当前路径 */}
      {!isCollapsed && (
      <div style={{
        padding: '8px 16px',
        background: 'var(--panel2)',
        fontSize: 12,
        fontFamily: 'monospace',
        borderBottom: '1px solid var(--border)'
      }}>
        📍 {currentPath}
      </div>
      )}

      {/* 文件列表 */}
      {!isCollapsed && (
      <div 
        style={{ flex: 1, overflow: 'auto' }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(122, 162, 247, 0.2)',
            border: '3px dashed var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 600,
            zIndex: 10
          }}>
            🎯 松开鼠标上传文件
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            加载中...
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            空文件夹
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>名称</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>大小</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>修改时间</th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr
                  key={file.path}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: selectedFile?.path === file.path ? 'var(--accent-2)' : 'transparent'
                  }}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => handleDoubleClick(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel2)' }}
                  onMouseLeave={(e) => { 
                    if (selectedFile?.path !== file.path) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{file.isDir ? '📁' : '📄'}</span>
                    <span style={{ fontWeight: file.isDir ? 600 : 400 }}>{file.name}</span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                    {file.isDir ? '-' : formatSize(file.size)}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11 }}>
                    {formatTime(file.modTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* 传输列表 */}
      {!isCollapsed && transfers.length > 0 && (
        <div style={{ 
          maxHeight: 200, 
          overflowY: 'auto', 
          borderTop: '2px solid var(--border)',
          background: 'var(--bg)'
        }}>
          <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12, borderBottom: '1px solid var(--border)' }}>
            传输任务 ({transfers.length})
          </div>
          {transfers.map(transfer => (
            <div key={transfer.id} style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, marginBottom: 4 }}>
                {transfer.type === 'upload' ? '⬆️' : '⬇️'} {transfer.remotePath.split('/').pop()}
              </div>
              {transfer.progress && (
                <>
                  <div style={{
                    width: '100%',
                    height: 3,
                    background: 'var(--panel2)',
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${transfer.progress.percent}%`,
                      height: '100%',
                      background: transfer.progress.status === 'completed' ? '#9ece6a' : 'var(--accent)',
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {transfer.progress.percent.toFixed(1)}% - {(transfer.progress.speed / 1024).toFixed(1)} KB/s
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          padding: 4,
          minWidth: 140,
          zIndex: 10000
        }}>
          {!contextMenu.file.isDir && (
            <div 
              onClick={() => handleDownload(contextMenu.file)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: 4,
                fontSize: 13
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              ⬇️ 下载文件
            </div>
          )}
          {contextMenu.file.isDir && (
            <div 
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                fontSize: 13,
                color: 'var(--muted)',
                cursor: 'not-allowed'
              }}
              title="暂不支持下载目录"
            >
              ⬇️ 下载文件 (不支持目录)
            </div>
          )}
          <div 
            onClick={() => handleRename(contextMenu.file)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: 4,
              fontSize: 13
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            ✏️ 重命名
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div 
            onClick={() => handleDelete(contextMenu.file)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: 4,
              color: 'var(--danger)',
              fontSize: 13
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(247, 118, 142, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            🗑️ 删除
          </div>
        </div>
      )}

      {/* 新建文件夹对话框 */}
      {showNewFolder && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
            minWidth: 300
          }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>新建文件夹</div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="文件夹名称"
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateFolder} style={{ flex: 1 }}>创建</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} style={{ flex: 1 }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
