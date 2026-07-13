package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yan5xu/memex/internal/domain"
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

func TestQueryWhereStripsQuotedValues(t *testing.T) {
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
	if _, err := s.AddField("company", "website", domain.FieldURL, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("company", "platform", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("company", "company.skywork", "Skywork", map[string]string{
		"website":  "https://skywork.ai/?a=1&b=2",
		"platform": "Product Hunt",
	}); err != nil {
		t.Fatal(err)
	}

	result, err := s.Query("company", QueryOptions{Where: []string{`website = "https://skywork.ai/?a=1&b=2"`}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 || result.Rows[0]["id"] != "company.skywork" {
		t.Fatalf("expected quoted URL where to match company.skywork, got %#v", result.Rows)
	}

	result, err = s.Query("company", QueryOptions{Where: []string{`platform contains 'Product'`}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 || result.Rows[0]["id"] != "company.skywork" {
		t.Fatalf("expected single-quoted contains where to match company.skywork, got %#v", result.Rows)
	}
}

func TestEnumValidationErrorListsAllowedValues(t *testing.T) {
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
	if _, err := s.AddField("company", "status", domain.FieldEnum, false, false, []string{"active", "archived", "ignored"}, ""); err != nil {
		t.Fatal(err)
	}

	_, err = s.CreateObject("company", "company.acme", "Acme", map[string]string{"status": "draft"})
	if err == nil {
		t.Fatal("expected invalid enum value error")
	}
	if !strings.Contains(err.Error(), `invalid enum value "draft"`) || !strings.Contains(err.Error(), "allowed: active, archived, ignored") {
		t.Fatalf("expected allowed enum values in error, got %q", err.Error())
	}
	bodyPath := filepath.Join(s.Root, "bodies", "company.acme.md")
	if _, statErr := os.Stat(bodyPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected failed create to leave no body file at %s, statErr=%v", bodyPath, statErr)
	}
}

func TestCreateObjectCleansBodyWhenTransactionFails(t *testing.T) {
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
	if _, err := s.AddField("company", "slug", domain.FieldText, false, true, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObject("company", "company.acme", "Acme", map[string]string{"slug": "acme"}); err != nil {
		t.Fatal(err)
	}

	body := "# Duplicate\n"
	_, err = s.CreateObjectWithBody("company", "company.duplicate", "Duplicate", map[string]string{"slug": "acme"}, &body)
	if err == nil {
		t.Fatal("expected unique constraint error")
	}
	bodyPath := filepath.Join(s.Root, "bodies", "company.duplicate.md")
	if _, statErr := os.Stat(bodyPath); !os.IsNotExist(statErr) {
		t.Fatalf("expected failed transaction to remove body file at %s, statErr=%v", bodyPath, statErr)
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

func TestObjectTitleDerivesFromNameForCreateUpsertAndSet(t *testing.T) {
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
	if _, err := s.AddField("company", "name", domain.FieldText, true, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("company", "status", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}

	obj, err := s.CreateObjectWithBody("company", "company.acme", "", map[string]string{"name": "Acme"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if obj.Title != "Acme" || obj.Fields["title"] != "Acme" {
		t.Fatalf("expected title derived from name and synced to title field, got %#v", obj)
	}

	if _, err := s.DB.Exec(`UPDATE objects SET title = '' WHERE id = 'company.acme'`); err != nil {
		t.Fatal(err)
	}
	obj, created, err := s.UpsertObjectWithBody("company", "company.acme", "", map[string]string{"status": "active"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if created || obj.Title != "Acme" || obj.Fields["title"] != "Acme" {
		t.Fatalf("expected upsert to backfill empty object title from existing name, created=%v obj=%#v", created, obj)
	}

	if _, err := s.DB.Exec(`UPDATE objects SET title = '' WHERE id = 'company.acme'`); err != nil {
		t.Fatal(err)
	}
	if err := s.SetField("company.acme", "name", "Acme Labs"); err != nil {
		t.Fatal(err)
	}
	obj, err = s.GetObject("company.acme")
	if err != nil {
		t.Fatal(err)
	}
	if obj.Title != "Acme Labs" || obj.Fields["title"] != "Acme Labs" {
		t.Fatalf("expected set name to fill empty object title and title field, got %#v", obj)
	}
}

func TestObjectTitleWorksWithoutTitleField(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("batch"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("batch", "code", domain.FieldText, true, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	obj, err := s.CreateObjectWithBody("batch", "batch.yc-p26", "YC P26", map[string]string{"code": "P26"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if obj.Title != "YC P26" {
		t.Fatalf("expected core title without title schema field, got %#v", obj)
	}
	if err := s.SetField("batch.yc-p26", "title", "YC P26 Updated"); err != nil {
		t.Fatal(err)
	}
	obj, err = s.GetObject("batch.yc-p26")
	if err != nil {
		t.Fatal(err)
	}
	if obj.Title != "YC P26 Updated" {
		t.Fatalf("expected object set title to update core title without schema field, got %#v", obj)
	}
	obj, created, err := s.UpsertObjectWithBody("batch", "batch.yc-p26", "YC P26 Final", map[string]string{"code": "P26"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if created || obj.Title != "YC P26 Final" {
		t.Fatalf("expected upsert title to update core title without schema field, created=%v obj=%#v", created, obj)
	}
}

func TestQueryTitleUsesObjectTitleOverFieldTitle(t *testing.T) {
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
	if _, err := s.CreateObjectWithBody("company", "company.acme", "Object Title", nil, nil); err != nil {
		t.Fatal(err)
	}
	fd, err := s.GetField("company", "title")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := s.DB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if err := s.setValueTx(tx, "company.acme", fd, "Field Title"); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	result, err := s.Query("company", QueryOptions{Select: []string{"title"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 || result.Rows[0]["title"] != "Object Title" {
		t.Fatalf("expected query title to use object title, got %#v", result.Rows)
	}
}

func TestBackfillObjectTitlesSyncsObjectAndFieldTitle(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("investor"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("investor", "title", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("investor", "name", domain.FieldText, true, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateObjectWithBody("investor", "investor.lightspeed", "Lightspeed", map[string]string{"name": "Lightspeed"}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`UPDATE objects SET title = '' WHERE id = 'investor.lightspeed'`); err != nil {
		t.Fatal(err)
	}
	fd, err := s.GetField("investor", "title")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`DELETE FROM field_values WHERE object_id = ? AND field_id = ?`, "investor.lightspeed", fd.ID); err != nil {
		t.Fatal(err)
	}
	objectsUpdated, fieldsSynced, err := s.BackfillObjectTitles()
	if err != nil {
		t.Fatal(err)
	}
	if objectsUpdated != 1 || fieldsSynced != 1 {
		t.Fatalf("expected one object and field title update, got objects=%d fields=%d", objectsUpdated, fieldsSynced)
	}
	obj, err := s.GetObject("investor.lightspeed")
	if err != nil {
		t.Fatal(err)
	}
	if obj.Title != "Lightspeed" || obj.Fields["title"] != "Lightspeed" {
		t.Fatalf("expected backfilled title, got %#v", obj)
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
