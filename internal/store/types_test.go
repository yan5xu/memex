package store

import (
	"strings"
	"sync"
	"testing"

	"github.com/yan5xu/memex/internal/domain"
)

func TestAddEnumValuesAppendsInOrderAndIsIdempotent(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("source.item"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("source.item", "platform", domain.FieldEnum, false, false, []string{"Website", "Other"}, ""); err != nil {
		t.Fatal(err)
	}

	field, added, err := s.AddEnumValues("source.item", "platform", []string{"WeChat", "Zhihu", "WeChat", " Xiaohongshu "})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(added, ","); got != "WeChat,Zhihu,Xiaohongshu" {
		t.Fatalf("unexpected added values %q", got)
	}
	if got := strings.Join(field.EnumValues, ","); got != "Website,Other,WeChat,Zhihu,Xiaohongshu" {
		t.Fatalf("unexpected enum values %q", got)
	}

	field, added, err = s.AddEnumValues("source.item", "platform", []string{"Zhihu", "WeChat"})
	if err != nil {
		t.Fatal(err)
	}
	if len(added) != 0 {
		t.Fatalf("expected idempotent add, got %#v", added)
	}
	if got := strings.Join(field.EnumValues, ","); got != "Website,Other,WeChat,Zhihu,Xiaohongshu" {
		t.Fatalf("unexpected enum values after repeat %q", got)
	}

	if _, err := s.CreateObject("source.item", "source.wechat.example", "WeChat example", map[string]string{"platform": "WeChat"}); err != nil {
		t.Fatalf("new enum value was not accepted by object validation: %v", err)
	}
}

func TestAddEnumValuesPreservesConcurrentAppends(t *testing.T) {
	root := t.TempDir()
	first, err := Init(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = first.Close() })
	if err := first.CreateType("source.item"); err != nil {
		t.Fatal(err)
	}
	if _, err := first.AddField("source.item", "platform", domain.FieldEnum, false, false, []string{"Website"}, ""); err != nil {
		t.Fatal(err)
	}
	second, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = second.Close() })

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, call := range []struct {
		store *Store
		value string
	}{{first, "WeChat"}, {second, "Zhihu"}} {
		wg.Add(1)
		go func(call struct {
			store *Store
			value string
		}) {
			defer wg.Done()
			_, _, addErr := call.store.AddEnumValues("source.item", "platform", []string{call.value})
			errs <- addErr
		}(call)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}

	field, err := first.GetField("source.item", "platform")
	if err != nil {
		t.Fatal(err)
	}
	values := strings.Join(field.EnumValues, ",")
	if !strings.Contains(values, "WeChat") || !strings.Contains(values, "Zhihu") {
		t.Fatalf("concurrent append lost a value: %s", values)
	}
}

func TestAddEnumValuesRejectsNonEnumField(t *testing.T) {
	s, err := Init(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.CreateType("company"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddField("company", "name", domain.FieldText, false, false, nil, ""); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.AddEnumValues("company", "name", []string{"Example"}); err == nil || !strings.Contains(err.Error(), "not enum") {
		t.Fatalf("expected non-enum error, got %v", err)
	}
}
