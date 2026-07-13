package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGraphViewV2ProjectsBridgeAndNodeDisplay(t *testing.T) {
	runner := graphTestRunner(t)
	config := `{
  "version": 2,
  "views": [{
    "id": "portfolio",
    "label": "Portfolio",
    "root_type": "investor",
    "paths": [{"steps": [
      {"direction":"in","relation":"investor","target_type":"investment","display":"bridge"},
      {"direction":"out","relation":"company","target_type":"company"}
    ]}],
    "nodes": {
      "company": {"title_field":"name","subtitle_field":"one_liner","meta_fields":["status"]}
    },
    "bridges": {
      "investment": {"label_fields":["round","amount"],"aggregate":true}
    }
  }]
}`
	runner.Stdin = strings.NewReader(config)
	if result := runner.Run(context.Background(), []string{"graph", "view", "apply", "--stdin"}); !result.OK {
		t.Fatalf("apply failed: %#v", result.Error)
	}

	result := runner.Run(context.Background(), []string{"graph", "query", "--view", "portfolio", "--center", "investor.lightspeed"})
	if !result.OK {
		t.Fatalf("query failed: %#v", result.Error)
	}
	query, ok := result.Data.(graphQueryResult)
	if !ok {
		t.Fatalf("unexpected query payload: %#v", result.Data)
	}
	if len(query.Nodes) != 2 || len(query.Edges) != 1 {
		t.Fatalf("expected collapsed investor-company graph, got %#v", query)
	}
	company := query.Nodes[1]
	if company.ID != "company.acme" || company.Display.Title != "Acme" || company.Display.Subtitle != "Agent infrastructure" {
		t.Fatalf("unexpected company display: %#v", company)
	}
	edge := query.Edges[0]
	if !edge.Derived || edge.FromID != "investor.lightspeed" || edge.ToID != "company.acme" || edge.Label != "Seed · $4M" {
		t.Fatalf("unexpected projected edge: %#v", edge)
	}
	if len(edge.ViaIDs) != 1 || edge.ViaIDs[0] != "investment.lightspeed-acme" {
		t.Fatalf("bridge provenance missing: %#v", edge)
	}
}

func TestGraphViewValidateUsesVaultSchema(t *testing.T) {
	runner := graphTestRunner(t)
	invalid := `{
  "version": 2,
  "views": [{
    "id":"bad",
    "label":"Bad",
    "root_type":"investor",
    "paths":[{"steps":[{"direction":"in","relation":"missing","target_type":"investment"}]}]
  }]
}`
	path := filepath.Join(runner.Root, "invalid.json")
	if err := os.WriteFile(path, []byte(invalid), 0644); err != nil {
		t.Fatal(err)
	}
	result := runner.Run(context.Background(), []string{"graph", "view", "validate", "--file", path})
	if result.OK || result.Error == nil || !strings.Contains(result.Error.Message, `field "missing" does not exist on type investment`) {
		t.Fatalf("expected schema-aware validation error, got %#v", result)
	}
	if err := os.WriteFile(filepath.Join(runner.Root, "memex.graph-views.json"), []byte(invalid), 0644); err != nil {
		t.Fatal(err)
	}
	listResult := runner.Run(context.Background(), []string{"graph", "view", "list"})
	if listResult.OK || listResult.Error == nil || !strings.Contains(listResult.Error.Message, `field "missing" does not exist on type investment`) {
		t.Fatalf("expected list to reject invalid canonical config, got %#v", listResult)
	}
}

func TestGraphViewVersionOneRemainsCompatible(t *testing.T) {
	runner := graphTestRunner(t)
	legacy := `{
  "version": 1,
  "views": [{
    "id":"portfolio",
    "label":"Portfolio",
    "root_type":"investor",
    "steps":[
      {"direction":"in","relation":"investor","target_type":"investment"},
      {"direction":"out","relation":"company","target_type":"company"}
    ]
  }]
}`
	runner.Stdin = strings.NewReader(legacy)
	result := runner.Run(context.Background(), []string{"graph", "views", "write", "--stdin"})
	if !result.OK {
		t.Fatalf("legacy write failed: %#v", result.Error)
	}
	config, ok := result.Data.(graphViewConfig)
	if !ok || config.Version != 1 || len(config.Views[0].Steps) != 2 || len(config.Views[0].Paths) != 0 {
		t.Fatalf("legacy config changed shape: %#v", result.Data)
	}
	query := runner.Run(context.Background(), []string{"graph", "query", "--view", "portfolio", "--center", "investor.lightspeed"})
	if !query.OK {
		t.Fatalf("legacy query failed: %#v", query.Error)
	}
	payload := query.Data.(graphQueryResult)
	if len(payload.Nodes) != 3 || len(payload.Edges) != 2 || payload.Stats["derived_edges"] != 0 {
		t.Fatalf("legacy graph should remain uncollapsed: %#v", payload)
	}
}

func graphTestRunner(t *testing.T) *Runner {
	t.Helper()
	runner := NewRunner(t.TempDir())
	runGraphTestCommand(t, runner, "init")
	for _, typeID := range []string{"investor", "investment", "company"} {
		runGraphTestCommand(t, runner, "type", "create", typeID)
	}
	runGraphTestCommand(t, runner, "field", "add", "investment", "investor", "--kind", "ref", "--target", "investor")
	runGraphTestCommand(t, runner, "field", "add", "investment", "company", "--kind", "ref", "--target", "company")
	runGraphTestCommand(t, runner, "field", "add", "investment", "round", "--kind", "text")
	runGraphTestCommand(t, runner, "field", "add", "investment", "amount", "--kind", "text")
	runGraphTestCommand(t, runner, "field", "add", "company", "name", "--kind", "text")
	runGraphTestCommand(t, runner, "field", "add", "company", "one_liner", "--kind", "text")
	runGraphTestCommand(t, runner, "field", "add", "company", "status", "--kind", "text")
	runGraphTestCommand(t, runner, "create", "investor", "investor.lightspeed", "title=Lightspeed")
	runGraphTestCommand(t, runner, "create", "company", "company.acme", "name=Acme", "one_liner=Agent infrastructure", "status=active")
	runGraphTestCommand(t, runner, "create", "investment", "investment.lightspeed-acme", "title=Lightspeed invests in Acme", "round=Seed", "amount=$4M")
	runGraphTestCommand(t, runner, "link", "investment.lightspeed-acme", "investor", "investor.lightspeed")
	runGraphTestCommand(t, runner, "link", "investment.lightspeed-acme", "company", "company.acme")
	return runner
}

func runGraphTestCommand(t *testing.T, runner *Runner, argv ...string) {
	t.Helper()
	if result := runner.Run(context.Background(), argv); !result.OK {
		t.Fatalf("%v failed: %#v", argv, result.Error)
	}
}
