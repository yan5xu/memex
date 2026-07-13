package web

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yan5xu/memex/internal/app"
	"github.com/yan5xu/memex/internal/store"
)

func TestStaticHandlerRejectsPOST(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/retired-api", strings.NewReader(`{}`))
	res := httptest.NewRecorder()

	staticHandler().ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusMethodNotAllowed)
	}
}

func TestInfoHandlerReturnsAbsoluteDefaultVault(t *testing.T) {
	root := t.TempDir()
	showcaseRoot := filepath.Join(t.TempDir(), "showcase")
	t.Setenv("MEMEX_SHOWCASE_VAULT", showcaseRoot)
	showcaseStore, err := store.Init(showcaseRoot)
	if err != nil {
		t.Fatal(err)
	}
	_ = showcaseStore.Close()
	s, err := store.Init(root)
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Close()
	req := httptest.NewRequest(http.MethodGet, "/api/info", nil)
	res := httptest.NewRecorder()
	Server{Root: root}.infoHandler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	var result app.Result
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if !result.OK {
		t.Fatalf("result = %+v", result)
	}
	data, ok := result.Data.(map[string]any)
	if !ok {
		t.Fatalf("data = %#v", result.Data)
	}
	if data["default_vault"] != root || data["vault_exists"] != true || data["showcase_vault"] != showcaseRoot || data["showcase_exists"] != true || data["showcase_start_object"] != "workspace.memex" {
		t.Fatalf("data = %#v", data)
	}
}

func TestRenderPlantUMLSVG(t *testing.T) {
	if _, err := exec.LookPath("plantuml"); err != nil {
		t.Skip("plantuml is not installed")
	}
	svg, err := renderPlantUMLSVG(context.Background(), "@startuml\nAlice -> Bob: Hi\n@enduml\n")
	if err != nil {
		t.Fatalf("render PlantUML: %v", err)
	}
	if !strings.Contains(svg, "<svg") || !strings.Contains(svg, "Alice") || !strings.Contains(svg, "Bob") {
		t.Fatalf("unexpected SVG output: %.200s", svg)
	}
}
