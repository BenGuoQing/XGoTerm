package store

import (
	"os"
	"path/filepath"
)

func homeDir() string {
	h, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return h
}

func BaseDir() string {
	return filepath.Join(homeDir(), "Documents", "XGoTerm")
}

func StorageDir() string { return filepath.Join(BaseDir(), "storage") }
func SessionsDir() string { return filepath.Join(BaseDir(), "sessions") }
func ExportsDir() string { return filepath.Join(BaseDir(), "exports") }
func LogsDir() string { return filepath.Join(BaseDir(), "logs") }

func EnsureDirs() error {
	dirs := []string{BaseDir(), StorageDir(), SessionsDir(), ExportsDir(), LogsDir()}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func MasterKeyPath() string { return filepath.Join(StorageDir(), "master.key.enc") }
func HostsPath() string     { return filepath.Join(StorageDir(), "hosts.enc.json") }
