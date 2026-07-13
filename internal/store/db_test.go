package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInitUsesMemexStoragePath(t *testing.T) {
	if DBPath != ".memex/memex.db" {
		t.Fatalf("unexpected database path %q", DBPath)
	}
	root := t.TempDir()
	s, err := Init(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, DBPath)); err != nil {
		t.Fatalf("expected database at %s: %v", DBPath, err)
	}
}

func TestOpenWithRelativeRootUsesAbsoluteSQLitePath(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "vault")
	s, err := Init(root)
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsAbs(s.Root) {
		t.Fatalf("expected init root to be absolute, got %q", s.Root)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd: %v", err)
		}
	})
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}

	s, err = Open(".")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if !filepath.IsAbs(s.Root) {
		t.Fatalf("expected open root to be absolute, got %q", s.Root)
	}
	if _, err := s.Issues(); err != nil {
		t.Fatalf("relative root query failed: %v", err)
	}
}
