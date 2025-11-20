import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { EventsOn, EventsOff } from '../../wailsjs/runtime'
import { Send, Resize } from '../../wailsjs/go/main/TermManager'
import { getSettings } from './Settings'

interface Props {
  sessionId: string
  theme: 'dark' | 'light'
  active?: boolean
  onFocus?: () => void
}

// 主题配置
function getThemeConfig(themeName: string) {
  const themes: Record<string, any> = {
    'dark': {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#00ff00',
      selectionBackground: 'rgba(255, 255, 255, 0.3)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff'
    },
    'light': {
      background: '#ffffff',
      foreground: '#000000',
      cursor: '#0000ff',
      selectionBackground: 'rgba(0, 0, 255, 0.3)',
      black: '#000000',
      red: '#cd3131',
      green: '#00BC00',
      yellow: '#949800',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#555555',
      brightBlack: '#666666',
      brightRed: '#cd3131',
      brightGreen: '#14CE14',
      brightYellow: '#b5ba00',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#a5a5a5'
    },
    'dracula': {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#000000',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#bbbbbb',
      brightBlack: '#555555',
      brightRed: '#ff5555',
      brightGreen: '#50fa7b',
      brightYellow: '#f1fa8c',
      brightBlue: '#bd93f9',
      brightMagenta: '#ff79c6',
      brightCyan: '#8be9fd',
      brightWhite: '#ffffff'
    },
    'monokai': {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#49483e',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5'
    },
    'solarized-dark': {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#839496',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3'
    },
    'solarized-light': {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#657b83',
      selectionBackground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3'
    },
    'nord': {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4'
    },
    'gruvbox': {
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#ebdbb2',
      selectionBackground: '#504945',
      black: '#282828',
      red: '#cc241d',
      green: '#98971a',
      yellow: '#d79921',
      blue: '#458588',
      magenta: '#b16286',
      cyan: '#689d6a',
      white: '#a89984',
      brightBlack: '#928374',
      brightRed: '#fb4934',
      brightGreen: '#b8bb26',
      brightYellow: '#fabd2f',
      brightBlue: '#83a598',
      brightMagenta: '#d3869b',
      brightCyan: '#8ec07c',
      brightWhite: '#ebdbb2'
    }
  }
  
  return themes[themeName] || themes['dark']
}

