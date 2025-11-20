# Contributing to XGoTerm

First off, thank you for considering contributing to XGoTerm! It's people like you that make XGoTerm such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps which reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include screenshots and animated GIFs** if possible
* **Include your environment details** (OS version, XGoTerm version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior** and **explain which behavior you expected to see instead**
* **Explain why this enhancement would be useful**

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Follow the Go and TypeScript/React style guides
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Setup

### Prerequisites

* Go 1.21 or higher
* Node.js 16 or higher
* Wails CLI v2.11.0
* Git

### Setup Steps

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/xgoterm.git
   cd xgoterm
   ```

3. Install dependencies:
   ```bash
   # Backend
   go mod download
   
   # Frontend
   cd frontend
   npm install
   cd ..
   ```

4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

5. Make your changes and test:
   ```bash
   # Run in development mode
   wails dev
   
   # Run tests
   go test ./...
   cd frontend && npm test
   ```

6. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

7. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

8. Open a Pull Request

## Style Guides

### Git Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

* `feat:` - A new feature
* `fix:` - A bug fix
* `docs:` - Documentation only changes
* `style:` - Changes that do not affect the meaning of the code
* `refactor:` - A code change that neither fixes a bug nor adds a feature
* `perf:` - A code change that improves performance
* `test:` - Adding missing tests or correcting existing tests
* `chore:` - Changes to the build process or auxiliary tools

Examples:
```
feat: add file preview functionality
fix: resolve crash when downloading large files
docs: update README with new installation steps
```

### Go Style Guide

* Follow [Effective Go](https://go.dev/doc/effective_go)
* Run `go fmt` before committing
* Run `go vet` to check for common errors
* Keep functions small and focused
* Add comments for exported functions and types
* Use meaningful variable and function names

Example:
```go
// ListRemoteDir lists files and directories in the specified remote path
func (fm *FileManager) ListRemoteDir(sessionID, remotePath string) ([]RemoteFile, error) {
    // Implementation...
}
```

### TypeScript/React Style Guide

* Follow the [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
* Use functional components with hooks
* Use TypeScript for type safety
* Run `npm run lint` before committing
* Keep components small and reusable
* Use meaningful component and variable names

Example:
```typescript
interface FileBrowserProps {
  sessionId: string
  onClose: () => void
}

export default function FileBrowser({ sessionId, onClose }: FileBrowserProps) {
  // Implementation...
}
```

### Documentation Style Guide

* Use Markdown for documentation
* Keep line length to 80-100 characters when possible
* Use code blocks with syntax highlighting
* Include examples where appropriate
* Keep documentation up-to-date with code changes

## Testing

### Backend Testing

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test -run TestFunctionName
```

### Frontend Testing

```bash
cd frontend

# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Project Structure

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
│   │   ├── components/       # React components
│   │   └── wailsjs/          # Auto-generated Go bindings
│   ├── package.json
│   └── vite.config.ts
├── go.mod
├── wails.json
├── LICENSE
├── README.md
└── CONTRIBUTING.md
```

## Questions?

Feel free to open an issue with the `question` label or start a discussion in GitHub Discussions.

## License

By contributing to XGoTerm, you agree that your contributions will be licensed under the Apache License 2.0.
