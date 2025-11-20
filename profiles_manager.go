package main

import (
    "context"
    "errors"
    "os"
    "sort"
    "strings"
    "time"
    "encoding/base64"
    "encoding/json"

    "github.com/google/uuid"
    "xgoterm/internal/store"
    "golang.org/x/crypto/argon2"
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "io"
)

// AuthInfo holds authentication data for a host profile
type AuthInfo struct {
    Type       string `json:"type"` // password | key
    Password   string `json:"password,omitempty"`
    KeyPEM     string `json:"key_pem,omitempty"`
    Passphrase string `json:"passphrase,omitempty"`
}

type HostProfile struct {
    ID           string `json:"id"`
    Name         string `json:"name"`
    Host         string `json:"host"`
    Port         int    `json:"port"`
    Username     string `json:"username"`
    Auth         AuthInfo `json:"auth"`
    KeepAliveSec int    `json:"keepAliveSec,omitempty"`
    TimeoutSec   int    `json:"timeoutSec,omitempty"`
    Cols         int    `json:"cols,omitempty"`
    Rows         int    `json:"rows,omitempty"`
    // optional proxyjump fields
    GatewayHost string `json:"gatewayHost,omitempty"`
    GatewayPort int    `json:"gatewayPort,omitempty"`
    GatewayUser string `json:"gatewayUser,omitempty"`
    GatewayAuth string `json:"gatewayAuth,omitempty"`
    GatewayPassword string `json:"gatewayPassword,omitempty"`
    GatewayKeyPEM string `json:"gatewayKeyPEM,omitempty"`
    GatewayPassphrase string `json:"gatewayPassphrase,omitempty"`
	Tags         []string `json:"tags,omitempty"`
	Notes        string   `json:"notes,omitempty"`
	UpdatedAt    string   `json:"updated_at"`
}

func (pm *ProfilesManager) GetProfile(id string) (HostProfile, error) {
    var empty HostProfile
    path := store.HostsPath()
    b, err := os.ReadFile(path)
    if err != nil { return empty, err }
    var hf hostsFile
    if err := store.DecryptJSON(pm.masterKey, b, &hf); err != nil { return empty, err }
    for _, h := range hf.Hosts { if h.ID == id { return h, nil } }
    return empty, errors.New("not found")
}

func (pm *ProfilesManager) DeleteProfile(id string) error {
    path := store.HostsPath()
    b, err := os.ReadFile(path)
    if err != nil { return err }
    var hf hostsFile
    if err := store.DecryptJSON(pm.masterKey, b, &hf); err != nil { return err }
    out := make([]HostProfile, 0, len(hf.Hosts))
    for _, h := range hf.Hosts { if h.ID != id { out = append(out, h) } }
    hf.Hosts = out
    hf.UpdatedAt = time.Now().Format(time.RFC3339)
    enc, err := store.EncryptJSON(pm.masterKey, hf)
    if err != nil { return err }
    return os.WriteFile(path, enc, 0o600)
}

// Export profiles to a passphrase-protected .xgth file
type kdfParams2 struct {
    Name string `json:"name"`
    Salt string `json:"salt"`
    Time uint32 `json:"time"`
    Memory uint32 `json:"memory"`
    Threads uint8 `json:"threads"`
}
type cipherParams2 struct {
    Name string `json:"name"`
    Nonce string `json:"nonce"`
}
type exportFile struct {
    Version int `json:"version"`
    Schema  string `json:"schema"`
    KDF     kdfParams2 `json:"kdf"`
    Cipher  cipherParams2 `json:"cipher"`
    Ciphertext string `json:"ciphertext"`
}

