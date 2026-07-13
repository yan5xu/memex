package web

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"
)

func TestStaticHandlerRejectsPOST(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/retired-api", strings.NewReader(`{}`))
	res := httptest.NewRecorder()

	staticHandler().ServeHTTP(res, req)

	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusMethodNotAllowed)
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
