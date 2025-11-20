package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"

	"xgoterm/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type TermManager struct {
	ctx      context.Context
	mu       sync.Mutex
	sessions map[string]*sshSession
}

// Local port forwarding implementation
type localForward struct {
	id   string
	ln   net.Listener
	stop chan struct{}
	wg   sync.WaitGroup
}

func (f *localForward) stopNow() {
	close(f.stop)
	_ = f.ln.Close()
	f.wg.Wait()
}

// StartWebProxyViaSSH creates HTTP proxy using SSH command execution (no port forwarding needed)
func (tm *TermManager) StartWebProxyViaSSH(id string, localPort int, remoteHost string, remotePort int) (string, error) {
	return tm.StartWebProxy(id, localPort, remoteHost, remotePort)
}

// StartLocalForward starts L-forward on a session. Returns forward id.
func (tm *TermManager) StartLocalForward(id string, localHost string, localPort int, remoteHost string, remotePort int) (string, error) {
	s, ok := tm.get(id)
	if !ok {
		return "", errors.New("session not found")
	}
	if localHost == "" {
		localHost = "127.0.0.1"
	}
	if remoteHost == "" {
		remoteHost = "127.0.0.1"
	}
	laddr := net.JoinHostPort(localHost, strconv.Itoa(localPort))
	raddr := net.JoinHostPort(remoteHost, strconv.Itoa(remotePort))
	ln, err := net.Listen("tcp", laddr)
	if err != nil {
		return "", err
	}
	fid := fmt.Sprintf("fwd-%d", time.Now().UnixNano())
	f := &localForward{id: fid, ln: ln, stop: make(chan struct{})}
	s.fwdMu.Lock()
	s.forwards[fid] = f
	s.fwdMu.Unlock()
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-f.stop:
					return
				default:
				}
				continue
			}
			// handle connection
			go func(c net.Conn) {
				defer c.Close()
				log.Printf("[Port Forward] New connection from %s to %s", c.RemoteAddr(), raddr)

				// dial remote through SSH
				rc, err := s.client.Dial("tcp", raddr)
				if err != nil {
					log.Printf("[Port Forward] ERROR: Failed to dial remote %s: %v", raddr, err)
					return
				}
				defer rc.Close()
				log.Printf("[Port Forward] Connected to remote %s", raddr)

				// bidirectional copy
				var wg sync.WaitGroup
				wg.Add(2)
				go func() {
					defer wg.Done()
					n, err := io.Copy(rc, c)
					if err != nil {
						log.Printf("[Port Forward] ERROR: Client->Remote copy failed after %d bytes: %v", n, err)
					} else {
						log.Printf("[Port Forward] Client->Remote copy completed: %d bytes", n)
					}
				}()
				go func() {
					defer wg.Done()
					n, err := io.Copy(c, rc)
					if err != nil {
						log.Printf("[Port Forward] ERROR: Remote->Client copy failed after %d bytes: %v", n, err)
					} else {
						log.Printf("[Port Forward] Remote->Client copy completed: %d bytes", n)
					}
				}()
				wg.Wait()
				log.Printf("[Port Forward] Connection closed")
			}(conn)
		}
	}()
	return fid, nil
}

func (tm *TermManager) StopLocalForward(id string, forwardId string) error {
	s, ok := tm.get(id)
	if !ok {
		return errors.New("session not found")
	}
	s.fwdMu.Lock()
	f, ok := s.forwards[forwardId]
	if ok {
		delete(s.forwards, forwardId)
	}
	s.fwdMu.Unlock()
	if !ok {
		return errors.New("forward not found")
	}
	f.stopNow()
	return nil
}

// evtWriter implements io.Writer to forward SSH output to frontend & recorder
type evtWriter struct {
	tm *TermManager
	ss *sshSession
}

func (w *evtWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	chunk := string(p)
	runtime.EventsEmit(w.tm.ctx, "term:data:"+w.ss.id, chunk)
	w.tm.appendRecord(w.ss, chunk)
	return len(p), nil
}

type sshSession struct {
	id      string
	host    string
	port    int
	user    string
	client  *ssh.Client
	sess    *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
	stderr  io.Reader
	closed  chan struct{}
	started bool

	recMu    sync.Mutex
	recOn    bool
	recPath  string
	recFile  *os.File
	recLines bool
	lineNo   int

	gateway *ssh.Client

	fwdMu    sync.Mutex
	forwards map[string]*localForward
}