func (pm *ProfilesManager) ExportProfiles(path string, passphrase string) error {
    // read hosts
    profiles, err := pm.ListProfiles()
    if err != nil { return err }
    hf := hostsFile{Schema: "xgoterm_hosts@1", UpdatedAt: time.Now().Format(time.RFC3339), Hosts: profiles}
    data, err := json.Marshal(hf)
    if err != nil { return err }
    // derive key
    kp := kdfParams2{Name: "argon2id", Time: 3, Memory: 64*1024, Threads: 1}
    salt := make([]byte, 16)
    if _, err := rand.Read(salt); err != nil { return err }
    kp.Salt = base64.StdEncoding.EncodeToString(salt)
    key := argon2.IDKey([]byte(passphrase), salt, kp.Time, kp.Memory, kp.Threads, 32)
    // encrypt
    block, err := aes.NewCipher(key)
    if err != nil { return err }
    aead, err := cipher.NewGCM(block)
    if err != nil { return err }
    nonce := make([]byte, aead.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil { return err }
    ct := aead.Seal(nil, nonce, data, nil)
    ef := exportFile{Version:1, Schema: "xgoterm_export@1", KDF: kp, Cipher: cipherParams2{Name:"aes-256-gcm", Nonce: base64.StdEncoding.EncodeToString(nonce)}, Ciphertext: base64.StdEncoding.EncodeToString(ct)}
    out, err := json.MarshalIndent(&ef, "", "  ")
    if err != nil { return err }
    return os.WriteFile(path, out, 0o600)
}

// Import profiles from .xgth, merging into current list
func (pm *ProfilesManager) ImportProfiles(path string, passphrase string) (int, error) {
    b, err := os.ReadFile(path)
    if err != nil { return 0, err }
    var ef exportFile
    if err := json.Unmarshal(b, &ef); err != nil { return 0, err }
    if ef.Version != 1 || ef.Schema == "" { return 0, errors.New("invalid export file") }
    if ef.KDF.Name != "argon2id" || ef.Cipher.Name != "aes-256-gcm" { return 0, errors.New("unsupported export") }
    salt, err := base64.StdEncoding.DecodeString(ef.KDF.Salt)
    if err != nil { return 0, err }
    key := argon2.IDKey([]byte(passphrase), salt, ef.KDF.Time, ef.KDF.Memory, ef.KDF.Threads, 32)
    nonce, err := base64.StdEncoding.DecodeString(ef.Cipher.Nonce)
    if err != nil { return 0, err }
    ct, err := base64.StdEncoding.DecodeString(ef.Ciphertext)
    if err != nil { return 0, err }
    block, err := aes.NewCipher(key)
    if err != nil { return 0, err }
    aead, err := cipher.NewGCM(block)
    if err != nil { return 0, err }
    pt, err := aead.Open(nil, nonce, ct, nil)
    if err != nil { return 0, err }
    var in hostsFile
    if err := json.Unmarshal(pt, &in); err != nil { return 0, err }
    // merge into current
    pathLocal := store.HostsPath()
    var curr hostsFile
    if _, err := os.Stat(pathLocal); err == nil {
        if b2, err := os.ReadFile(pathLocal); err == nil {
            _ = store.DecryptJSON(pm.masterKey, b2, &curr)
        }
    } else {
        curr.Schema = "xgoterm_hosts@1"
    }
    // merge by ID; if ID empty or duplicate name/host/user/port, create new UUID
    added := 0
    exist := map[string]bool{}
    for _, h := range curr.Hosts { exist[h.ID] = true }
    for _, p := range in.Hosts {
        if p.ID == "" || exist[p.ID] {
            p.ID = uuid.NewString()
        }
        exist[p.ID] = true
        curr.Hosts = append(curr.Hosts, p)
        added++
    }
    curr.UpdatedAt = time.Now().Format(time.RFC3339)
    enc, err := store.EncryptJSON(pm.masterKey, curr)
    if err != nil { return 0, err }
    if err := os.WriteFile(pathLocal, enc, 0o600); err != nil { return 0, err }
    return added, nil
}

type hostsFile struct {
	Schema    string        `json:"schema"`
	UpdatedAt string        `json:"updated_at"`
	Hosts     []HostProfile `json:"hosts"`
}

type ProfilesManager struct {
	ctx       context.Context
	masterKey []byte
}

func NewProfilesManager() *ProfilesManager { return &ProfilesManager{} }

func (pm *ProfilesManager) startup(ctx context.Context) {
	pm.ctx = ctx
	_ = store.EnsureDirs()
	mk, _ := store.LoadOrCreateMasterKey()
	pm.masterKey = mk
}

// Paths exposes standard directories for frontend convenience
func (pm *ProfilesManager) Paths() map[string]string {
    return map[string]string{
        "base":     store.BaseDir(),
        "storage":  store.StorageDir(),
        "sessions": store.SessionsDir(),
        "exports":  store.ExportsDir(),
        "logs":     store.LogsDir(),
    }
}

func (pm *ProfilesManager) ListProfiles() ([]HostProfile, error) {
	_ = store.EnsureDirs()
	path := store.HostsPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return []HostProfile{}, nil
	}
	b, err := os.ReadFile(path)
	if err != nil { return nil, err }
	var hf hostsFile
	if err := store.DecryptJSON(pm.masterKey, b, &hf); err != nil { return nil, err }
	// sort by name then updated desc
	sort.SliceStable(hf.Hosts, func(i, j int) bool {
		if strings.EqualFold(hf.Hosts[i].Name, hf.Hosts[j].Name) {
			return hf.Hosts[i].UpdatedAt > hf.Hosts[j].UpdatedAt
		}
		return strings.ToLower(hf.Hosts[i].Name) < strings.ToLower(hf.Hosts[j].Name)
	})
	return hf.Hosts, nil
}

func (pm *ProfilesManager) SaveProfile(p HostProfile) (string, error) {
	if p.Host == "" || p.Username == "" { return "", errors.New("host/username required") }
	if p.Port == 0 { p.Port = 22 }
	if p.Name == "" { p.Name = p.Host }
	if p.ID == "" { p.ID = uuid.NewString() }
	p.UpdatedAt = time.Now().Format(time.RFC3339)
	// read existing
	path := store.HostsPath()
	var hf hostsFile
	if _, err := os.Stat(path); err == nil {
		b, err := os.ReadFile(path)
		if err != nil { return "", err }
		if err := store.DecryptJSON(pm.masterKey, b, &hf); err != nil { return "", err }
	} else {
		hf.Schema = "xgoterm_hosts@1"
	}
	// upsert by ID
	found := false
	for i := range hf.Hosts {
		if hf.Hosts[i].ID == p.ID {
			hf.Hosts[i] = p
			found = true
			break
		}
	}
	if !found { hf.Hosts = append(hf.Hosts, p) }
	hf.UpdatedAt = p.UpdatedAt
	// encrypt write
	enc, err := store.EncryptJSON(pm.masterKey, hf)
	if err != nil { return "", err }
	if err := os.WriteFile(path, enc, 0o600); err != nil { return "", err }
	return p.ID, nil
}
