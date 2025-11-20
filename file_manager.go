package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// FileManager 文件传输管理器
type FileManager struct {
	ctx       context.Context
	tm        *TermManager
	mu        sync.RWMutex
	transfers map[string]*FileTransfer // transferId -> transfer
}

// FileTransfer 文件传输任务
type FileTransfer struct {
	ID          string
	SessionID   string
	Type        string // "upload" or "download"
	LocalPath   string
	RemotePath  string
	Size        int64
	Transferred int64
	Status      string // "running", "paused", "completed", "failed"
	Error       string
	StartTime   time.Time
	cancel      context.CancelFunc
}

// TransferProgress 传输进度
type TransferProgress struct {
	TransferID  string  `json:"transferId"`
	Transferred int64   `json:"transferred"`
	Total       int64   `json:"total"`
	Percent     float64 `json:"percent"`
	Speed       int64   `json:"speed"` // bytes per second
	Status      string  `json:"status"`
	Error       string  `json:"error,omitempty"`
}

// RemoteFile 远程文件信息
type RemoteFile struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime int64  `json:"modTime"` // Unix timestamp
	IsDir   bool   `json:"isDir"`
}

func NewFileManager(tm *TermManager) *FileManager {
	return &FileManager{
		tm:        tm,
		transfers: make(map[string]*FileTransfer),
	}
}

func (fm *FileManager) startup(ctx context.Context) {
	fm.ctx = ctx
}

// UploadFile 上传文件到远程服务器
func (fm *FileManager) UploadFile(sessionID, localPath, remotePath string) (string, error) {
	// 获取SSH会话
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return "", fmt.Errorf("会话不存在")
	}

	// 获取本地文件信息
	fileInfo, err := os.Stat(localPath)
	if err != nil {
		return "", fmt.Errorf("无法读取本地文件: %w", err)
	}

	// 创建传输任务
	transferID := fmt.Sprintf("upload-%d", time.Now().UnixNano())
	ctx, cancel := context.WithCancel(fm.ctx)
	transfer := &FileTransfer{
		ID:         transferID,
		SessionID:  sessionID,
		Type:       "upload",
		LocalPath:  localPath,
		RemotePath: remotePath,
		Size:       fileInfo.Size(),
		Status:     "running",
		StartTime:  time.Now(),
		cancel:     cancel,
	}

	fm.mu.Lock()
	fm.transfers[transferID] = transfer
	fm.mu.Unlock()

	// 异步上传
	go fm.doUpload(ctx, sess, transfer)

	return transferID, nil
}

