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

func TestUpsertObjectWithBodyCreatesAndUpdates(t *testing.T) {
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
	if _, err := s.AddField("company", "status", domain.FieldEnum, false, false, []string{"active", "archived"}, ""); err != nil {
		t.Fatal(err)
	}

	body := "# Acme\n"
	obj, created, err := s.UpsertObjectWithBody("company", "company.acme", "Acme", map[string]string{"title": "Acme", "status": "active"}, &body)
	if err != nil {
		t.Fatal(err)
	}
	if !created || obj.ID != "company.acme" {
		t.Fatalf("expected create, got created=%v obj=%#v", created, obj)
	}

	updatedBody := "# Acme Updated\n"
	obj, created, err = s.UpsertObjectWithBody("company", "company.acme", "Acme Updated", map[string]string{"status": "archived"}, &updatedBody)
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Fatal("expected update, got create")
	}
	if obj.Title != "Acme Updated" || obj.Fields["status"] != "archived" {
		t.Fatalf("expected updated object, got %#v", obj)
	}
	readBody, err := s.ReadBody("company.acme")
	if err != nil {
		t.Fatal(err)
	}
	if readBody != updatedBody {
		t.Fatalf("expected body %q, got %q", updatedBody, readBody)
	}
}

func TestFilteredLinksMatchesTypeKindRelationAndText(t *testing.T) {
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
	if _, err := s.CreateObject("company", "company.acme", "Acme", nil); err != nil {
		t.Fatal(err)
	}

	if err := s.CreateType("person"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("person", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("person", "person.ada", "Ada", nil); err != nil {
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
	if _, err := s.AddField("source.item", "about_person", domain.FieldRef, false, false, nil, "person"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("source.item", "source.launch", "Launch", map[string]string{"about_company": "company.acme", "about_person": "person.ada"}); err != nil {
		t.Fatal(err)
	}

	companyBacklinks, err := s.FilteredLinks("company.acme", true, LinkFilterOptions{Type: "source.item", Kind: "field", Relation: "about_company", Filter: "launch"})
	if err != nil {
		t.Fatal(err)
	}
	if len(companyBacklinks) != 1 || companyBacklinks[0].FromID != "source.launch" {
		t.Fatalf("expected source.launch backlink, got %#v", companyBacklinks)
	}

	personBacklinks, err := s.FilteredLinks("company.acme", true, LinkFilterOptions{Type: "person"})
	if err != nil {
		t.Fatal(err)
	}
	if len(personBacklinks) != 0 {
		t.Fatalf("expected no person backlinks, got %#v", personBacklinks)
	}
}

func TestRevalidateAllClearsStaleBrokenBodyLinkAfterTargetCreated(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("source.item"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("source.item", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	body := "# Source\n\nMentions [[person.ada]].\n"
	if _, err := s.CreateObjectWithBody("source.item", "source.ada-profile", "Ada profile", map[string]string{"title": "Ada profile"}, &body); err != nil {
		t.Fatal(err)
	}
	if err := s.RefreshBody("source.ada-profile"); err != nil {
		t.Fatal(err)
	}
	if err := s.RevalidateAll(); err != nil {
		t.Fatal(err)
	}
	issues, err := s.Issues()
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 1 || issues[0].Kind != "broken_link" {
		t.Fatalf("expected one broken_link before target exists, got %#v", issues)
	}

	if err := s.CreateType("person"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("person", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("person", "person.ada", "Ada", nil); err != nil {
		t.Fatal(err)
	}
	if err := s.RevalidateAll(); err != nil {
		t.Fatal(err)
	}
	issues, err = s.Issues()
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 0 {
		t.Fatalf("expected stale broken_link to clear after target exists, got %#v", issues)
	}
	links, err := s.Links("source.ada-profile")
	if err != nil {
		t.Fatal(err)
	}
	if len(links) != 1 || !links[0].Resolved {
		t.Fatalf("expected body link resolved flag to be refreshed, got %#v", links)
	}
}
