package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

// WebProxySession represents an HTTP proxy over SSH
type WebProxySession struct {
	id         string
	sshClient  *ssh.Client
	remoteHost string
	remotePort int
	localPort  int
	server     *http.Server
	stop       chan struct{}
	wg         sync.WaitGroup
}

// StartWebProxy creates an HTTP proxy that forwards requests through SSH
func (tm *TermManager) StartWebProxy(sessionID string, localPort int, remoteHost string, remotePort int) (string, error) {
	s, ok := tm.get(sessionID)
	if !ok {
		return "", errors.New("session not found")
	}

	if remoteHost == "" {
		remoteHost = "localhost"
	}

	proxyID := fmt.Sprintf("webproxy-%d", localPort)

	// Create HTTP handler that proxies through SSH
	handler := &sshProxyHandler{
		sshClient:  s.client,
		remoteHost: remoteHost,
		remotePort: remotePort,
	}

	// Create local HTTP server
	mux := http.NewServeMux()
	mux.Handle("/", handler)

	server := &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", localPort),
		Handler: mux,
	}

	proxy := &WebProxySession{
		id:         proxyID,
		sshClient:  s.client,
		remoteHost: remoteHost,
		remotePort: remotePort,
		localPort:  localPort,
		server:     server,
		stop:       make(chan struct{}),
	}

	// Start HTTP server
	proxy.wg.Add(1)
	go func() {
		defer proxy.wg.Done()
		log.Printf("[Web Proxy] Starting on localhost:%d -> %s:%d via SSH", localPort, remoteHost, remotePort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[Web Proxy] ERROR: %v", err)
		}
	}()

	// Store proxy session
	s.fwdMu.Lock()
	if s.forwards == nil {
		s.forwards = make(map[string]*localForward)
	}
	// Reuse forwards map for simplicity, but store proxy info
	s.fwdMu.Unlock()

	return proxyID, nil
}

// sshProxyHandler handles HTTP requests by executing curl via SSH
type sshProxyHandler struct {
	sshClient  *ssh.Client
	remoteHost string
	remotePort int
}

func (h *sshProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Build the target URL
	targetURL := fmt.Sprintf("http://%s:%d%s", h.remoteHost, h.remotePort, r.URL.RequestURI())

	log.Printf("[Web Proxy] %s %s", r.Method, targetURL)

	// Create SSH session
	session, err := h.sshClient.NewSession()
	if err != nil {
		log.Printf("[Web Proxy] ERROR: Failed to create SSH session: %v", err)
		http.Error(w, "SSH session failed", http.StatusInternalServerError)
		return
	}
	defer session.Close()

	// Build curl command with headers
	var curlCmd strings.Builder
	curlCmd.WriteString("curl -s -i ")

	// Add method
	if r.Method != "GET" {
		curlCmd.WriteString(fmt.Sprintf("-X %s ", r.Method))
	}

	// Add headers
	for key, values := range r.Header {
		for _, value := range values {
			// Skip problematic headers
			if key == "Host" || key == "Connection" || strings.HasPrefix(key, "Sec-") {
				continue
			}
			curlCmd.WriteString(fmt.Sprintf("-H '%s: %s' ", key, value))
		}
	}

	// Add body if present
	if r.Method == "POST" || r.Method == "PUT" {
		body, _ := io.ReadAll(r.Body)
		if len(body) > 0 {
			curlCmd.WriteString(fmt.Sprintf("--data-binary '%s' ", string(body)))
		}
	}

	curlCmd.WriteString(fmt.Sprintf("'%s'", targetURL))

	// Execute curl via SSH
	output, err := session.CombinedOutput(curlCmd.String())
	if err != nil {
		log.Printf("[Web Proxy] ERROR: curl failed: %v", err)
		http.Error(w, "Remote request failed", http.StatusBadGateway)
		return
	}

	// Parse response (headers + body)
	parts := bytes.SplitN(output, []byte("\r\n\r\n"), 2)
	if len(parts) < 2 {
		parts = bytes.SplitN(output, []byte("\n\n"), 2)
	}

	if len(parts) == 2 {
		// Parse headers
		headerLines := bytes.Split(parts[0], []byte("\n"))
		for i, line := range headerLines {
			line = bytes.TrimSpace(line)
			if i == 0 {
				// Status line
				continue
			}
			if len(line) == 0 {
				continue
			}
			// Parse header
			colonIdx := bytes.IndexByte(line, ':')
			if colonIdx > 0 {
				key := string(bytes.TrimSpace(line[:colonIdx]))
				value := string(bytes.TrimSpace(line[colonIdx+1:]))
				w.Header().Set(key, value)
			}
		}

		// Write body
		w.Write(parts[1])
		log.Printf("[Web Proxy] Response: %d bytes", len(parts[1]))
	} else {
		// No headers, just write everything
		w.Write(output)
	}
}
