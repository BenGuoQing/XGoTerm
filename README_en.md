# XGoTerm

<div align="center">

![XGoTerm Logo](docs/logo.png)

**A Modern, Feature-Rich SSH Terminal Client for Windows**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go)](https://go.dev/)
[![Wails](https://img.shields.io/badge/Wails-v2.11.0-red?logo=wails)](https://wails.io)
[![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)

[English](README.md) | [简体中文](README_zh.md)

</div>

---

## 📖 Overview

**XGoTerm** is a powerful, modern SSH terminal client built with **Go** and **React**, powered by the **Wails** framework. Designed as a free, open-source alternative to Xshell, it provides enterprise-grade features including multi-tab sessions, SFTP file management, session recording, and jump host support.

### ✨ Key Features

- 🚀 **Multi-Tab Terminal** - Manage multiple SSH sessions simultaneously with an intuitive tabbed interface
- 📁 **Built-in File Browser** - Browse, upload, download, and manage remote files via SFTP with real-time progress tracking
- 🎯 **Jump Host Support** - Connect through bastion/jump hosts with transparent SSH forwarding
- 📝 **Session Recording** - Record terminal sessions to Markdown files for documentation and audit trails
- 🔐 **Encrypted Profiles** - Store SSH credentials securely with AES encryption
- 🎨 **Modern UI** - Clean, responsive interface with theme support (dark/light modes)
- ⚡ **High Performance** - Built with Go for speed and low resource usage
- 🔌 **Web Preview** - Open web services directly from saved host profiles
- 📋 **Command Broadcast** - Send commands to multiple sessions simultaneously
- 💾 **Import/Export** - Backup and restore your host configurations (.xgth format)

---

## 🖼️ Screenshots

<div align="center">

### Main Interface
![Main Interface](docs/screenshots/main.png)

### File Browser
![File Browser](docs/screenshots/file-browser.png)

### Multiple Sessions
![Multiple Sessions](docs/screenshots/multi-tab.png)

</div>

---

## 🚀 Quick Start

### Prerequisites

- **Windows 10/11** (64-bit)
- **WebView2 Runtime** (usually pre-installed on Windows 11)

### Download & Install

#### Option 1: Download Binary (Recommended)

1. Go to [Releases](https://github.com/yourusername/xgoterm/releases)
2. Download the latest `xgoterm-windows-amd64.exe`
3. Run the executable - no installation required!

#### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/xgoterm.git
cd xgoterm

# Install dependencies
go mod download
cd frontend && npm install && cd ..

# Build
wails build

# Run development mode
wails dev
```

---

## 📚 Usage Guide

### Connecting to a Server

1. Click **"+ 新建连接"** button in the top bar
2. Fill in the connection details:
   - **Host**: Server IP address or hostname
   - **Port**: SSH port (default: 22)
   - **Username**: SSH username
   - **Authentication**: Choose password or private key
3. Click **"连接"** to establish the connection

### Using the File Browser

1. Click **"📁 文件"** button to open the file browser
2. Navigate through remote directories by double-clicking folders
3. **Right-click** on files/folders for actions:
   - **Download**: Save files to your local machine
   - **Delete**: Remove files/folders
   - **Rename**: Rename files/folders
4. **Upload files**: Click "⬆️ 上传文件" or drag & drop files
5. **Collapse**: Click "▶" to minimize the browser while keeping transfers active

### Jump Host Configuration

1. Open connection settings
2. Enable **"使用跳板机"** (Use Jump Host)
3. Configure the bastion host:
   - Jump host address and port
   - Jump host credentials
4. Configure the target host
5. Connect - XGoTerm will automatically tunnel through the jump host

### Session Recording

1. Click the **🔴 record icon** in the top bar to start recording
2. All terminal output will be saved to a Markdown file
3. Click again to stop recording
4. Find recordings in the `recordings/` directory

---

## 🛠️ Development

### Tech Stack

**Backend (Go)**
- [Wails v2](https://wails.io) - Desktop application framework
- [golang.org/x/crypto/ssh](https://pkg.go.dev/golang.org/x/crypto/ssh) - SSH client
- [github.com/pkg/sftp](https://github.com/pkg/sftp) - SFTP implementation

**Frontend (React + TypeScript)**
- [React 18](https://reactjs.org/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Vite](https://vitejs.dev/) - Build tool
- [rc-dock](https://github.com/ticlo/rc-dock) - Docking layout

### Project Structure

```
xgoterm/
├── main.go              # Application entry point
├── app.go               # App lifecycle & dialogs
├── term_manager.go      # SSH session management
├── file_manager.go      # SFTP file operations
├── profiles_manager.go  # Host profile storage
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main React component
│   │   ├── components/
│   │   │   ├── TerminalTab.tsx    # Terminal UI
│   │   │   ├── FileBrowser.tsx    # File manager
│   │   │   ├── Sidebar.tsx        # Host list
│   │   │   └── Topbar.tsx         # Top navigation
│   │   └── wailsjs/          # Auto-generated Go bindings
│   └── package.json
├── go.mod
└── wails.json
```

### Building

```bash
# Development mode with hot reload
wails dev

# Production build
wails build

# Build for specific platform
wails build -platform windows/amd64
```

### Running Tests

```bash
# Backend tests
go test ./...

# Frontend tests
cd frontend && npm test
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add some amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Style

- **Go**: Follow [Effective Go](https://go.dev/doc/effective_go) guidelines
- **TypeScript/React**: Follow [Airbnb Style Guide](https://github.com/airbnb/javascript)
- Run `go fmt` and `npm run lint` before committing

---

## 🗺️ Roadmap

- [ ] **Multi-platform support** (macOS, Linux)
- [ ] **SSH key management UI**
- [ ] **Port forwarding** (Local/Remote/Dynamic)
- [ ] **SFTP directory download** (recursive)
- [ ] **File preview** (text, images, code)
- [ ] **Online file editor** with syntax highlighting
- [ ] **Command history** search and auto-completion
- [ ] **Custom themes** and color schemes
- [ ] **Plugin system**
- [ ] **Multi-language support** (English, Chinese, Japanese)

---

## 📄 License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

```
Copyright 2025 XGoTerm Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 🙏 Acknowledgments

- [Wails](https://wails.io) - Amazing Go + Web framework
- [xterm.js](https://xtermjs.org/) - Powerful terminal emulator
- [golang.org/x/crypto](https://pkg.go.dev/golang.org/x/crypto) - Excellent SSH implementation
- All our [contributors](https://github.com/yourusername/xgoterm/graphs/contributors)

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/xgoterm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/xgoterm/discussions)
- **Email**: your-email@example.com

---

<div align="center">

**If you find XGoTerm useful, please give us a ⭐️ on GitHub!**

Made with ❤️ by the XGoTerm team

</div>