func (fm *FileManager) doUpload(ctx context.Context, sess *sshSession, transfer *FileTransfer) {
	// 发送初始进度
	log.Printf("[FileTransfer] 开始上传: %s -> %s", transfer.LocalPath, transfer.RemotePath)
	fm.emitProgress(transfer)

	defer func() {
		fm.mu.Lock()
		if transfer.Status == "running" {
			transfer.Status = "completed"
		}
		fm.mu.Unlock()
		fm.emitProgress(transfer)
		log.Printf("[FileTransfer] 上传结束，状态: %s", transfer.Status)
	}()

	// 创建SFTP客户端
	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("创建SFTP客户端失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer sftpClient.Close()

	// 打开本地文件
	srcFile, err := os.Open(transfer.LocalPath)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("打开本地文件失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer srcFile.Close()

	// 创建远程文件
	dstFile, err := sftpClient.Create(transfer.RemotePath)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("创建远程文件失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer dstFile.Close()

	// 带进度的复制
	buf := make([]byte, 32*1024) // 32KB buffer
	lastUpdate := time.Now()

	for {
		select {
		case <-ctx.Done():
			transfer.Status = "cancelled"
			return
		default:
		}

		n, err := srcFile.Read(buf)
		if n > 0 {
			_, writeErr := dstFile.Write(buf[:n])
			if writeErr != nil {
				transfer.Status = "failed"
				transfer.Error = fmt.Sprintf("写入远程文件失败: %v", writeErr)
				fm.emitProgress(transfer)
				return
			}

			fm.mu.Lock()
			transfer.Transferred += int64(n)
			fm.mu.Unlock()

			// 每500ms更新一次进度
			if time.Since(lastUpdate) >= 500*time.Millisecond {
				fm.emitProgress(transfer)
				lastUpdate = time.Now()
			}
		}

		if err == io.EOF {
			break
		}
		if err != nil {
			transfer.Status = "failed"
			transfer.Error = fmt.Sprintf("读取本地文件失败: %v", err)
			fm.emitProgress(transfer) // 在读取错误时发送进度更新
			return
		}
	}

	log.Printf("[FileTransfer] ✅ 上传完成: %s -> %s (%d bytes)",
		transfer.LocalPath, transfer.RemotePath, transfer.Size)
}

// DownloadFile 从远程服务器下载文件
func (fm *FileManager) DownloadFile(sessionID, remotePath, localPath string) (string, error) {
	// 获取SSH会话
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return "", fmt.Errorf("会话不存在")
	}

	// 创建SFTP客户端获取远程文件信息
	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return "", fmt.Errorf("创建SFTP客户端失败: %w", err)
	}

	fileInfo, err := sftpClient.Stat(remotePath)
	sftpClient.Close()
	if err != nil {
		return "", fmt.Errorf("无法读取远程文件信息: %w", err)
	}

	// 检查是否为目录
	if fileInfo.IsDir() {
		return "", fmt.Errorf("不支持下载目录，请选择单个文件下载")
	}

	// 创建传输任务
	transferID := fmt.Sprintf("download-%d", time.Now().UnixNano())
	ctx, cancel := context.WithCancel(fm.ctx)
	transfer := &FileTransfer{
		ID:         transferID,
		SessionID:  sessionID,
		Type:       "download",
		LocalPath:  localPath,
		RemotePath: remotePath,
		Size:       fileInfo.Size(),
		Status:     "running",
		StartTime:  time.Now(),
		cancel:     cancel,
	}

	fm.mu.Lock()
	fm.transfers[transferID] = transfer
	fm.mu.Unlock()

	// 异步下载
	go fm.doDownload(ctx, sess, transfer)

	return transferID, nil
}

func (fm *FileManager) doDownload(ctx context.Context, sess *sshSession, transfer *FileTransfer) {
	// 发送初始进度
	log.Printf("[FileTransfer] 开始下载: %s -> %s", transfer.RemotePath, transfer.LocalPath)
	fm.emitProgress(transfer)

	defer func() {
		fm.mu.Lock()
		if transfer.Status == "running" {
			transfer.Status = "completed"
		}
		fm.mu.Unlock()
		fm.emitProgress(transfer)
		log.Printf("[FileTransfer] 下载结束，状态: %s", transfer.Status)
	}()

	// 创建SFTP客户端
	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("创建SFTP客户端失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer sftpClient.Close()

	// 打开远程文件
	srcFile, err := sftpClient.Open(transfer.RemotePath)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("打开远程文件失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer srcFile.Close()

	// 确保本地目录存在
	localDir := filepath.Dir(transfer.LocalPath)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("创建本地目录失败: %v", err)
		fm.emitProgress(transfer)
		return
	}

	// 创建本地文件
	dstFile, err := os.Create(transfer.LocalPath)
	if err != nil {
		transfer.Status = "failed"
		transfer.Error = fmt.Sprintf("创建本地文件失败: %v", err)
		log.Printf("[FileTransfer] %s", transfer.Error)
		fm.emitProgress(transfer)
		return
	}
	defer dstFile.Close()

	// 带进度的复制
	buf := make([]byte, 32*1024) // 32KB buffer
	lastUpdate := time.Now()

	for {
		select {
		case <-ctx.Done():
			transfer.Status = "cancelled"
			return
		default:
		}

		n, err := srcFile.Read(buf)
		if n > 0 {
			_, writeErr := dstFile.Write(buf[:n])
			if writeErr != nil {
				transfer.Status = "failed"
				transfer.Error = fmt.Sprintf("写入本地文件失败: %v", writeErr)
				fm.emitProgress(transfer)
				return
			}

			fm.mu.Lock()
			transfer.Transferred += int64(n)
			fm.mu.Unlock()

			// 每500ms更新一次进度
			if time.Since(lastUpdate) >= 500*time.Millisecond {
				fm.emitProgress(transfer)
				lastUpdate = time.Now()
			}
		}

		if err == io.EOF {
			break
		}
		if err != nil {
			transfer.Status = "failed"
			transfer.Error = fmt.Sprintf("读取远程文件失败: %v", err)
			fm.emitProgress(transfer)
			return
		}
	}

	log.Printf("[FileTransfer] ✅ 下载完成: %s -> %s (%d bytes)",
		transfer.RemotePath, transfer.LocalPath, transfer.Size)
}

// CancelTransfer 取消传输
func (fm *FileManager) CancelTransfer(transferID string) error {
	fm.mu.Lock()
	transfer, ok := fm.transfers[transferID]
	fm.mu.Unlock()

	if !ok {
		return fmt.Errorf("传输任务不存在")
	}

	if transfer.cancel != nil {
		transfer.cancel()
	}
	return nil
}

// GetTransferProgress 获取传输进度
func (fm *FileManager) GetTransferProgress(transferID string) (*TransferProgress, error) {
	fm.mu.RLock()
	transfer, ok := fm.transfers[transferID]
	fm.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("传输任务不存在")
	}

	return fm.buildProgress(transfer), nil
}

func (fm *FileManager) buildProgress(transfer *FileTransfer) *TransferProgress {
	percent := 0.0
	if transfer.Size > 0 {
		percent = float64(transfer.Transferred) / float64(transfer.Size) * 100
	}

	// 计算速度
	elapsed := time.Since(transfer.StartTime).Seconds()
	speed := int64(0)
	if elapsed > 0 {
		speed = int64(float64(transfer.Transferred) / elapsed)
	}

	return &TransferProgress{
		TransferID:  transfer.ID,
		Transferred: transfer.Transferred,
		Total:       transfer.Size,
		Percent:     percent,
		Speed:       speed,
		Status:      transfer.Status,
		Error:       transfer.Error,
	}
}

func (fm *FileManager) emitProgress(transfer *FileTransfer) {
	progress := fm.buildProgress(transfer)
	runtime.EventsEmit(fm.ctx, "file:progress:"+transfer.ID, progress)
}

// ListRemoteDir 列出远程目录内容
func (fm *FileManager) ListRemoteDir(sessionID, remotePath string) ([]RemoteFile, error) {
	// 获取SSH会话
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return nil, fmt.Errorf("会话不存在")
	}

	// 创建SFTP客户端
	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return nil, fmt.Errorf("创建SFTP客户端失败: %w", err)
	}
	defer sftpClient.Close()

	// 如果路径为空，使用当前工作目录
	if remotePath == "" {
		remotePath, err = sftpClient.Getwd()
		if err != nil {
			remotePath = "/"
		}
	}

	// 读取目录内容
	log.Printf("[FileManager] 读取目录: %s", remotePath)
	fileInfos, err := sftpClient.ReadDir(remotePath)
	if err != nil {
		return nil, fmt.Errorf("读取目录失败: %w", err)
	}

	// 转换为RemoteFile
	files := make([]RemoteFile, 0, len(fileInfos))
	for _, info := range fileInfos {
		// 使用 path.Join 而不是 filepath.Join，确保使用正斜杠
		fullPath := path.Join(remotePath, info.Name())
		// 清理路径，移除多余的斜杠
		fullPath = path.Clean(fullPath)
		log.Printf("[FileManager] 文件: %s -> %s (isDir: %v)", info.Name(), fullPath, info.IsDir())

		files = append(files, RemoteFile{
			Name:    info.Name(),
			Path:    fullPath,
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime().Unix(),
			IsDir:   info.IsDir(),
		})
	}

	return files, nil
}

