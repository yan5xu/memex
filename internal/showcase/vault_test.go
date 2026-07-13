package showcase_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/yan5xu/memex/internal/app"
	"github.com/yan5xu/memex/internal/showcase"
	"github.com/yan5xu/memex/internal/store"
)

func TestEnsureSeedsCompleteVaultAndPreservesEdits(t *testing.T) {
	root := filepath.Join(t.TempDir(), "showcase")
	created, err := showcase.Ensure(root)
	if err != nil {
		t.Fatalf("ensure showcase: %v", err)
	}
	if !created {
		t.Fatal("first ensure should create the showcase")
	}

	s, err := store.Open(root)
	if err != nil {
		t.Fatalf("open showcase: %v", err)
	}
	types, err := s.ListTypes()
	if err != nil {
		t.Fatalf("list types: %v", err)
	}
	if len(types) != 5 {
		t.Fatalf("types = %d, want 5", len(types))
	}
	obj, err := s.GetObject("workspace.memex")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if obj.Title != "Memex Showcase" {
		t.Fatalf("workspace title = %q", obj.Title)
	}
	links, err := s.Links(obj.ID)
	if err != nil {
		t.Fatalf("workspace links: %v", err)
	}
	if len(links) < 6 {
		t.Fatalf("workspace links = %d, want at least 6", len(links))
	}
	issues, err := s.Issues()
	if err != nil {
		t.Fatalf("issues: %v", err)
	}
	if len(issues) != 0 {
		t.Fatalf("issues = %d, want 0", len(issues))
	}
	_ = s.Close()

	if _, err := os.Stat(filepath.Join(root, "assets", "memex-workspace.png")); err != nil {
		t.Fatalf("showcase asset: %v", err)
	}
	result := app.NewRunner(root).Run(context.Background(), []string{"graph", "view", "validate"})
	if !result.OK {
		t.Fatalf("graph view validation: %+v", result.Error)
	}

	bodyPath := filepath.Join(root, "bodies", "note.start-here.md")
	const edited = "# My edited welcome\n"
	if err := os.WriteFile(bodyPath, []byte(edited), 0644); err != nil {
		t.Fatalf("edit body: %v", err)
	}
	created, err = showcase.Ensure(root)
	if err != nil {
		t.Fatalf("ensure existing showcase: %v", err)
	}
	if created {
		t.Fatal("existing showcase should not be recreated")
	}
	data, err := os.ReadFile(bodyPath)
	if err != nil {
		t.Fatalf("read edited body: %v", err)
	}
	if string(data) != edited {
		t.Fatalf("existing body was overwritten: %q", data)
	}
}
