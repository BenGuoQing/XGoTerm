package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"golang.org/x/crypto/argon2"
	"golang.org/x/sys/windows/registry"
)

type kdfParams struct {
	Name    string `json:"name"`
	Salt    string `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
}

type cipherParams struct {
	Name  string `json:"name"`
	Nonce string `json:"nonce"`
}

type masterFile struct {
	Version    int          `json:"version"`
	KDF        kdfParams    `json:"kdf"`
	Cipher     cipherParams `json:"cipher"`
	Ciphertext string       `json:"ciphertext"`
}

// deviceSecret collects stable identifiers for local derivation
func deviceSecret() ([]byte, error) {
	// MachineGuid from registry
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\\Microsoft\\Cryptography`, registry.QUERY_VALUE)
	if err != nil {
		return nil, err
	}
	defer k.Close()
	guid, _, err := k.GetStringValue("MachineGuid")
	if err != nil {
		return nil, err
	}
	user := os.Getenv("USERNAME")
	computer := os.Getenv("COMPUTERNAME")
	return []byte(fmt.Sprintf("%s|%s|%s", guid, computer, user)), nil
}

// derive device-bound key using argon2id
func deriveDeviceKey(secret []byte, kp kdfParams) ([]byte, error) {
	if kp.Name != "argon2id" {
		return nil, errors.New("unsupported kdf")
	}
	salt, err := base64.StdEncoding.DecodeString(kp.Salt)
	if err != nil {
		return nil, err
	}
	key := argon2.IDKey(secret, salt, kp.Time, kp.Memory, kp.Threads, 32)
	return key, nil
}

// LoadOrCreateMasterKey loads master key, or creates a new one if missing
func LoadOrCreateMasterKey() ([]byte, error) {
	if err := EnsureDirs(); err != nil {
		return nil, err
	}
	path := MasterKeyPath()
	if _, err := os.Stat(path); err == nil {
		return LoadMasterKey()
	}
	mk := make([]byte, 32)
	if _, err := rand.Read(mk); err != nil {
		return nil, err
	}
	if err := SaveMasterKey(mk); err != nil {
		return nil, err
	}
	return mk, nil
}

func SaveMasterKey(master []byte) error {
	sec, err := deviceSecret()
	if err != nil {
		return err
	}
	// KDF params
	kp := kdfParams{
		Name:    "argon2id",
		Time:    3,
		Memory:  64 * 1024,
		Threads: 1,
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	kp.Salt = base64.StdEncoding.EncodeToString(salt)
	devKey, err := deriveDeviceKey(sec, kp)
	if err != nil {
		return err
	}
	// Encrypt master into masterFile envelope
	pt := struct{ MasterKey string `json:"master_key"` }{MasterKey: base64.StdEncoding.EncodeToString(master)}
	// Build cipher envelope manually to inject KDF
	cipherBlob, nonce, err := aesGCMEncrypt(devKey, pt)
	if err != nil {
		return err
	}
	mf := masterFile{Version: 1}
	mf.KDF = kp
	mf.Cipher = cipherParams{Name: "aes-256-gcm", Nonce: base64.StdEncoding.EncodeToString(nonce)}
	mf.Ciphertext = base64.StdEncoding.EncodeToString(cipherBlob)
	b, err := json.MarshalIndent(&mf, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(MasterKeyPath(), b, 0o600)
}

func LoadMasterKey() ([]byte, error) {
	b, err := os.ReadFile(MasterKeyPath())
	if err != nil {
		return nil, err
	}
	var mf masterFile
	if err := json.Unmarshal(b, &mf); err != nil {
		return nil, err
	}
	if mf.Version != 1 {
		return nil, errors.New("unsupported version")
	}
	sec, err := deviceSecret()
	if err != nil {
		return nil, err
	}
	devKey, err := deriveDeviceKey(sec, mf.KDF)
	if err != nil {
		return nil, err
	}
	ct, err := base64.StdEncoding.DecodeString(mf.Ciphertext)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.StdEncoding.DecodeString(mf.Cipher.Nonce)
	if err != nil {
		return nil, err
	}
	var pt struct{ MasterKey string `json:"master_key"` }
	if err := aesGCMDecrypt(devKey, ct, nonce, &pt); err != nil {
		return nil, err
	}
	mk, err := base64.StdEncoding.DecodeString(pt.MasterKey)
	if err != nil {
		return nil, err
	}
	if len(mk) != 32 {
		return nil, errors.New("invalid master key length")
	}
	return mk, nil
}

// lightweight AES-GCM helpers encoding JSON payload
func aesGCMEncrypt(key []byte, payload any) (ciphertext []byte, nonce []byte, err error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	n := make([]byte, aead.NonceSize())
	if _, err := rand.Read(n); err != nil {
		return nil, nil, err
	}
	ct := aead.Seal(nil, n, b, nil)
	return ct, n, nil
}

func aesGCMDecrypt(key []byte, ciphertext []byte, nonce []byte, out any) error {
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	pt, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(pt, out)
}
