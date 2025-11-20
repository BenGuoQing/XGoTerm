import { useEffect, useState, useRef } from 'react'
import './App.css'
import TerminalTab from './components/TerminalTab'
import WebPreviewTab from './components/WebPreviewTab'
import FileBrowser from './components/FileBrowser'
import { StartSSH, StartLocalForward } from '../wailsjs/go/main/TermManager'
import Topbar from './components/Topbar'
import Sidebar, { HostItem } from './components/Sidebar'
import Modal from './components/Modal'
import Settings from './components/Settings'
import { SaveProfile, ListProfiles, GetProfile, ExportProfiles, ImportProfiles, Paths, DeleteProfile } from '../wailsjs/go/main/ProfilesManager'
import DockLayout, { LayoutData, TabData, BoxData } from 'rc-dock'
import "rc-dock/dist/rc-dock.css";

type SSHParams = {
  Host: string
  Port: number
  Username: string
  Password: string
  AuthType: string
  Cols: number
  Rows: number
}

function App() {
  const dockRef = useRef<DockLayout>(null)
  const [connectOpen, setConnectOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<HostItem | null>(null)
  const [webPreviewHost, setWebPreviewHost] = useState<HostItem | null>(null)
  const [remoteWebPort, setRemoteWebPort] = useState(8080)
  const [remoteWebHost, setRemoteWebHost] = useState('localhost')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showFileTransfer, setShowFileTransfer] = useState(false)
  const [hostName, setHostName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(22)
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('')
  const [tags, setTags] = useState('')
  const [authType, setAuthType] = useState<'password'|'key'>('password')
  const [keyPem, setKeyPem] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [keepAliveSec, setKeepAliveSec] = useState<number>(0)
  const [timeoutSec, setTimeoutSec] = useState<number>(10)
  const [cols, setCols] = useState<number>(120)
  const [rows, setRows] = useState<number>(30)
  const [showAdv, setShowAdv] = useState<boolean>(false)
  // ProxyJump
  const [useGateway, setUseGateway] = useState(false)
  const [gwHost, setGwHost] = useState('')
  const [gwPort, setGwPort] = useState<number>(22)
  const [gwUser, setGwUser] = useState('')
  const [gwAuth, setGwAuth] = useState<'password'|'key'>('password')
  const [gwPassword, setGwPassword] = useState('')
  const [gwKeyPem, setGwKeyPem] = useState('')
  const [gwPassphrase, setGwPassphrase] = useState('')
  // Tunnels (single rule - Local forward MVP)
  const [tunDir, setTunDir] = useState<'L'|'R'|'D'>('L')
  const [tunLHost, setTunLHost] = useState('127.0.0.1')
  const [tunLPort, setTunLPort] = useState<number>(0)
  const [tunRHost, setTunRHost] = useState('127.0.0.1')
  const [tunRPort, setTunRPort] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  type Session = { id: string; title: string }
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hosts, setHosts] = useState<HostItem[]>([])
  const [saveCfg, setSaveCfg] = useState<boolean>(true)

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('xgoterm_theme') as 'dark'|'light') || 'dark')
  useEffect(() => {
    localStorage.setItem('xgoterm_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Disable browser context menu globally (开发时可临时注释)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // 开发模式下允许右键（按住 Ctrl 键时）
      if (e.ctrlKey) return true
      e.preventDefault()
      return false
    }
    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  // Groups配置：强制显示tab栏和panel控制按钮
  const groups = {
    'terminal-sessions': {
      floatable: false,  // 禁止浮动窗口，避免连接断开
      maximizable: true,
      tabLocked: false,  // 允许在dock内拖动tab
      animated: false,
      panelExtra: (panelData: any, context: any) => {
        const isMaximized = panelData.parent?.mode === 'maximize'
        return (
          <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
            {/* 最大化/恢复按钮 */}
            <button
              onClick={() => {
                const dockLayout = context as any
                if (dockLayout && dockLayout.changeLayout) {
                  const currentLayout = dockLayout.getLayout()
                  // 简单切换：如果已最大化就恢复，否则最大化
                  if (isMaximized) {
                    // 恢复：移除maximize模式
                    dockLayout.changeLayout(currentLayout, 'restore')
                  } else {
                    // 最大化当前panel
                    dockLayout.dockMove(panelData, null, 'maximize')
                  }
                }
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: 12,
                color: 'var(--muted)',
                borderRadius: 3
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
              title={isMaximized ? "恢复分屏" : "最大化"}
            >
              {isMaximized ? '⊡' : '□'}
            </button>
            {/* 关闭分屏按钮（只在多panel时显示） */}
            {context.panelCount > 1 && (
              <button
                onClick={() => context.dockMove(panelData, null, 'remove')}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: 12,
                  color: 'var(--muted)',
                  borderRadius: 3
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel2)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
                title="关闭此分屏"
              >
                ✕
              </button>
            )}
          </div>
        )
      }
    }
  }

  // Initial Dock Layout
  const [layout] = useState<LayoutData>({
    dockbox: {
      mode: 'horizontal',
      children: [
        {
          id: 'main-panel',
          tabs: [
            {
              id: 'welcome-tab',
              title: '欢迎使用 XGoTerm',
              content: (
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 20,
                  color: 'var(--muted)'
                }}>
                  <h2 style={{ color: 'var(--accent)' }}>XGoTerm - SSH 终端工具</h2>
                  <p>← 双击左侧主机列表开始连接</p>
                  <p style={{ fontSize: 14 }}>支持多标签、拖拽分屏、命令广播等功能</p>
                </div>
              ),
              closable: true
            }
          ],
          group: 'terminal-sessions',
          minWidth: 100,
          minHeight: 100
        }
      ]
    }
  })

  // Load saved profiles into sidebar
  async function loadProfiles() {
    try {
      const list = await ListProfiles()
      const mapped: HostItem[] = (list as any[]).map((p: any) => ({ 
        id: p.id, 
        name: p.name || p.host, 
        host: p.host, 
        port: p.port, 
        username: p.username,
        tags: p.tags || []
      }))
      setHosts(mapped)
    } catch { /* ignore until backend ready */ }
  }
  useEffect(() => { loadProfiles() }, [])

  // 强制阻止浮动窗口
  useEffect(() => {
    const checkAndCloseFloatBoxes = () => {
      if (dockRef.current) {
        const currentLayout = dockRef.current.getLayout()
        if ((currentLayout as any).floatbox?.children?.length > 0) {
          console.warn('🚫 Detected float box, forcing close...')
          // 移除所有floatbox中的tabs，移回dockbox
          const floatTabs = (currentLayout as any).floatbox.children.flatMap((fb: any) => 
            fb.tabs || []
          )
          floatTabs.forEach((tab: any) => {
            const firstPanel = currentLayout.dockbox?.children?.[0]
            if (firstPanel) {
              dockRef.current?.dockMove(tab, (firstPanel as any).id, 'middle')
            }
          })
        }
      }
    }
    
    // 定期检查（每500ms）
    const interval = setInterval(checkAndCloseFloatBoxes, 500)
    return () => clearInterval(interval)
  }, [])

  async function connect(overrideParams?: any) {
    setConnecting(true)
    setError(null)
    try {
      let p: SSHParams;
      if (overrideParams) {
        p = overrideParams;
      } else {
        p = {
            Host: host,
            Port: Number(port) || 22,
            Username: username,
            Password: password,
            AuthType: authType,
            Cols: 0, 
            Rows: 0,
        } as any;
        (p as any).KeyPEM = keyPem;
        (p as any).Passphrase = passphrase;
        (p as any).KeepAliveSec = keepAliveSec;
        (p as any).TimeoutSec = timeoutSec;
        (p as any).GatewayHost = useGateway ? gwHost : '';
        (p as any).GatewayPort = useGateway ? gwPort : 0;
        (p as any).GatewayUser = useGateway ? gwUser : '';
        (p as any).GatewayAuth = useGateway ? gwAuth : '';
        (p as any).GatewayPassword = useGateway ? gwPassword : '';
        (p as any).GatewayKeyPEM = useGateway ? gwKeyPem : '';
        (p as any).GatewayPassphrase = useGateway ? gwPassphrase : '';
      }
      
      const id = await StartSSH(p as any)
      const title = `${p.Username}@${p.Host}:${p.Port}`
      console.log('✅ SSH Session created:', id, title)
      const s = { id, title }
      setSessions((prev) => [...prev, s])
      setActiveId(id)
      setConnectOpen(false)
      
      // Add to Dock
      if (dockRef.current) {
        const tab: TabData = {
            id: id,
            title: title,  // 简单的字符串，不需要手动添加关闭按钮
            content: (
                <TerminalTab 
                    sessionId={id} 
                    theme={theme} 
                    active={true}
                    onFocus={() => setActiveId(id)}
                />
            ),
            closable: true,
            cached: true,  // 缓存Tab内容，切换时不销毁
            group: 'terminal-sessions'  // 确保使用正确的group配置
        }
        
        try {
          const currentLayout = dockRef.current.getLayout()
          const firstPanel = currentLayout.dockbox?.children?.[0]
          
          if (firstPanel) {
            dockRef.current.dockMove(tab, (firstPanel as any).id, 'middle')
            console.log('✅ Tab added to dock:', tab.id)
          } else {
            console.error('❌ No panel found in dock')
          }
        } catch (err) {
          console.error('❌ Error adding tab to dock:', err)
        }
      } else {
        console.error('❌ dockRef is null!')
      }

      // save as profile if checked (or in edit mode) AND we are not using overrideParams (meaning manual connect)
      if ((saveCfg || editingHost) && !overrideParams) {
        try {
          // 如果是编辑模式，使用editingHost的id；否则查找现有主机
          let profileId = editingHost ? editingHost.id : ''
          if (!profileId) {
            const existing = hosts.find(h => h.host === host && h.port === (Number(port)||22) && h.username === username)
            profileId = existing ? existing.id : ''
          }
          
          const profile: any = {
            id: profileId,
            name: hostName || host,
            host,
            port: Number(port) || 22,
            username,
            auth: { type: authType, password, key_pem: keyPem, passphrase },
            keepAliveSec,
            timeoutSec,
            cols,
            rows,
            gatewayHost: useGateway ? gwHost : '',
            gatewayPort: useGateway ? gwPort : 0,
            gatewayUser: useGateway ? gwUser : '',
            gatewayAuth: useGateway ? gwAuth : '',
            gatewayPassword: useGateway ? gwPassword : '',
            gatewayKeyPEM: useGateway ? gwKeyPem : '',
            gatewayPassphrase: useGateway ? gwPassphrase : '',
            tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [],
          }
          await SaveProfile(profile)
          await loadProfiles()
          setEditingHost(null) // 清除编辑状态
        } catch (e) { /* ignore save failure for now */ }
      }
      
      // start one local forward if configured
      if (tunDir === 'L' && tunLPort > 0 && tunRPort > 0 && !overrideParams) {
        try { await StartLocalForward(id, tunLHost || '127.0.0.1', Number(tunLPort), tunRHost || '127.0.0.1', Number(tunRPort)) } catch {}
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      setError(errorMsg)
      
      // 分析错误并给出具体建议
      let suggestion = ''
      if (errorMsg.includes('unable to authenticate')) {
        suggestion = '\n\n💡 可能的原因：\n'
        if (useGateway) {
          suggestion += '1. 跳板机的用户名或密码错误\n'
          suggestion += '2. 目标主机的用户名或密码错误\n'
          suggestion += '3. 服务器禁用了密码认证，需要使用私钥\n'
          suggestion += '\n请检查：\n'
          suggestion += `- 跳板机: ${gwUser}@${gwHost}:${gwPort}\n`
          suggestion += `- 目标主机: ${username}@${host}:${port}`
        } else {
          suggestion += '1. 用户名或密码错误\n'
          suggestion += '2. 服务器禁用了密码认证，需要使用私钥\n'
          suggestion += '3. 用户账号被锁定或不存在'
        }
      } else if (errorMsg.includes('禁止了端口转发') || errorMsg.includes('administratively prohibited')) {
        suggestion = '\n\n🔧 跳板机禁止了端口转发功能\n\n'
        suggestion += '📋 临时解决方案（两步连接）：\n'
        suggestion += `1. 先连接到跳板机: ${gwUser}@${gwHost}\n`
        suggestion += `2. 在跳板机终端中执行: ssh ${username}@${host}\n\n`
        suggestion += '🛠️ 永久解决方案（需要管理员）：\n'
        suggestion += '让管理员在跳板机修改 /etc/ssh/sshd_config：\n'
        suggestion += '  AllowTcpForwarding yes\n'
        suggestion += '  PermitOpen any\n'
        suggestion += '然后重启SSH服务: sudo systemctl restart sshd'
      } else if (errorMsg.includes('connection refused')) {
        suggestion = '\n\n💡 连接被拒绝，请检查：\n'
        suggestion += '1. 目标主机IP和端口是否正确\n'
        suggestion += '2. 目标主机SSH服务是否启动\n'
        suggestion += '3. 防火墙是否开放SSH端口'
      } else if (errorMsg.includes('timeout') || errorMsg.includes('i/o timeout')) {
        suggestion = '\n\n💡 连接超时，请检查：\n'
        suggestion += '1. 网络是否通畅\n'
        suggestion += '2. 目标主机是否在线\n'
        suggestion += '3. 防火墙是否阻止了连接'
      }
      
      alert('❌ 连接失败：' + errorMsg + suggestion)
    } finally {
      setConnecting(false)
    }
  }

  async function editHost(h: HostItem) {
    console.log('✏️ Editing host:', h.name || h.host)
    setEditingHost(h)
    
    try {
      const p: any = await GetProfile(h.id)
      
      if (!p || !p.host || !p.username) {
        alert('配置加载失败或配置不完整')
        return
      }
      
      // 填充表单
      setHostName(p.name || '')
      setHost(p.host || '')
      setPort(p.port || 22)
      setUsername(p.username || 'root')
      setAuthType((p.auth?.type || 'password') as any)
      setPassword(p.auth?.password || '')
      setKeyPem(p.auth?.key_pem || '')
      setPassphrase(p.auth?.passphrase || '')
      setKeepAliveSec(p.keepAliveSec || 0)
      setTimeoutSec(p.timeoutSec || 10)
      setCols(p.cols || 120)
      setRows(p.rows || 30)
      setUseGateway(!!p.gatewayHost)
      setGwHost(p.gatewayHost || '')
      setGwPort(p.gatewayPort || 22)
      setGwUser(p.gatewayUser || '')
      setGwAuth((p.gatewayAuth || 'password') as any)
      setGwPassword(p.gatewayPassword || '')
      setGwKeyPem(p.gatewayKeyPEM || '')
      setGwPassphrase(p.gatewayPassphrase || '')
      setTags((p.tags || []).join(', '))
      
      // 打开对话框
      setConnectOpen(true)
      setSaveCfg(true)
    } catch (e: any) {
      console.error('❌ Failed to load host config:', e?.message || e)
      alert('加载配置失败：' + (e?.message || String(e)))
    }
  }

  async function cloneHost(h: HostItem) {
    console.log('📋 Cloning host:', h.name || h.host)
    setEditingHost(null) // 清除编辑状态，这样会创建新主机
    
    try {
      const p: any = await GetProfile(h.id)
      
      if (!p || !p.host || !p.username) {
        alert('配置加载失败或配置不完整')
        return
      }
      
      // 填充表单，名称加上"副本"标识
      setHostName((p.name || p.host) + ' - 副本')
      setHost(p.host || '')
      setPort(p.port || 22)
      setUsername(p.username || 'root')
      setAuthType((p.auth?.type || 'password') as any)
      setPassword(p.auth?.password || '')
      setKeyPem(p.auth?.key_pem || '')
      setPassphrase(p.auth?.passphrase || '')
      setKeepAliveSec(p.keepAliveSec || 0)
      setTimeoutSec(p.timeoutSec || 10)
      setCols(p.cols || 120)
      setRows(p.rows || 30)
      setUseGateway(!!p.gatewayHost)
      setGwHost(p.gatewayHost || '')
      setGwPort(p.gatewayPort || 22)
      setGwUser(p.gatewayUser || '')
      setGwAuth((p.gatewayAuth || 'password') as any)
      setGwPassword(p.gatewayPassword || '')
      setGwKeyPem(p.gatewayKeyPEM || '')
      setGwPassphrase(p.gatewayPassphrase || '')
      setTags((p.tags || []).join(', '))
      
      // 打开对话框
      setConnectOpen(true)
      setSaveCfg(true)
      
      console.log('✅ 主机配置已复制，请修改后保存')
    } catch (e: any) {
      console.error('❌ Failed to clone host config:', e?.message || e)
      alert('复制主机失败：' + (e?.message || String(e)))
    }
  }

  async function connectFromSidebar(h: HostItem) {
    console.log('🔌 Connecting to:', h.name || h.host)
    
    try {
      const p: any = await GetProfile(h.id)
      
      if (!p || !p.host || !p.username) {
        alert('配置加载失败或配置不完整')
        return
      }
      // Update state so modal reflects this if opened later
      setHostName(p.name || '')
      setHost(p.host || ''); 
      setPort(p.port || 22); 
      setUsername(p.username || 'root')
      setAuthType((p.auth?.type || 'password') as any)
      setPassword(p.auth?.password || '')
      setKeyPem(p.auth?.key_pem || '')
      setPassphrase(p.auth?.passphrase || '')
      setKeepAliveSec(p.keepAliveSec || 0)
      setTimeoutSec(p.timeoutSec || 10)
      setCols(p.cols || 120)
      setRows(p.rows || 30)
      setUseGateway(!!p.gatewayHost)
      setGwHost(p.gatewayHost || '')
      setGwPort(p.gatewayPort || 22)
      setGwUser(p.gatewayUser || '')
      setGwAuth((p.gatewayAuth || 'password') as any)
      setGwPassword(p.gatewayPassword || '')
      setGwKeyPem(p.gatewayKeyPEM || '')
      setGwPassphrase(p.gatewayPassphrase || '')
      setTags((p.tags || []).join(', '))
      
      const params = {
        Host: p.host,
        Port: p.port,
        Username: p.username,
        Password: p.auth?.password || '',
        AuthType: p.auth?.type || 'password',
        Cols: 0, Rows: 0,
        KeyPEM: p.auth?.key_pem || '',
        Passphrase: p.auth?.passphrase || '',
        KeepAliveSec: p.keepAliveSec || 0,
        TimeoutSec: p.timeoutSec || 10,
        GatewayHost: p.gatewayHost || '',
        GatewayPort: p.gatewayPort || 22,
        GatewayUser: p.gatewayUser || '',
        GatewayAuth: p.gatewayAuth || 'password',
        GatewayPassword: p.gatewayPassword || '',
        GatewayKeyPEM: p.gatewayKeyPEM || '',
        GatewayPassphrase: p.gatewayPassphrase || '',
      }
      await connect(params)
    } catch (e: any) {
      console.error('❌ Connection failed:', e?.message || e)
      const errorMsg = '连接失败：' + (e?.message || String(e))
      alert(errorMsg)
      setError(errorMsg)
    }
  }

  async function handleWebPreview(h: HostItem) {
    console.log('🌐 Opening Web Preview for:', h.name || h.host)
    setWebPreviewHost(h)
    // 自动设置为当前主机的地址
    setRemoteWebHost('localhost')  // 默认localhost，因为是在远程主机上访问本地服务
    setRemoteWebPort(8080)  // 重置为默认端口
  }

  async function confirmWebPreview() {
    if (!webPreviewHost) return
    
    // 验证：如果用户填写了主机自己的IP，给出警告
    if (remoteWebHost === webPreviewHost.host) {
      const confirm = window.confirm(
        `⚠️ 警告：\n\n` +
        `您输入的地址是 "${remoteWebHost}"，这是远程主机的外网IP！\n\n` +
        `通常情况下，您应该填写 "localhost" 或 "127.0.0.1"。\n\n` +
        `使用外网IP可能导致连接失败或被防火墙阻止。\n\n` +
        `是否继续？`
      )
      if (!confirm) return
    }
    
    setConnecting(true)
    try {
      const p: any = await GetProfile(webPreviewHost.id)
      
      if (!p || !p.host || !p.username) {
        alert('配置加载失败或配置不完整')
        return
      }
      
      // 构建SSH参数
      const params = {
        Host: p.host,
        Port: p.port,
        Username: p.username,
        Password: p.auth?.password || '',
        AuthType: p.auth?.type || 'password',
        Cols: 0, Rows: 0,
        KeyPEM: p.auth?.key_pem || '',
        Passphrase: p.auth?.passphrase || '',
        KeepAliveSec: p.keepAliveSec || 0,
        TimeoutSec: p.timeoutSec || 10,
        GatewayHost: p.gatewayHost || '',
        GatewayPort: p.gatewayPort || 22,
        GatewayUser: p.gatewayUser || '',
        GatewayAuth: p.gatewayAuth || 'password',
        GatewayPassword: p.gatewayPassword || '',
        GatewayKeyPEM: p.gatewayKeyPEM || '',
        GatewayPassphrase: p.gatewayPassphrase || '',
      }
      
      console.log('🔒 Starting SSH connection for tunnel...')
      const sessionId = await StartSSH(params as any)
      console.log('✅ SSH Session created:', sessionId)
      
      // 生成随机本地端口（避免冲突）
      const localPort = 10000 + Math.floor(Math.random() * 10000)
      
      console.log(`🔌 Starting Web Proxy (via SSH command):`)
      console.log(`   [你的电脑] localhost:${localPort}`)
      console.log(`        ↓ (SSH执行curl命令)`)
      console.log(`   [远程主机 ${p.host}] ${remoteWebHost}:${remoteWebPort}`)
      console.log(`   💡 注意：使用curl命令代理，不需要SSH端口转发权限`)
      
      // Try WebProxy first (no port forwarding permission needed)
      try {
        const { StartWebProxyViaSSH } = await import('../wailsjs/go/main/TermManager')
        await StartWebProxyViaSSH(sessionId, localPort, remoteWebHost, remoteWebPort)
        console.log(`   ✅ Web Proxy已启动`)
      } catch (e) {
        console.log(`   ⚠️ Web Proxy不可用，尝试传统端口转发...`)
        await StartLocalForward(sessionId, '127.0.0.1', localPort, remoteWebHost, remoteWebPort)
      }
      
      // 等待端口转发完全建立（给SSH隧道一些时间）
      console.log('⏳ Waiting for tunnel to stabilize...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // 添加Web预览Tab到dock
      if (dockRef.current) {
        const tabId = `web-${sessionId}-${Date.now()}`
        const title = `🌐 ${webPreviewHost.name || webPreviewHost.host}:${remoteWebPort}`
        
        const tab: TabData = {
          id: tabId,
          title: title,
          content: (
            <WebPreviewTab 
              localPort={localPort}
              remoteHost={remoteWebHost}
              remotePort={remoteWebPort}
              title={title}
            />
          ),
          closable: true,
          cached: true,
          group: 'terminal-sessions'
        }
        
        const currentLayout = dockRef.current.getLayout()
        const firstPanel = currentLayout.dockbox?.children?.[0]
        
        if (firstPanel) {
          dockRef.current.dockMove(tab, (firstPanel as any).id, 'middle')
          console.log('✅ Web Preview tab added to dock:', tabId)
        }
      }
      
      setWebPreviewHost(null)
      
      // 不再显示alert，直接在控制台输出
      console.log(`✅ SSH隧道已建立！现在可以访问远程服务了`)
      console.log(`   📍 远程服务地址: ${p.host}上的${remoteWebHost}:${remoteWebPort}`)
      console.log(`   🔗 本地访问地址: http://localhost:${localPort}`)
      console.log(`   💡 原理: 访问本地${localPort}端口 = 通过SSH访问远程${remoteWebHost}:${remoteWebPort}`)
      console.log(`   ℹ️  如果看到 "Failed to launch" 警告，那是WebView2的已知提示，可以忽略`)
    } catch (e: any) {
      console.error('❌ Web Preview failed:', e?.message || e)
      alert('创建Web预览失败：' + (e?.message || String(e)))
    } finally {
      setConnecting(false)
    }
  }

  function closeTab(id: string) {
    console.log('🗑️ Closing session:', id)
    // close backend session
    import('../wailsjs/go/main/TermManager').then(({ Close }) => {
      Close(id).catch(() => {})
    })
    // remove from sessions list
    setSessions((prev) => prev.filter((s) => s.id !== id))
    // if this was active, clear it
    if (activeId === id) {
      setActiveId(null)
    }
  }
  
  // Handle layout changes to detect tab closes and prevent float boxes
  function handleLayoutChange(newLayout: LayoutData) {
    // 检测并阻止浮动窗口
    if ((newLayout as any).floatbox && (newLayout as any).floatbox.children?.length > 0) {
      console.warn('⚠️ Float box detected, preventing...')
      // 不应用包含floatbox的layout变更
      return
    }
    
    const currentTabIds = new Set<string>()
    const collectTabIds = (box: any) => {
      if (box?.tabs) box.tabs.forEach((tab: any) => currentTabIds.add(tab.id))
      if (box?.children) box.children.forEach((child: any) => collectTabIds(child))
    }
    collectTabIds(newLayout.dockbox)
    
    // Close sessions that are no longer in the layout
    sessions.forEach(s => {
      if (!currentTabIds.has(s.id)) closeTab(s.id)
    })
  }

  const [broadcast, setBroadcast] = useState('')
  const [toAll, setToAll] = useState(true)
  const [recording, setRecording] = useState<Record<string, boolean>>({})
  const [withLineNumbers, setWithLineNumbers] = useState(false)

  async function sendBroadcast() {
    const text = broadcast
    if (!text) return
    const targets = toAll ? sessions.map((s) => s.id) : activeId ? [activeId] : []
    for (const id of targets) {
      // import at top would create circular deps, call dynamically
      const { Send } = await import('../wailsjs/go/main/TermManager')
      await Send(id, text + '\r')
    }
    setBroadcast('')
  }

  async function toggleRecording() {
    if (!activeId) return
    const isOn = !!recording[activeId]
    if (isOn) {
      const { StopRecording } = await import('../wailsjs/go/main/TermManager')
      await StopRecording(activeId)
      setRecording((r) => ({ ...r, [activeId]: false }))
    } else {
      const { StartRecording } = await import('../wailsjs/go/main/TermManager')
      await StartRecording(activeId, '', withLineNumbers)
      setRecording((r) => ({ ...r, [activeId]: true }))
    }
  }

  const isRec = !!(activeId && recording[activeId])
  async function doExport() {
    try {
      const p = await Paths() as any
      const def = `${p.exports}\\xgoterm_${Date.now()}.xgth`
      const pass = window.prompt('设置导出口令（必填）') || ''
      if (!pass) return
      const out = window.prompt('导出路径（.xgth）', def) || ''
      if (!out) return
      await ExportProfiles(out, pass)
      alert('导出完成\n' + out)
    } catch (e:any) { alert('导出失败: ' + (e?.message||e)) }
  }

  async function doImport() {
    try {
      const file = window.prompt('要导入的 .xgth 文件完整路径') || ''
      if (!file) return
      const pass = window.prompt('导入口令（创建导出文件时设置的）') || ''
      if (!pass) return
      const added = await ImportProfiles(file, pass)
      await loadProfiles()
      alert(`导入完成，新增 ${added} 条`)
    } catch (e:any) { alert('导入失败: ' + (e?.message||e)) }
  }

  function toggleDevTools() {
    console.log('=== 开发者工具按钮被点击 ===')
    console.log('请使用以下方式打开开发者工具：')
    console.log('1. 按 F12 键')
    console.log('2. 按 Ctrl + Shift + I')
    console.log('3. 按 Ctrl + Shift + J')
    console.log('4. 按住 Ctrl 键，然后右键点击页面')
    console.log('\n如果您能看到这条消息，说明开发者工具已经打开了！')
    
    // 触发调试器断点（如果开发者工具未开，会强制打开）
    try {
      // eslint-disable-next-line no-debugger
      debugger
    } catch (e) {
      // ignore
    }
    
    alert('🛠️ 开发者工具\n\n请使用以下方式打开：\n\n1. 按 F12 键\n2. 按 Ctrl + Shift + I\n3. 按 Ctrl + Shift + J\n4. 按住 Ctrl，然后右键点击\n\n提示：点击确定后，\n如果开发者工具未开，\n会自动触发调试断点。')
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar
        connectOpen={connectOpen}
        onToggleConnect={() => setConnectOpen(v => !v)}
        onToggleRecording={() => toggleRecording()}
        recording={isRec}
        onImport={doImport}
        onExport={doExport}
        onSettings={() => setSettingsOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
        onToggleDevTools={toggleDevTools}
        onToggleFileTransfer={() => setShowFileTransfer(v => !v)}
      />

      <Modal open={connectOpen} title={editingHost ? "✏️ 编辑主机" : "⚡ 新建连接"} onClose={() => { setConnectOpen(false); setEditingHost(null); }} width={860}
        footer={(
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            {!editingHost && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={saveCfg} onChange={(e) => setSaveCfg(e.target.checked)} /> 保存为连接配置
              </label>
            )}
            {editingHost && (
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>📝 编辑模式：修改将保存到配置</span>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConnectOpen(false); setEditingHost(null); }}>取消</button>
              <button onClick={() => connect()} disabled={connecting || !host || !username}>
                {connecting ? '连接中...' : (editingHost ? '保存并连接' : '连接')}
              </button>
            </div>
          </div>
        )}
      >
        <div className="grid4" style={{ gap: 12 }}>
          <label style={{ gridColumn: 'span 2' }}>
            主机名（显示名称）
            <input value={hostName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHostName(e.target.value)} placeholder="例如：生产服务器" />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            分组标签（用逗号分隔）
            <input value={tags} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTags(e.target.value)} placeholder="例如：生产,数据库,北京" />
          </label>
        </div>
        <div className="grid4" style={{ gap: 12, marginTop: 8 }}>
          <label>
            Host
            <input value={host} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHost(e.target.value)} placeholder="10.0.0.1" />
          </label>
          <label>
            Port
            <input type="number" value={port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPort(parseInt(e.target.value || '22'))} />
          </label>
          <label>
            Username
            <input value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} />
          </label>
          <label>
            Auth
            <select value={authType} onChange={(e) => setAuthType(e.target.value as any)}>
              <option value="password">Password</option>
              <option value="key">Private Key</option>
            </select>
          </label>
        </div>
        {authType === 'password' ? (
          <div className="grid4" style={{ gap: 12, marginTop: 8 }}>
            <label>
              Password
              <input type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="grid4" style={{ gap: 12, marginTop: 8 }}>
            <label style={{ gridColumn: 'span 3' }}>
              Private Key (PEM)
              <textarea value={keyPem} onChange={(e) => setKeyPem(e.target.value)} rows={6} style={{ width: '100%', resize: 'vertical', padding: 8 }} />
            </label>
            <label>
              Passphrase
              <input type="password" value={passphrase} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassphrase(e.target.value)} />
            </label>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowAdv(v => !v)}>{showAdv ? '隐藏高级设置' : '高级设置'}</button>
        </div>
        {showAdv && (
          <div className="grid4" style={{ gap: 12, marginTop: 8 }}>
            <label>
              KeepAlive(s)
              <input type="number" value={keepAliveSec} onChange={(e) => setKeepAliveSec(parseInt(e.target.value || '0'))} />
            </label>
            <label>
              Timeout(s)
              <input type="number" value={timeoutSec} onChange={(e) => setTimeoutSec(parseInt(e.target.value || '10'))} />
            </label>
            <label>
              Cols
              <input type="number" value={cols} onChange={(e) => setCols(parseInt(e.target.value || '120'))} />
            </label>
            <label>
              Rows
              <input type="number" value={rows} onChange={(e) => setRows(parseInt(e.target.value || '30'))} />
            </label>
          </div>
        )}
        {showAdv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {/* 跳板机开关 */}
            <div style={{ 
              padding: '12px 16px', 
              background: 'var(--panel2)', 
              borderRadius: 8,
              border: '1px solid var(--border)'
            }}>
              <label style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                cursor: 'pointer',
                gap: 12,
                marginBottom: 0
              }}>
                <input 
                  type="checkbox" 
                  checked={useGateway} 
                  onChange={(e) => setUseGateway(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    🚀 使用跳板机 (ProxyJump)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    目标主机无法直接访问时，通过跳板机中转连接
                  </div>
                </div>
              </label>
            </div>

            {/* 连接流程图示 */}
            {useGateway && (
              <>
                <div style={{ 
                  padding: '12px 16px', 
                  background: 'rgba(122, 162, 247, 0.1)', 
                  borderRadius: 8,
                  border: '1px solid rgba(122, 162, 247, 0.3)',
                  fontSize: 13,
                  fontFamily: 'monospace'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>📡 连接路径：</div>
                  <div style={{ lineHeight: 1.8, color: 'var(--text)' }}>
                    [你的电脑] → [跳板机 {gwHost || '???'}] → [目标主机 {host || '???'}]
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                    ✓ 先连接跳板机验证身份 → 再通过跳板机连接目标主机
                  </div>
                </div>
                
                {/* 使用场景说明 */}
                <div style={{ 
                  padding: '12px 16px', 
                  background: 'rgba(255, 193, 7, 0.1)', 
                  borderRadius: 8,
                  border: '1px solid rgba(255, 193, 7, 0.3)',
                  fontSize: 12
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: '#ffc107' }}>💡 典型使用场景：</div>
                  <div style={{ color: 'var(--text)', lineHeight: 1.6 }}>
                    <strong>场景1：</strong> 生产环境服务器只能通过跳板机访问<br/>
                    <code style={{ fontSize: 11, background: 'var(--panel)', padding: '2px 4px', borderRadius: 2 }}>
                      跳板机: jump.company.com → 目标: 10.0.1.100
                    </code>
                    <br/><br/>
                    <strong>场景2：</strong> 内网服务器需要通过公网跳板机中转<br/>
                    <code style={{ fontSize: 11, background: 'var(--panel)', padding: '2px 4px', borderRadius: 2 }}>
                      跳板机: public.server.com → 目标: 192.168.1.100
                    </code>
                  </div>
                </div>
              </>
            )}

            {/* 跳板机配置表单 */}
            {useGateway && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>跳板机配置</div>
                <div className="grid4" style={{ gap: 12 }}>
                  <label>
                    跳板机地址
                    <input placeholder="jump.example.com" value={gwHost} onChange={(e)=>setGwHost(e.target.value)} />
                  </label>
                  <label>
                    端口
                    <input type="number" placeholder="22" value={gwPort} onChange={(e)=>setGwPort(parseInt(e.target.value||'22'))} />
                  </label>
                  <label>
                    用户名
                    <input placeholder="root" value={gwUser} onChange={(e)=>setGwUser(e.target.value)} />
                  </label>
                  <label>
                    认证方式
                    <select value={gwAuth} onChange={(e)=>setGwAuth(e.target.value as any)}>
                      <option value="password">密码</option>
                      <option value="key">私钥</option>
                    </select>
                  </label>
                </div>
                {gwAuth === 'password' ? (
                  <div className="grid4" style={{ gap:12 }}>
                    <label>
                      跳板机密码
                      <input type="password" value={gwPassword} onChange={(e)=>setGwPassword(e.target.value)} />
                    </label>
                  </div>
                ) : (
                  <div className="grid4" style={{ gap:12 }}>
                    <label style={{ gridColumn: 'span 3' }}>
                      跳板机私钥 (PEM)
                      <textarea rows={4} value={gwKeyPem} onChange={(e)=>setGwKeyPem(e.target.value)} style={{ width:'100%', resize:'vertical', padding:8 }} />
                    </label>
                    <label>
                      私钥密码（可选）
                      <input type="password" value={gwPassphrase} onChange={(e)=>setGwPassphrase(e.target.value)} />
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {showAdv && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div style={{ opacity: .8 }}>端口转发 / Tunnels（L/R/D）</div>
            <div className="grid4" style={{ gap: 12 }}>
              <label>
                Direction
                <select value={tunDir} onChange={(e)=>setTunDir(e.target.value as any)}>
                  <option value="L">Local (L)</option>
                  <option value="R">Remote (R)</option>
                  <option value="D">Dynamic (D)</option>
                </select>
              </label>
              <label>
                Local Host
                <input placeholder="127.0.0.1" value={tunLHost} onChange={(e)=>setTunLHost(e.target.value)} />
              </label>
              <label>
                Local Port
                <input type="number" placeholder="0" value={tunLPort} onChange={(e)=>setTunLPort(parseInt(e.target.value||'0'))} />
              </label>
              <label>
                Remote Host
                <input placeholder="127.0.0.1" value={tunRHost} onChange={(e)=>setTunRHost(e.target.value)} />
              </label>
              <label>
                Remote Port
                <input type="number" placeholder="0" value={tunRPort} onChange={(e)=>setTunRPort(parseInt(e.target.value||'0'))} />
              </label>
            </div>
            <div>
              <button disabled>添加规则（即将支持）</button>
            </div>
          </div>
        )}
        {error && <div style={{ color: 'salmon', marginTop: 10 }}>{error}</div>}
      </Modal>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左边栏容器 */}
        <div style={{ 
          display: 'flex',
          width: sidebarCollapsed ? '40px' : '260px',
          transition: 'width 0.3s ease',
          position: 'relative',
          borderRight: '2px solid var(--border)',
          boxShadow: '2px 0 4px rgba(0,0,0,0.1)'
        }}>
          {/* 折叠按钮 */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              position: 'absolute',
              right: -12,
              top: 10,
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              fontSize: 12
            }}
            title={sidebarCollapsed ? '展开' : '折叠'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
          
          {!sidebarCollapsed && (
            <Sidebar 
              hosts={hosts} 
              onConnect={connectFromSidebar} 
              onDelete={async (id) => { try { await DeleteProfile(id); await loadProfiles(); } catch (e:any) { alert('删除失败: ' + (e?.message||e)) } }} 
              onEdit={editHost}
              onClone={cloneHost}
              onWebPreview={handleWebPreview}
            />
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <div className="dock-wrap" style={{ flex: 1, position: 'relative' }}>
                <DockLayout
                    ref={dockRef}
                    defaultLayout={layout}
                    groups={groups}
                    onLayoutChange={handleLayoutChange}
                    style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
                />
            </div>
        </div>
      </div>

      <div className="bottombar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontWeight: 500 }}>📡 广播命令:</span>
          <input 
            style={{ flex: 1, maxWidth: 600, fontFamily: 'monospace' }} 
            value={broadcast} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBroadcast(e.target.value)} 
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') sendBroadcast() }} 
            placeholder={toAll ? '发送到所有会话...' : '发送到当前会话...'} 
          />
          <button onClick={sendBroadcast} disabled={sessions.length === 0}>发送</button>
          
          <label style={{ flexDirection: 'row', alignItems: 'center', cursor: 'pointer', marginLeft: 12 }}>
            <input type="checkbox" style={{ height: 14, width: 14 }} checked={toAll} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToAll(e.target.checked)} />
            <span>所有会话</span>
          </label>
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        <label style={{ flexDirection: 'row', alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" style={{ height: 14, width: 14 }} checked={withLineNumbers} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWithLineNumbers(e.target.checked)} />
          <span>行号</span>
        </label>
        
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          {activeId ? (
            recording[activeId] ? (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: 'var(--danger)', animation: 'pulse 1s infinite' }}/> 录制中
              </span>
            ) : <span style={{ opacity: 0.5 }}>未录制</span>
          ) : null}
        </div>
      </div>

      {/* 设置对话框 */}
      <Settings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Web预览配置对话框 */}
      <Modal 
        open={!!webPreviewHost} 
        title={`🌐 Web预览 - ${webPreviewHost?.name || webPreviewHost?.host}`}
        onClose={() => setWebPreviewHost(null)}
        width={500}
        footer={(
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button onClick={() => setWebPreviewHost(null)}>取消</button>
            <button 
              onClick={confirmWebPreview} 
              disabled={connecting || !remoteWebPort}
              style={{ background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }}
            >
              {connecting ? '建立隧道中...' : '启动Web预览'}
            </button>
          </div>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 12, background: 'rgba(33, 150, 243, 0.1)', borderRadius: 6, fontSize: 14, border: '1px solid rgba(33, 150, 243, 0.3)' }}>
            <div style={{ marginBottom: 6, fontWeight: 500, color: '#2196F3' }}>🎯 目标主机</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {webPreviewHost?.name || webPreviewHost?.host}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              将通过SSH连接到此主机，并转发Web端口
            </div>
          </div>

          <div style={{ padding: 12, background: 'var(--panel2)', borderRadius: 6, fontSize: 14 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>💡 SSH隧道原理：</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.8, fontFamily: 'monospace', fontSize: 13 }}>
              [你的电脑] localhost:随机端口<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;↓ (SSH加密隧道)<br/>
              [远程主机 {webPreviewHost?.host}]<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
              &nbsp;&nbsp;访问该主机上的 localhost:端口
            </div>
            <div style={{ color: 'var(--text)', marginTop: 8, fontSize: 13 }}>
              ✅ 你在本地浏览器访问本地端口，实际访问的是远程主机上的服务
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Web服务地址（在远程主机上）</div>
              <input 
                type="text"
                value={remoteWebHost}
                onChange={(e) => setRemoteWebHost(e.target.value)}
                placeholder="localhost"
                style={{ 
                  width: '100%',
                  borderColor: webPreviewHost && remoteWebHost === webPreviewHost.host ? '#ff5722' : undefined
                }}
              />
              <div style={{ fontSize: 12, marginTop: 4, padding: 8, background: 'rgba(255, 152, 0, 0.1)', borderRadius: 4, border: '1px solid rgba(255, 152, 0, 0.3)' }}>
                ⚠️ <strong>重要说明：</strong><br/>
                这个地址是<strong>站在远程主机{webPreviewHost?.host}的角度</strong>看的：<br/>
                <br/>
                • <code style={{padding: '2px 4px', background: 'var(--panel)', borderRadius: 2}}>localhost</code> = 远程主机{webPreviewHost?.host}<strong>自己</strong>的服务<br/>
                • <code style={{padding: '2px 4px', background: 'var(--panel)', borderRadius: 2}}>10.x.x.x</code> = 远程主机能访问的<strong>其他内网</strong>机器<br/>
                • <strong style={{color: '#ff5722'}}>❌ 不要填 {webPreviewHost?.host}</strong>（那是它自己的外网IP，会被防火墙阻止）
              </div>
            </label>

            <label>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>远程Web端口</div>
              <input 
                type="number"
                value={remoteWebPort}
                onChange={(e) => setRemoteWebPort(parseInt(e.target.value) || 8080)}
                placeholder="8080"
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                远程主机上运行的Web服务端口（如8080, 3000, 9000等）
              </div>
            </label>
          </div>

          <div style={{ padding: 12, background: 'rgba(76, 175, 80, 0.1)', borderRadius: 6, fontSize: 13, color: 'var(--text)' }}>
            <strong>✅ 典型应用场景：</strong><br/>
            <div style={{ marginTop: 8, lineHeight: 1.8 }}>
              <strong>场景1：</strong> 访问远程主机自己的Web服务<br/>
              <code style={{ fontSize: 11, background: 'var(--panel)', padding: '2px 4px', borderRadius: 2 }}>
                localhost:8080 → 远程主机的Docker管理界面
              </code><br/>
              <br/>
              <strong>场景2：</strong> 访问内网其他机器<br/>
              <code style={{ fontSize: 11, background: 'var(--panel)', padding: '2px 4px', borderRadius: 2 }}>
                10.0.1.100:9000 → 内网数据库管理界面
              </code><br/>
              <br/>
              💡 常见用途：Portainer, Grafana, Jupyter, Jenkins等管理界面
            </div>
          </div>
        </div>
      </Modal>

      {/* 文件浏览器面板 */}
      {showFileTransfer && activeId && (
        <FileBrowser
          sessionId={activeId}
          onClose={() => setShowFileTransfer(false)}
        />
      )}
    </div>
  )
}

export default App