export default function TerminalTab({ sessionId, theme, active, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal>()
  const fitRef = useRef<FitAddon>()
  
  // State to track if terminal is mounted and PTY started
  const [isReady, setIsReady] = useState(false)
  
  // Refs for internal state to avoid stale closures in event handlers
  const startedRef = useRef(false)
  const pendingDataRef = useRef<string[]>([])

  useEffect(() => {
    if (!containerRef.current) return

    // 1. 加载用户设置
    const settings = getSettings()
    
    // 2. 获取主题配置
    const themeConfig = getThemeConfig(settings.theme)
    
    // 3. Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      convertEol: true,
      allowProposedApi: true,
      theme: themeConfig,
    })
    
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    
    termRef.current = term
    fitRef.current = fitAddon

    // 2. Setup Resize Logic
    // We use a ResizeObserver to detect when the container actually has size.
    // This handles initial load, window resize, and tab switching (display: none -> block).
    const handleResize = () => {
        if (!containerRef.current || !termRef.current || !fitRef.current) return
        
        // Only fit if container is visible and has size
        const { clientWidth, clientHeight } = containerRef.current
        if (clientWidth === 0 || clientHeight === 0) return

        try {
            fitRef.current.fit()
            const cols = termRef.current.cols
            const rows = termRef.current.rows
            
            // If we have valid dimensions, sync with backend
            if (cols > 2 && rows > 2) {
                void Resize(sessionId, cols, rows).catch(() => {})
            }
        } catch (e) {
            // ignore fit errors
        }
    }

    const ro = new ResizeObserver(() => {
        // Debounce slightly or run immediately? 
        // RequestAnimationFrame is usually good for UI updates
        requestAnimationFrame(handleResize)
    })
    ro.observe(containerRef.current)

    // 3. Setup Event Listeners
    // Data coming from backend
    const onData = (...args: any[]) => {
        // Wails sends the data as the first argument
        const payload = (args.length > 0 ? String(args[0]) : '')
        if (!payload) return
        term.write(payload)
    }

    // Backend events
    const dataEvent = `term:data:${sessionId}`
    const closedEvent = `term:closed:${sessionId}`
    const startedEvent = `term:started:${sessionId}`

    EventsOn(dataEvent, onData)
    EventsOn(closedEvent, () => term.writeln('\r\n[Session closed]'))
    
    EventsOn(startedEvent, () => {
        console.log('✅ Terminal ready:', sessionId)
        startedRef.current = true
        setIsReady(true) // Remove loading spinner
        
        // Force a fit/resize sync now that session is officially "started"
        handleResize()
        
        // Trigger a prompt refresh just in case
        void Send(sessionId, '\r').catch(() => {})
    })

    // User Input
    term.onData((data) => {
        void Send(sessionId, data).catch(() => {})
    })

    // 选中文本自动复制到剪贴板（如果启用）
    if (settings.copyOnSelect) {
        term.onSelectionChange(() => {
            const selection = term.getSelection()
            if (selection) {
                navigator.clipboard.writeText(selection).catch(() => {
                    console.warn('Failed to copy to clipboard')
                })
            }
        })
    }

    // Allow xterm to handle all key events (prevents browser shortcuts like Ctrl+F blocking terminal)
    term.attachCustomKeyEventHandler(() => true)

    // Focus handler
    containerRef.current.addEventListener('click', () => {
        term.focus()
        onFocus?.()
    })

    // 鼠标中键粘贴功能（如果启用）
    const handleMiddleClick = (e: MouseEvent) => {
        if (settings.pasteOnMiddleClick && e.button === 1) { // 中键
            e.preventDefault()
            navigator.clipboard.readText().then(text => {
                void Send(sessionId, text).catch(() => {})
            }).catch(() => {
                console.warn('Failed to read from clipboard')
            })
        }
    }
    containerRef.current.addEventListener('mousedown', handleMiddleClick)

    // Cleanup
    return () => {
        ro.disconnect()
        containerRef.current?.removeEventListener('mousedown', handleMiddleClick)
        EventsOff(dataEvent)
        EventsOff(closedEvent)
        EventsOff(startedEvent)
        term.dispose()
        termRef.current = undefined
        fitRef.current = undefined
    }
  }, [sessionId]) // Only re-run if sessionId changes (new tab)

  // Handle Active Tab Switch (display: none -> block)
  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
        // Give the browser a frame to paint the display:block change
        requestAnimationFrame(() => {
            try {
                fitRef.current?.fit()
                termRef.current?.focus()
                const { cols, rows } = termRef.current!
                if (cols > 2 && rows > 2) {
                    void Resize(sessionId, cols, rows).catch(() => {})
                }
            } catch {}
        })
    }
  }, [active, sessionId])

  // Handle Theme Change
  useEffect(() => {
    if (!termRef.current) return
    const styles = getComputedStyle(document.documentElement)
    const tbg = styles.getPropertyValue('--term-bg').trim()
    const tfg = styles.getPropertyValue('--term-fg').trim()
    const tcursor = styles.getPropertyValue('--term-cursor').trim()
    const tsel = styles.getPropertyValue('--term-selection').trim()
    
    termRef.current.options.theme = {
        background: tbg,
        foreground: tfg,
        cursor: tcursor,
        selectionBackground: tsel,
    }
  }, [theme])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {!isReady && (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'var(--term-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 16
        }}>
            <div className="spinner" />
            <div style={{ color: 'var(--text)', opacity: 0.8, fontSize: 14 }}>Connecting...</div>
        </div>
      )}
      <div ref={containerRef} className="terminal-container" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
