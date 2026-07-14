package store

import (
	"testing"

	"github.com/yan5xu/memex/internal/domain"
)

func TestRefreshBodyNoOpPreservesLinksAndOperationLog(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("note"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("note", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("note", "note.target", "Target", nil); err != nil {
		t.Fatal(err)
	}
	body := "# Source\n\nMentions [[note.target]].\n"
	if _, err := s.CreateObjectWithBody("note", "note.source", "Source", nil, &body); err != nil {
		t.Fatal(err)
	}
	if err := s.RefreshBody("note.source"); err != nil {
		t.Fatal(err)
	}

	beforeLinks, err := s.Links("note.source")
	if err != nil {
		t.Fatal(err)
	}
	beforeOps := operationCount(t, s)
	var beforeUpdatedAt string
	if err := s.DB.QueryRow(`SELECT updated_at FROM objects WHERE id = ?`, "note.source").Scan(&beforeUpdatedAt); err != nil {
		t.Fatal(err)
	}

	if err := s.RefreshBody("note.source"); err != nil {
		t.Fatal(err)
	}

	afterLinks, err := s.Links("note.source")
	if err != nil {
		t.Fatal(err)
	}
	afterOps := operationCount(t, s)
	var afterUpdatedAt string
	if err := s.DB.QueryRow(`SELECT updated_at FROM objects WHERE id = ?`, "note.source").Scan(&afterUpdatedAt); err != nil {
		t.Fatal(err)
	}

	if len(beforeLinks) != 1 || len(afterLinks) != 1 || beforeLinks[0].ID != afterLinks[0].ID {
		t.Fatalf("expected no-op refresh to preserve body link identity, before=%#v after=%#v", beforeLinks, afterLinks)
	}
	if afterOps != beforeOps {
		t.Fatalf("expected no-op refresh not to append an operation, before=%d after=%d", beforeOps, afterOps)
	}
	if afterUpdatedAt != beforeUpdatedAt {
		t.Fatalf("expected no-op refresh to preserve updated_at, before=%q after=%q", beforeUpdatedAt, afterUpdatedAt)
	}
}

func TestRefreshBodyUpdatesLinkResolutionWithoutBodyChange(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("note"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("note", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	body := "# Source\n\nMentions [[note.target]].\n"
	if _, err := s.CreateObjectWithBody("note", "note.source", "Source", nil, &body); err != nil {
		t.Fatal(err)
	}
	if err := s.RefreshBody("note.source"); err != nil {
		t.Fatal(err)
	}
	beforeLinks, err := s.Links("note.source")
	if err != nil {
		t.Fatal(err)
	}
	if len(beforeLinks) != 1 || beforeLinks[0].Resolved {
		t.Fatalf("expected unresolved link before target creation, got %#v", beforeLinks)
	}
	beforeOps := operationCount(t, s)

	if _, err := s.CreateObject("note", "note.target", "Target", nil); err != nil {
		t.Fatal(err)
	}
	if err := s.RefreshBody("note.source"); err != nil {
		t.Fatal(err)
	}
	afterLinks, err := s.Links("note.source")
	if err != nil {
		t.Fatal(err)
	}
	if len(afterLinks) != 1 || !afterLinks[0].Resolved {
		t.Fatalf("expected refresh to resolve link after target creation, got %#v", afterLinks)
	}
	if operationCount(t, s) != beforeOps+2 {
		t.Fatal("expected target creation and changed refresh to be recorded")
	}
}

func operationCount(t *testing.T, s *Store) int {
	t.Helper()
	var count int
	if err := s.DB.QueryRow(`SELECT count(*) FROM ops`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
