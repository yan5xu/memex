package store

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Asset struct {
	Path     string `json:"path"`
	AbsPath  string `json:"abs_path"`
	Filename string `json:"filename"`
	Markdown string `json:"markdown"`
}

func ImportAsset(root string, reader io.Reader, filename string) (*Asset, error) {
	name := safeAssetName(filename)
	if name == "" {
		name = "asset"
	}
	assetDir, ok := safeRootJoin(root, "assets")
	if !ok {
		return nil, fmt.Errorf("invalid vault path")
	}
	if err := os.MkdirAll(assetDir, 0755); err != nil {
		return nil, err
	}
	target, rel := uniqueAssetPath(assetDir, name)
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(out, reader); err != nil {
		_ = out.Close()
		return nil, err
	}
	if err := out.Close(); err != nil {
		return nil, err
	}
	return &Asset{
		Path:     rel,
		AbsPath:  target,
		Filename: filepath.Base(target),
		Markdown: fmt.Sprintf("![%s](%s)", strings.TrimSuffix(filepath.Base(target), filepath.Ext(target)), rel),
	}, nil
}

func (s *Store) ImportAssetFile(path, name string) (*Asset, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if name == "" {
		name = filepath.Base(path)
	}
	return ImportAsset(s.Root, file, name)
}

func safeAssetName(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	value = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, value)
	value = strings.Trim(value, ".-")
	return value
}

func uniqueAssetPath(assetDir, name string) (string, string) {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 0; ; i++ {
		candidate := name
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d%s", base, i, ext)
		}
		target := filepath.Join(assetDir, candidate)
		if _, err := os.Stat(target); os.IsNotExist(err) {
			return target, filepath.ToSlash(filepath.Join("assets", candidate))
		}
	}
}

func safeRootJoin(root string, parts ...string) (string, bool) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	target, err := filepath.Abs(filepath.Join(append([]string{absRoot}, parts...)...))
	if err != nil {
		return "", false
	}
	if target != absRoot && !strings.HasPrefix(target, absRoot+string(os.PathSeparator)) {
		return "", false
	}
	return target, true
}
