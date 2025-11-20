import React, { useState, useCallback, useEffect } from 'react'
import { EventsOn } from '../../wailsjs/runtime/runtime'

interface FileTransferProps {
  sessionId: string
  onClose: () => void
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

interface Transfer {
  id: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  progress: TransferProgress | null
}

export default function FileTransfer({ sessionId, onClose }: FileTransferProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // 监听传输进度事件
  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    transfers.forEach(transfer => {
      const unsub = EventsOn(`file:progress:${transfer.id}`, (progress: TransferProgress) => {
        setTransfers(prev => prev.map(t => 
          t.id === transfer.id ? { ...t, progress } : t
        ))
      })
      unsubscribers.push(unsub)
    })

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [transfers])

  const handleUpload = useCallback(async () => {
    if (!localPath || !remotePath) {
      alert('请输入本地路径和远程路径')
      return
    }

    try {
      // 动态导入 Wails 生成的函数
      const { UploadFile } = await import('../../wailsjs/go/main/FileManager')
      const transferId = await UploadFile(sessionId, localPath, remotePath)
      
      setTransfers(prev => [...prev, {
        id: transferId,
        type: 'upload',
        localPath,
        remotePath,
        progress: null
      }])

      setLocalPath('')
      setRemotePath('')
      setShowUpload(false)
    } catch (e: any) {
      alert('上传失败: ' + (e?.message || String(e)))
    }
  }, [sessionId, localPath, remotePath])

  const handleDownload = useCallback(async () => {
    if (!localPath || !remotePath) {
      alert('请输入远程路径和本地路径')
      return
    }

    try {
      const { DownloadFile } = await import('../../wailsjs/go/main/FileManager')
      const transferId = await DownloadFile(sessionId, remotePath, localPath)
      
      setTransfers(prev => [...prev, {
        id: transferId,
        type: 'download',
        localPath,
        remotePath,
        progress: null
      }])

      setLocalPath('')
      setRemotePath('')
      setShowDownload(false)
    } catch (e: any) {
      alert('下载失败: ' + (e?.message || String(e)))
    }
  }, [sessionId, localPath, remotePath])

  const handleCancelTransfer = useCallback(async (transferId: string) => {
    try {
      const { CancelTransfer } = await import('../../wailsjs/go/main/FileManager')
      await CancelTransfer(transferId)
    } catch (e: any) {
      console.error('取消传输失败:', e)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const remotePath = prompt('请输入远程目录路径（如：/home/user/）')
    if (!remotePath) return

    try {
      const { UploadFile } = await import('../../wailsjs/go/main/FileManager')
      
      for (const file of files) {
        // @ts-ignore - file.path 是 Electron/Wails 特有的属性
        const localFilePath = file.path || file.name
        const remoteFilePath = remotePath.endsWith('/') 
          ? remotePath + file.name 
          : remotePath + '/' + file.name

        const transferId = await UploadFile(sessionId, localFilePath, remoteFilePath)
        
        setTransfers(prev => [...prev, {
          id: transferId,
          type: 'upload',
          localPath: localFilePath,
          remotePath: remoteFilePath,
          progress: null
        }])
      }
    } catch (e: any) {
      alert('上传失败: ' + (e?.message || String(e)))
    }
  }, [sessionId])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 400,
      height: '100%',
      background: 'var(--panel)',
      borderLeft: '2px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>📁 文件传输</div>
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
      </div>

      {/* 操作按钮 */}
      <div style={{ padding: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => setShowUpload(true)} style={{ flex: 1 }}>
          ⬆️ 上传
        </button>
        <button onClick={() => setShowDownload(true)} style={{ flex: 1 }}>
          ⬇️ 下载
        </button>
      </div>

      {/* 拖拽上传区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          margin: '0 12px 12px',
          padding: 20,
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--muted)',
          background: isDragging ? 'rgba(122, 162, 247, 0.1)' : 'var(--panel2)',
          transition: 'all 0.2s'
        }}
      >
        {isDragging ? '🎯 松开鼠标上传文件' : '📎 拖拽文件到此处上传'}
      </div>

      {/* 传输列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {transfers.map(transfer => (
          <div key={transfer.id} style={{
            padding: 12,
            marginBottom: 8,
            background: 'var(--panel2)',
            borderRadius: 8,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span>{transfer.type === 'upload' ? '⬆️' : '⬇️'}</span>
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>
                  {transfer.type === 'upload' ? transfer.localPath.split(/[/\\]/).pop() : transfer.remotePath.split('/').pop()}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {transfer.type === 'upload' ? `→ ${transfer.remotePath}` : `← ${transfer.remotePath}`}
                </div>
              </div>
              {transfer.progress?.status === 'running' && (
                <button
                  onClick={() => handleCancelTransfer(transfer.id)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    background: 'var(--danger)',
                    border: 'none',
                    color: '#fff'
                  }}
                >取消</button>
              )}
            </div>

            {transfer.progress && (
              <>
                <div style={{
                  width: '100%',
                  height: 4,
                  background: 'var(--bg)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginBottom: 8
                }}>
                  <div style={{
                    width: `${transfer.progress.percent}%`,
                    height: '100%',
                    background: transfer.progress.status === 'completed' ? '#9ece6a' : 
                               transfer.progress.status === 'failed' ? 'var(--danger)' : 
                               'var(--accent)',
                    transition: 'width 0.3s'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                  <span>
                    {formatBytes(transfer.progress.transferred)} / {formatBytes(transfer.progress.total)}
                  </span>
                  <span>
                    {transfer.progress.status === 'running' && formatSpeed(transfer.progress.speed)}
                    {transfer.progress.status === 'completed' && '✅ 完成'}
                    {transfer.progress.status === 'failed' && '❌ 失败'}
                    {transfer.progress.status === 'cancelled' && '⏸️ 已取消'}
                  </span>
                </div>

                {transfer.progress.error && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--danger)' }}>
                    {transfer.progress.error}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* 上传对话框 */}
      {showUpload && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
            width: '100%'
          }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>上传文件</div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              本地文件路径
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="C:\path\to\file.txt"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              远程路径
              <input
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                placeholder="/home/user/file.txt"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleUpload} style={{ flex: 1 }}>上传</button>
              <button onClick={() => setShowUpload(false)} style={{ flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 下载对话框 */}
      {showDownload && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 20,
            width: '100%'
          }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>下载文件</div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              远程文件路径
              <input
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                placeholder="/home/user/file.txt"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              保存到本地
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="C:\path\to\save\file.txt"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDownload} style={{ flex: 1 }}>下载</button>
              <button onClick={() => setShowDownload(false)} style={{ flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
