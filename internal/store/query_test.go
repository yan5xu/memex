package store

import (
	"testing"

	"github.com/yan5xu/mbase/internal/domain"
)

func TestQueryWhereMatchesRefAndRefListIDs(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("company"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("company", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("company", "company.aisa", "AIsa", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("company", "company.other", "Other", nil); err != nil {
		t.Fatal(err)
	}

	if err := s.CreateType("source.item"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("source.item", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("source.item", "about_company", domain.FieldRef, false, false, nil, "company"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("source.item", "source.website.aisa-home", "AIsa home", map[string]string{"about_company": "company.aisa"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("source.item", "source.website.other", "Other site", map[string]string{"about_company": "company.other"}); err != nil {
		t.Fatal(err)
	}

	refResult, err := s.Query("source.item", QueryOptions{Where: []string{"about_company=company.aisa"}})
	if err != nil {
		t.Fatal(err)
	}
	if refResult.Count != 1 || refResult.Rows[0]["id"] != "source.website.aisa-home" {
		t.Fatalf("expected ref where to match source.website.aisa-home, got %#v", refResult.Rows)
	}

	if err := s.CreateType("note"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("note", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("note", "about_company", domain.FieldRefList, false, false, nil, "company"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("note", "note.aisa", "AIsa note", map[string]string{"about_company": "company.aisa,company.other"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("note", "note.other", "Other note", map[string]string{"about_company": "company.other"}); err != nil {
		t.Fatal(err)
	}

	refListResult, err := s.Query("note", QueryOptions{Where: []string{"about_company=company.aisa"}})
	if err != nil {
		t.Fatal(err)
	}
	if refListResult.Count != 1 || refListResult.Rows[0]["id"] != "note.aisa" {
		t.Fatalf("expected ref_list where to match note.aisa, got %#v", refListResult.Rows)
	}

	notEqualResult, err := s.Query("note", QueryOptions{Where: []string{"about_company!=company.aisa"}})
	if err != nil {
		t.Fatal(err)
	}
	if notEqualResult.Count != 1 || notEqualResult.Rows[0]["id"] != "note.other" {
		t.Fatalf("expected ref_list != where to exclude note.aisa, got %#v", notEqualResult.Rows)
	}
}
