package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestImportAssetPreservesRelativeDirectory(t *testing.T) {
	root := t.TempDir()
	asset, err := ImportAsset(root, strings.NewReader("image-data"), "raft/screenshots/hero image.png")
	if err != nil {
		t.Fatalf("import asset: %v", err)
	}

	wantPath := "assets/raft/screenshots/hero-image.png"
	if asset.Path != wantPath {
		t.Fatalf("path = %q, want %q", asset.Path, wantPath)
	}
	if asset.Filename != "hero-image.png" {
		t.Fatalf("filename = %q", asset.Filename)
	}
	if asset.Markdown != "![hero-image](assets/raft/screenshots/hero-image.png)" {
		t.Fatalf("markdown = %q", asset.Markdown)
	}
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(wantPath)))
	if err != nil {
		t.Fatalf("read imported asset: %v", err)
	}
	if string(data) != "image-data" {
		t.Fatalf("content = %q", data)
	}
}

func TestImportAssetUniquifiesWithinRelativeDirectory(t *testing.T) {
	root := t.TempDir()
	if _, err := ImportAsset(root, strings.NewReader("first"), "raft/hero.png"); err != nil {
		t.Fatalf("first import: %v", err)
	}
	asset, err := ImportAsset(root, strings.NewReader("second"), "raft/hero.png")
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if asset.Path != "assets/raft/hero-1.png" {
		t.Fatalf("path = %q", asset.Path)
	}
}

func TestImportAssetRejectsEscapingNames(t *testing.T) {
	for _, name := range []string{"../secret.png", "raft/../../secret.png", "/tmp/secret.png"} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			if _, err := ImportAsset(root, strings.NewReader("secret"), name); err == nil {
				t.Fatalf("expected %q to be rejected", name)
			}
		})
	}
}