// GetRemotePwd 获取远程当前工作目录
func (fm *FileManager) GetRemotePwd(sessionID string) (string, error) {
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return "", fmt.Errorf("会话不存在")
	}

	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return "", fmt.Errorf("创建SFTP客户端失败: %w", err)
	}
	defer sftpClient.Close()

	pwd, err := sftpClient.Getwd()
	if err != nil {
		return "/", nil // 默认返回根目录
	}
	return pwd, nil
}

// DeleteRemoteFile 删除远程文件或目录
func (fm *FileManager) DeleteRemoteFile(sessionID, remotePath string) error {
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return fmt.Errorf("会话不存在")
	}

	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return fmt.Errorf("创建SFTP客户端失败: %w", err)
	}
	defer sftpClient.Close()

	// 检查是否为目录
	info, err := sftpClient.Stat(remotePath)
	if err != nil {
		return fmt.Errorf("获取文件信息失败: %w", err)
	}

	if info.IsDir() {
		return sftpClient.RemoveDirectory(remotePath)
	}
	return sftpClient.Remove(remotePath)
}

// CreateRemoteDir 创建远程目录
func (fm *FileManager) CreateRemoteDir(sessionID, remotePath string) error {
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return fmt.Errorf("会话不存在")
	}

	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return fmt.Errorf("创建SFTP客户端失败: %w", err)
	}
	defer sftpClient.Close()

	return sftpClient.MkdirAll(remotePath)
}

// RenameRemoteFile 重命名远程文件或目录
func (fm *FileManager) RenameRemoteFile(sessionID, oldPath, newPath string) error {
	sess, ok := fm.tm.get(sessionID)
	if !ok {
		return fmt.Errorf("会话不存在")
	}

	sftpClient, err := sftp.NewClient(sess.client)
	if err != nil {
		return fmt.Errorf("创建SFTP客户端失败: %w", err)
	}
	defer sftpClient.Close()

	return sftpClient.Rename(oldPath, newPath)
}