type SSHParams struct {
	Host         string
	Port         int
	Username     string
	Password     string
	AuthType     string // "password" | "key" (key not yet implemented in MVP)
	KeyPEM       string // optional
	Passphrase   string // optional
	Cols         int
	Rows         int
	KeepAliveSec int // 0=off
	TimeoutSec   int // default 10
	// ProxyJump (single hop)
	GatewayHost       string
	GatewayPort       int
	GatewayUser       string
	GatewayAuth       string // password | key
	GatewayPassword   string
	GatewayKeyPEM     string
	GatewayPassphrase string
}

func NewTermManager() *TermManager {
	return &TermManager{sessions: make(map[string]*sshSession)}
}

func (tm *TermManager) startup(ctx context.Context) {
	tm.ctx = ctx
	_ = store.EnsureDirs()
	_, _ = store.LoadOrCreateMasterKey()
}

func (tm *TermManager) StartSSH(p SSHParams) (string, error) {
	if p.Host == "" || p.Username == "" {
		return "", errors.New("host/username required")
	}
	if p.Port == 0 {
		p.Port = 22
	}
	addr := net.JoinHostPort(p.Host, strconv.Itoa(p.Port))

	// build auth
	var authMethods []ssh.AuthMethod
	switch p.AuthType {
	case "password", "":
		authMethods = append(authMethods, ssh.Password(p.Password))
	case "key":
		if p.KeyPEM == "" {
			return "", errors.New("key auth requires KeyPEM")
		}
		var signer ssh.Signer
		if p.Passphrase != "" {
			s, err := ssh.ParsePrivateKeyWithPassphrase([]byte(p.KeyPEM), []byte(p.Passphrase))
			if err != nil {
				return "", fmt.Errorf("parse key: %w", err)
			}
			signer = s
		} else {
			s, err := ssh.ParsePrivateKey([]byte(p.KeyPEM))
			if err != nil {
				return "", fmt.Errorf("parse key: %w", err)
			}
			signer = s
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		return "", fmt.Errorf("unsupported auth type: %s", p.AuthType)
	}

	cfg := &ssh.ClientConfig{
		User:            p.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout: func() time.Duration {
			if p.TimeoutSec > 0 {
				return time.Duration(p.TimeoutSec) * time.Second
			}
			return 10 * time.Second
		}(),
	}

	// dial target (optionally via gateway)
	var client *ssh.Client
	var gatewayClient *ssh.Client
	var err error
	if p.GatewayHost != "" {
		gwAddr := net.JoinHostPort(p.GatewayHost, strconv.Itoa(func() int {
			if p.GatewayPort > 0 {
				return p.GatewayPort
			}
			return 22
		}()))
		log.Printf("[ProxyJump] 正在连接跳板机: %s@%s", p.GatewayUser, gwAddr)

		var gwMethods []ssh.AuthMethod
		if p.GatewayAuth == "key" {
			if p.GatewayKeyPEM == "" {
				return "", errors.New("跳板机密钥认证需要提供私钥")
			}
			var gwSigner ssh.Signer
			if p.GatewayPassphrase != "" {
				s, e := ssh.ParsePrivateKeyWithPassphrase([]byte(p.GatewayKeyPEM), []byte(p.GatewayPassphrase))
				if e != nil {
					return "", fmt.Errorf("解析跳板机私钥失败: %w", e)
				}
				gwSigner = s
			} else {
				s, e := ssh.ParsePrivateKey([]byte(p.GatewayKeyPEM))
				if e != nil {
					return "", fmt.Errorf("解析跳板机私钥失败: %w", e)
				}
				gwSigner = s
			}
			gwMethods = append(gwMethods, ssh.PublicKeys(gwSigner))
			log.Printf("[ProxyJump] 跳板机使用私钥认证")
		} else {
			if p.GatewayPassword == "" {
				return "", errors.New("跳板机密码认证需要提供密码")
			}
			gwMethods = append(gwMethods, ssh.Password(p.GatewayPassword))
			log.Printf("[ProxyJump] 跳板机使用密码认证")
		}
		gwCfg := &ssh.ClientConfig{User: p.GatewayUser, Auth: gwMethods, HostKeyCallback: ssh.InsecureIgnoreHostKey(), Timeout: cfg.Timeout}
		gcli, e := ssh.Dial("tcp", gwAddr, gwCfg)
		if e != nil {
			return "", fmt.Errorf("连接跳板机失败 (%s@%s): %w", p.GatewayUser, gwAddr, e)
		}
		log.Printf("[ProxyJump] ✓ 跳板机连接成功")
		gatewayClient = gcli

		log.Printf("[ProxyJump] 通过跳板机连接目标主机: %s@%s", p.Username, addr)
		conn, e := gatewayClient.Dial("tcp", addr)
		if e != nil {
			log.Printf("[ProxyJump] ⚠️  端口转发失败，尝试使用命令执行方式: %v", e)
			// 如果端口转发被禁止，尝试使用在跳板机上执行ssh命令的方式
			if strings.Contains(e.Error(), "administratively prohibited") || strings.Contains(e.Error(), "open failed") {
				log.Printf("[ProxyJump] 检测到端口转发被禁止，使用备用方案")
				_ = gatewayClient.Close()
				return "", fmt.Errorf("跳板机禁止了端口转发功能。\n\n解决方案：\n1. 让管理员在跳板机的 /etc/ssh/sshd_config 中设置 AllowTcpForwarding yes\n2. 或者先连接到跳板机，再手动连接目标主机\n\n原始错误: %w", e)
			}
			_ = gatewayClient.Close()
			return "", fmt.Errorf("通过跳板机连接目标主机失败 (%s): %w", addr, e)
		}
		cconn, chans, reqs, e := ssh.NewClientConn(conn, addr, cfg)
		if e != nil {
			_ = gatewayClient.Close()
			return "", fmt.Errorf("目标主机认证失败 (%s@%s): %w", p.Username, addr, e)
		}
		log.Printf("[ProxyJump] ✓ 目标主机连接成功")
		client = ssh.NewClient(cconn, chans, reqs)
	} else {
		client, err = ssh.Dial("tcp", addr, cfg)
		if err != nil {
			return "", err
		}
	}

	s, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return "", err
	}

	stdin, err := s.StdinPipe()
	if err != nil {
		_ = s.Close()
		_ = client.Close()
		return "", err
	}
	stdout, err := s.StdoutPipe()
	if err != nil {
		_ = s.Close()
		_ = client.Close()
		return "", err
	}
	stderr, err := s.StderrPipe()
	if err != nil {
		_ = s.Close()
		_ = client.Close()
		return "", err
	}

	id := fmt.Sprintf("%d", time.Now().UnixNano())
	sess := &sshSession{
		id: id, host: p.Host, port: p.Port, user: p.Username,
		client: client, sess: s, stdin: stdin, stdout: stdout, stderr: stderr,
		closed: make(chan struct{}), started: false, gateway: gatewayClient,
		forwards: make(map[string]*localForward),
	}

	tm.mu.Lock()
	tm.sessions[id] = sess
	tm.mu.Unlock()

	if p.KeepAliveSec > 0 {
		interval := time.Duration(p.KeepAliveSec) * time.Second
		go func(c *ssh.Client, ch <-chan struct{}) {
			t := time.NewTicker(interval)
			defer t.Stop()
			for {
				select {
				case <-t.C:
					_, _, _ = c.SendRequest("keepalive@openssh.com", true, nil)
				case <-ch:
					return
				}
			}
		}(client, sess.closed)
	}

	// immediate start if initial size provided
	if p.Cols > 0 && p.Rows > 0 {
		modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
		if err := s.RequestPty("xterm-256color", p.Rows, p.Cols, modes); err != nil {
			_ = s.Close()
			_ = client.Close()
			return "", err
		}
		if err := s.Shell(); err != nil {
			_ = s.Close()
			_ = client.Close()
			return "", err
		}
		sess.started = true
		go tm.pumpOutput(sess)
		runtime.EventsEmit(tm.ctx, "term:started:"+id)
		_, _ = io.WriteString(sess.stdin, "\r")
	}
	return id, nil
}

