package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
)

type envelope struct {
	Version int `json:"version"`
	Cipher  struct {
		Name  string `json:"name"`
		Nonce string `json:"nonce"`
	} `json:"cipher"`
	Ciphertext string `json:"ciphertext"`
}

func encryptJSON(key []byte, plaintext any) ([]byte, error) {
	b, err := json.Marshal(plaintext)
	if err != nil { return nil, err }
	block, err := aes.NewCipher(key)
	if err != nil { return nil, err }
	aead, err := cipher.NewGCM(block)
	if err != nil { return nil, err }
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil { return nil, err }
	ct := aead.Seal(nil, nonce, b, nil)
	env := envelope{Version: 1}
	env.Cipher.Name = "aes-256-gcm"
	env.Cipher.Nonce = base64.StdEncoding.EncodeToString(nonce)
	env.Ciphertext = base64.StdEncoding.EncodeToString(ct)
	return json.Marshal(env)
}

func decryptJSON(key []byte, data []byte, out any) error {
	var env envelope
	if err := json.Unmarshal(data, &env); err != nil { return err }
	if env.Version != 1 { return errors.New("unsupported version") }
	if env.Cipher.Name != "aes-256-gcm" { return errors.New("unsupported cipher") }
	nonce, err := base64.StdEncoding.DecodeString(env.Cipher.Nonce)
	if err != nil { return err }
	ct, err := base64.StdEncoding.DecodeString(env.Ciphertext)
	if err != nil { return err }
	block, err := aes.NewCipher(key)
	if err != nil { return err }
	aead, err := cipher.NewGCM(block)
	if err != nil { return err }
	pt, err := aead.Open(nil, nonce, ct, nil)
	if err != nil { return err }
	return json.Unmarshal(pt, out)
}

// EncryptJSON is an exported wrapper for encryptJSON
func EncryptJSON(key []byte, plaintext any) ([]byte, error) { return encryptJSON(key, plaintext) }
// DecryptJSON is an exported wrapper for decryptJSON
func DecryptJSON(key []byte, data []byte, out any) error { return decryptJSON(key, data, out) }
