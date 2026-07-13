package app

import (
	"context"
	"testing"

	"github.com/yan5xu/mmx/internal/domain"
)

func TestFieldListCommandReturnsFields(t *testing.T) {
	runner := NewRunner(t.TempDir())

	if result := runner.Run(context.Background(), []string{"init"}); !result.OK {
		t.Fatalf("init failed: %#v", result.Error)
	}
	if result := runner.Run(context.Background(), []string{"type", "create", "company"}); !result.OK {
		t.Fatalf("type create failed: %#v", result.Error)
	}
	if result := runner.Run(context.Background(), []string{"field", "add", "company", "status", "--kind", "enum", "--values", "active,archived"}); !result.OK {
		t.Fatalf("field add failed: %#v", result.Error)
	}

	result := runner.Run(context.Background(), []string{"field", "list", "company"})
	if !result.OK {
		t.Fatalf("field list failed: %#v", result.Error)
	}
	payload, ok := result.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected field list map payload, got %#v", result.Data)
	}
	fields, ok := payload["fields"].([]domain.FieldDef)
	if !ok {
		t.Fatalf("expected field defs, got %#v", payload["fields"])
	}
	if payload["count"] != 1 || len(fields) != 1 || fields[0].Name != "status" || fields[0].Kind != domain.FieldEnum {
		t.Fatalf("unexpected field list payload: %#v", payload)
	}
}
