package app

import (
	"context"
	"testing"

	"github.com/yan5xu/memex/internal/domain"
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

func TestFieldEnumAddCommand(t *testing.T) {
	runner := NewRunner(t.TempDir())

	if result := runner.Run(context.Background(), []string{"init"}); !result.OK {
		t.Fatalf("init failed: %#v", result.Error)
	}
	if result := runner.Run(context.Background(), []string{"type", "create", "source.item"}); !result.OK {
		t.Fatalf("type create failed: %#v", result.Error)
	}
	if result := runner.Run(context.Background(), []string{"field", "add", "source.item", "platform", "--kind", "enum", "--values", "Website,Other"}); !result.OK {
		t.Fatalf("field add failed: %#v", result.Error)
	}

	result := runner.Run(context.Background(), []string{"field", "enum", "add", "source.item", "platform", "WeChat", "Zhihu,Xiaohongshu", "WeChat"})
	if !result.OK {
		t.Fatalf("field enum add failed: %#v", result.Error)
	}
	payload, ok := result.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %#v", result.Data)
	}
	added, ok := payload["added"].([]string)
	if !ok || len(added) != 3 || added[0] != "WeChat" || added[1] != "Zhihu" || added[2] != "Xiaohongshu" {
		t.Fatalf("unexpected added values: %#v", payload["added"])
	}
	values, ok := payload["values"].([]string)
	if !ok || len(values) != 5 || values[4] != "Xiaohongshu" {
		t.Fatalf("unexpected enum values: %#v", payload["values"])
	}

	repeat := runner.Run(context.Background(), []string{"field", "enum", "add", "source.item", "platform", "WeChat"})
	if !repeat.OK {
		t.Fatalf("repeat field enum add failed: %#v", repeat.Error)
	}
	repeatPayload := repeat.Data.(map[string]any)
	if got := repeatPayload["added"].([]string); len(got) != 0 {
		t.Fatalf("expected idempotent repeat, got %#v", got)
	}
}
