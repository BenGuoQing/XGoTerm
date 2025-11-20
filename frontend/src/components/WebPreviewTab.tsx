import { useState, useEffect, useRef } from 'react'

interface Props {
  localPort: number
  remoteHost: string
  remotePort: number
  title: string
}

export default function WebPreviewTab({ localPort, remoteHost, remotePort, title }: Props) {
  // 使用127.0.0.1代替localhost，避免某些浏览器的localhost解析问题
  const [url, setUrl] = useState(`http://127.0.0.1:${localPort}`)
  const [inputUrl, setInputUrl] = useState(url)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadTimeout, setLoadTimeout] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timeoutRef = useRef<number>()
  
  // 监听iframe消息
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // 处理iframe内的消息
      if (e.data?.type === 'navigation-error') {
        console.warn('iframe navigation error:', e.data)
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  useEffect(() => {
    setUrl(`http://127.0.0.1:${localPort}`)
    setInputUrl(`http://127.0.0.1:${localPort}`)
    setLoadError(false)
    setLoadTimeout(false)
    
    // 设置15秒超时
    timeoutRef.current = window.setTimeout(() => {
      if (isLoading) {
        console.warn('⏱️ Web page load timeout')
        setLoadTimeout(true)
        setIsLoading(false)
      }
    }, 15000)
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [localPort])

  const handleNavigate = () => {
    setUrl(inputUrl)
    setIsLoading(true)
    setLoadError(false)
    setLoadTimeout(false)
    
    // 重新设置超时
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      setLoadTimeout(true)
      setIsLoading(false)
    }, 15000)
  }

  const handleRefresh = () => {
    if (iframeRef.current) {
      setLoadError(false)
      setLoadTimeout(false)
      setIsLoading(true)
      
      // 重新设置超时
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        setLoadTimeout(true)
        setIsLoading(false)
      }, 15000)
      
      // 强制刷新
      const currentSrc = iframeRef.current.src
      iframeRef.current.src = ''
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc
        }
      }, 10)
    }
  }

  const handleGoBack = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.history.back()
    }
  }

  const handleGoForward = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.history.forward()
    }
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'var(--bg)'
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)'
      }}>
        <button 
          onClick={handleGoBack}
          style={{ padding: '4px 8px', fontSize: 16 }}
          title="后退"
        >
          ←
        </button>
        <button 
          onClick={handleGoForward}
          style={{ padding: '4px 8px', fontSize: 16 }}
          title="前进"
        >
          →
        </button>
        <button 
          onClick={handleRefresh}
          style={{ padding: '4px 8px', fontSize: 16 }}
          title="刷新"
        >
          ↻
        </button>
        
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            style={{
              flex: 1,
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 14
            }}
            placeholder="输入URL..."
          />
          <button onClick={handleNavigate} style={{ padding: '6px 16px' }}>
            前往
          </button>
        </div>

        <div style={{ 
          fontSize: 11, 
          color: 'var(--muted)',
          padding: '6px 12px',
          borderLeft: '1px solid var(--border)',
          background: 'var(--panel2)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          maxWidth: 280
        }}>
          <div style={{ fontWeight: 600, color: '#4caf50', fontSize: 12 }}>🔒 SSH隧道</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📍 远程服务:</span>
            <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>
              {remoteHost}:{remotePort}
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🔗 本地访问:</span>
            <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>
              localhost:{localPort}
            </code>
          </div>
        </div>
      </div>

      {/* iframe容器 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* 快捷操作横幅 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(76, 175, 80, 0.9)',
          color: '#fff',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔒</span>
            <span>通过SSH隧道安全访问</span>
          </div>
          <button 
            onClick={() => window.open(`http://127.0.0.1:${localPort}`, '_blank')}
            style={{
              padding: '3px 10px',
              background: '#fff',
              color: '#4caf50',
              border: 'none',
              borderRadius: 3,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 11
            }}
          >
            在浏览器中打开
          </button>
        </div>
        {isLoading && !loadTimeout && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            zIndex: 10
          }}>
            <div style={{ textAlign: 'center', maxWidth: 450 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
              <div style={{ fontSize: 16, marginBottom: 8 }}>正在加载Web页面...</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, wordBreak: 'break-all', marginBottom: 16 }}>
                {url}
              </div>
              
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 16px', background: 'var(--panel2)', borderRadius: 4, marginBottom: 12 }}>
                💡 加载提示：<br/>
                • 首次加载可能需要几秒钟<br/>
                • 控制台的 "Failed to launch" 警告可以忽略<br/>
                • 如果长时间加载，点击下方按钮在浏览器测试<br/>
                • 确认远程主机上服务正常运行（端口{remotePort}）
              </div>
              
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button 
                  onClick={() => window.open(`http://127.0.0.1:${localPort}`, '_blank')}
                  style={{ 
                    padding: '6px 16px', 
                    fontSize: 13,
                    background: 'var(--accent)', 
                    color: '#fff', 
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  🌐 在浏览器中打开
                </button>
                <button 
                  onClick={async () => {
                    console.log(`🧪 Testing connection to http://127.0.0.1:${localPort}`)
                    try {
                      const response = await fetch(`http://127.0.0.1:${localPort}`)
                      console.log('✅ Fetch successful!', response.status, response.statusText)
                      alert(`✅ 连接成功！\n状态: ${response.status} ${response.statusText}\n\n这说明SSH隧道工作正常，但iframe加载有问题。`)
                    } catch (e: any) {
                      console.error('❌ Fetch failed:', e)
                      alert(`❌ 连接失败！\n错误: ${e.message}\n\n这说明SSH隧道或端口转发有问题。`)
                    }
                  }}
                  style={{ 
                    padding: '6px 16px', 
                    fontSize: 13,
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: 'var(--panel2)'
                  }}
                >
                  🧪 测试连接
                </button>
              </div>
            </div>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src={url}
          style={{
            position: 'absolute',
            top: '30px',  // 横幅高度
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: 'calc(100% - 30px)',
            border: 'none',
            background: '#fff',
            display: loadError ? 'none' : 'block'
          }}
          onLoad={() => {
            console.log('✅ iframe loaded successfully')
            console.log('💡 提示：如果看到 "Failed to launch" 警告，可以忽略，页面已正常加载')
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            setIsLoading(false)
            setLoadError(false)
            setLoadTimeout(false)
          }}
          onError={(e) => {
            console.error('❌ iframe load error:', e)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            setIsLoading(false)
            setLoadError(true)
          }}
        />
        
        {/* 超时显示 */}
        {loadTimeout && !loadError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            padding: 20,
            zIndex: 20
          }}>
            <div style={{ textAlign: 'center', maxWidth: 550 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>加载超时</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                页面加载时间超过15秒
              </div>
              
              <div style={{ textAlign: 'left', padding: 16, background: 'var(--panel2)', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>💡 建议操作：</div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
                  1. 点击"在浏览器中打开"直接测试连接<br/>
                  2. 检查远程主机上Web服务是否正常运行<br/>
                  3. 验证端口号是否正确（{remotePort}）<br/>
                  4. 某些Web应用启动较慢，可以等待后再刷新<br/>
                  5. 查看浏览器控制台是否有错误信息
                </div>
              </div>
              
              <div style={{ padding: 12, background: 'rgba(33, 150, 243, 0.1)', borderRadius: 6, fontSize: 12, marginBottom: 16, textAlign: 'left' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#2196F3' }}>🔗 连接信息</div>
                <div style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>
                  远程: {remoteHost}:{remotePort}<br/>
                  本地: 127.0.0.1:{localPort}<br/>
                  访问: <a 
                    href={`http://127.0.0.1:${localPort}`} 
                    onClick={(e) => {
                      e.preventDefault()
                      window.open(`http://127.0.0.1:${localPort}`, '_blank')
                    }}
                    style={{ color: '#2196F3', cursor: 'pointer' }}
                  >
                    http://127.0.0.1:{localPort}
                  </a>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={handleRefresh} style={{ padding: '8px 20px' }}>
                  🔄 继续等待并刷新
                </button>
                <button 
                  onClick={() => {
                    const win = window.open(`http://127.0.0.1:${localPort}`, '_blank')
                    if (win) {
                      console.log('🌐 Opened in browser')
                    }
                  }}
                  style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }}
                >
                  🌐 在浏览器中打开
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 错误显示 */}
        {loadError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            padding: 20
          }}>
            <div style={{ textAlign: 'center', maxWidth: 500 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>连接失败</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                无法连接到 {url}
              </div>
              
              <div style={{ textAlign: 'left', padding: 16, background: 'var(--panel2)', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>🔍 可能的原因：</div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
                  1. 远程主机上的Web服务未启动<br/>
                  2. 端口号错误（当前：{remotePort}）<br/>
                  3. Web服务地址错误（当前：{remoteHost}）<br/>
                  4. SSH隧道意外断开<br/>
                  5. 防火墙或安全组阻止了端口
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={handleRefresh} style={{ padding: '8px 20px' }}>
                  🔄 重新尝试
                </button>
                <button 
                  onClick={async () => {
                    console.log(`🧪 Testing connection to http://127.0.0.1:${localPort}`)
                    try {
                      const response = await fetch(`http://127.0.0.1:${localPort}`)
                      console.log('✅ Fetch successful!', response.status, response.statusText)
                      const text = await response.text()
                      console.log('Response preview:', text.substring(0, 200))
                      alert(`✅ 连接成功！\n状态: ${response.status} ${response.statusText}\n\n这说明SSH隧道工作正常！\n\n可能是iframe的sandbox限制导致无法加载，\n请点击"在浏览器中打开"使用。`)
                    } catch (e: any) {
                      console.error('❌ Fetch failed:', e)
                      alert(`❌ 连接失败！\n错误: ${e.message}\n\n请检查：\n1. SSH隧道是否断开\n2. 远程服务是否运行\n3. 端口号是否正确`)
                    }
                  }}
                  style={{ padding: '8px 20px' }}
                >
                  🧪 测试连接
                </button>
                <button 
                  onClick={() => window.open(`http://127.0.0.1:${localPort}`, '_blank')}
                  style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }}
                >
                  🌐 在浏览器中打开
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
