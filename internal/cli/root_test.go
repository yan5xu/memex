package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yan5xu/memex/internal/store"
)

func TestCommandPrefixUsesMMXCommandName(t *testing.T) {
	rootDir = "/tmp/example-vault"
	if got := commandPrefix(); !strings.HasPrefix(got, "mmx -C ") {
		t.Fatalf("command prefix does not start with mmx: %q", got)
	}
}

func TestHelpFlagIsDetectedAfterPreprocess(t *testing.T) {
	rootDir = "."
	rootDirExplicit = false
	jsonOut = false
	jsonFields = nil
	jqExpr = ""

	argv, err := preprocess([]string{"-C", "/tmp/example-vault", "source", "add", "--help"})
	if err != nil {
		t.Fatal(err)
	}
	if rootDir != "/tmp/example-vault" {
		t.Fatalf("expected rootDir to be set, got %q", rootDir)
	}
	if !hasHelpArg(argv) {
		t.Fatalf("expected --help to be detected in %#v", argv)
	}
}

func TestResolveServeRootUsesExistingCurrentVault(t *testing.T) {
	root := t.TempDir()
	t.Setenv("MEMEX_SHOWCASE_VAULT", filepath.Join(t.TempDir(), "showcase"))
	if err := os.MkdirAll(filepath.Join(root, filepath.Dir(store.DBPath)), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, store.DBPath), []byte("db"), 0644); err != nil {
		t.Fatal(err)
	}
	got, err := resolveServeRoot(root, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != root {
		t.Fatalf("root = %q, want %q", got, root)
	}
}

func TestResolveServeRootCreatesShowcaseForUnconfiguredServer(t *testing.T) {
	showcaseRoot := filepath.Join(t.TempDir(), "showcase")
	t.Setenv("MEMEX_SHOWCASE_VAULT", showcaseRoot)
	got, err := resolveServeRoot(filepath.Join(t.TempDir(), "not-a-vault"), false)
	if err != nil {
		t.Fatal(err)
	}
	if got != showcaseRoot {
		t.Fatalf("root = %q, want %q", got, showcaseRoot)
	}
	if _, err := os.Stat(filepath.Join(got, store.DBPath)); err != nil {
		t.Fatalf("showcase db: %v", err)
	}
}

func TestResolveServeRootPreservesExplicitMissingVault(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing")
	showcaseRoot := filepath.Join(t.TempDir(), "showcase")
	t.Setenv("MEMEX_SHOWCASE_VAULT", showcaseRoot)
	got, err := resolveServeRoot(root, true)
	if err != nil {
		t.Fatal(err)
	}
	if got != root {
		t.Fatalf("root = %q, want %q", got, root)
	}
	if _, err := os.Stat(filepath.Join(showcaseRoot, store.DBPath)); err != nil {
		t.Fatalf("showcase db: %v", err)
	}
}