func (tm *TermManager) pumpOutput(ss *sshSession) {
	defer close(ss.closed)
	writer := &evtWriter{tm: tm, ss: ss}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _, _ = io.Copy(writer, ss.stdout) }()
	go func() { defer wg.Done(); _, _ = io.Copy(writer, ss.stderr) }()
	wg.Wait()
	// notify frontend this session is closed
	runtime.EventsEmit(tm.ctx, "term:closed:"+ss.id)
	runtime.EventsEmit(tm.ctx, "term:closed", ss.id)
}

func (tm *TermManager) Send(id string, data string) error {
	s, ok := tm.get(id)
	if !ok {
		return errors.New("session not found")
	}
	_, err := io.WriteString(s.stdin, data)
	return err
}

func (tm *TermManager) Resize(id string, cols, rows int) error {
	s, ok := tm.get(id)
	if !ok {
		return errors.New("session not found")
	}
	if !s.started {
		modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
		if err := s.sess.RequestPty("xterm-256color", rows, cols, modes); err != nil {
			return err
		}
		if err := s.sess.Shell(); err != nil {
			return err
		}
		s.started = true
		go tm.pumpOutput(s)
		runtime.EventsEmit(tm.ctx, "term:started:"+s.id)
		_, _ = io.WriteString(s.stdin, "\r")
		return nil
	}
	return s.sess.WindowChange(rows, cols)
}

func (tm *TermManager) Close(id string) error {
	s, ok := tm.take(id)
	if !ok {
		return nil
	}
	// stop forwards
	s.fwdMu.Lock()
	for _, f := range s.forwards {
		f.stopNow()
	}
	s.fwdMu.Unlock()
	tm.stopRecordingLocked(s)
	_ = s.sess.Close()
	_ = s.client.Close()
	if s.gateway != nil {
		_ = s.gateway.Close()
	}
	<-s.closed
	return nil
}

func (tm *TermManager) get(id string) (*sshSession, bool) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	s, ok := tm.sessions[id]
	return s, ok
}

func (tm *TermManager) take(id string) (*sshSession, bool) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	s, ok := tm.sessions[id]
	if ok {
		delete(tm.sessions, id)
	}
	return s, ok
}

// StartRecording starts markdown recording for a session. If filename is empty, it will be generated.
func (tm *TermManager) StartRecording(id string, filename string, includeLineNumbers bool) (string, error) {
	s, ok := tm.get(id)
	if !ok {
		return "", errors.New("session not found")
	}
	s.recMu.Lock()
	defer s.recMu.Unlock()
	if s.recOn {
		return s.recPath, nil
	}
	dir := store.SessionsDir()
	if filename == "" {
		ts := time.Now().Format("20060102_150405")
		safeHost := strings.ReplaceAll(s.host, ":", "-")
		filename = fmt.Sprintf("%s_%s.md", ts, safeHost)
	}
	path := filepath.Join(dir, filename)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return "", err
	}
	// write opening fence
	_, _ = f.WriteString("```text\n")
	s.recOn = true
	s.recPath = path
	s.recFile = f
	s.recLines = includeLineNumbers
	s.lineNo = 0
	return path, nil
}

func (tm *TermManager) StopRecording(id string) error {
	s, ok := tm.get(id)
	if !ok {
		return errors.New("session not found")
	}
	s.recMu.Lock()
	defer s.recMu.Unlock()
	return tm.stopRecordingLocked(s)
}

func (tm *TermManager) stopRecordingLocked(s *sshSession) error {
	if !s.recOn {
		return nil
	}
	// closing fence
	if s.recFile != nil {
		_, _ = s.recFile.WriteString("\n```\n")
	}
	if s.recFile != nil {
		_ = s.recFile.Close()
	}
	s.recOn = false
	s.recFile = nil
	s.recPath = ""
	s.lineNo = 0
	return nil
}

func (tm *TermManager) appendRecord(s *sshSession, chunk string) {
	s.recMu.Lock()
	defer s.recMu.Unlock()
	if !s.recOn || s.recFile == nil {
		return
	}
	ts := time.Now().Format("15:04:05")
	if s.recLines {
		lines := strings.Split(chunk, "\n")
		for i, line := range lines {
			s.lineNo++
			// avoid adding extra newline at the very end unless present
			if _, err := fmt.Fprintf(s.recFile, "[%s] %6d | %s", ts, s.lineNo, line); err != nil {
				return
			}
			if i < len(lines)-1 {
				_, _ = s.recFile.WriteString("\n")
			}
		}
	} else {
		_, _ = fmt.Fprintf(s.recFile, "[%s] %s", ts, chunk)
	}
}
