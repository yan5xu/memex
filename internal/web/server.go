package web

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/yan5xu/memex/internal/app"
	"github.com/yan5xu/memex/internal/store"
)

//go:embed dist/*
var embeddedDist embed.FS

type Server struct {
	Root string
	Addr string
}

type RunRequest struct {
	Argv  []string `json:"argv"`
	Vault string   `json:"vault,omitempty"`
	Stdin *string  `json:"stdin,omitempty"`
}

type plantUMLRequest struct {
	Source string `json:"source"`
}

func (s Server) ListenAndServe() error {
	if s.Addr == "" {
		s.Addr = "127.0.0.1:8765"
	}
	mux := http.NewServeMux()
	runner := app.NewRunner(s.Root)
	locks := &vaultLocks{locks: make(map[string]*sync.Mutex)}
	runHandler := func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req RunRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, app.Fail("bad_request", err.Error()))
			return
		}
		reqRunner := runner
		if req.Vault != "" {
			reqRunner = app.NewRunner(req.Vault)
		}
		if req.Stdin != nil {
			reqRunner.Stdin = strings.NewReader(*req.Stdin)
		}
		unlock := locks.lock(reqRunner.Root)
		defer unlock()
		result := reqRunner.Run(context.Background(), req.Argv)
		writeJSON(w, result)
	}
	mux.HandleFunc("/api/run", runHandler)
	mux.HandleFunc("/api/assets", s.assetUploadHandler())
	mux.HandleFunc("/api/file", s.vaultFileHandler())
	mux.HandleFunc("/api/plantuml", plantUMLHandler)
	mux.Handle("/", staticHandler())
	fmt.Printf("Memex web listening on http://%s\n", s.Addr)
	return http.ListenAndServe(s.Addr, mux)
}

func plantUMLHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req plantUMLRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil {
		writeJSON(w, app.Fail("bad_request", err.Error()))
		return
	}
	svg, err := renderPlantUMLSVG(r.Context(), req.Source)
	if err != nil {
		writeJSON(w, app.Fail("plantuml_failed", err.Error()))
		return
	}
	writeJSON(w, app.OK(map[string]string{"svg": svg}))
}

func renderPlantUMLSVG(parent context.Context, source string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return "", fmt.Errorf("PlantUML source is required")
	}
	if len(source) > 200<<10 {
		return "", fmt.Errorf("PlantUML source is too large")
	}
	bin := strings.TrimSpace(os.Getenv("PLANTUML_BIN"))
	if bin == "" {
		bin = "plantuml"
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "-tsvg", "-pipe")
	cmd.Stdin = strings.NewReader(source)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("PlantUML render timed out")
	}
	if err != nil {
		message := strings.TrimSpace(string(out))
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("%s", message)
	}
	svg := strings.TrimSpace(string(out))
	start := strings.Index(svg, "<svg")
	if start < 0 {
		return "", fmt.Errorf("PlantUML did not return SVG")
	}
	return svg[start:], nil
}

func (s Server) assetUploadHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeJSON(w, app.Fail("bad_request", err.Error()))
			return
		}
		root := s.Root
		if vault := strings.TrimSpace(r.FormValue("vault")); vault != "" {
			root = vault
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, app.Fail("bad_request", "file is required"))
			return
		}
		defer file.Close()
		asset, err := store.ImportAsset(root, file, header.Filename)
		if err != nil {
			writeJSON(w, app.Fail("write_failed", err.Error()))
			return
		}
		writeJSON(w, app.OK(asset))
	}
}

func (s Server) vaultFileHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		root := s.Root
		if vault := strings.TrimSpace(r.URL.Query().Get("vault")); vault != "" {
			root = vault
		}
		target := strings.TrimSpace(r.URL.Query().Get("path"))
		if target == "" || isRemoteAsset(target) {
			http.NotFound(w, r)
			return
		}
		for _, candidate := range vaultFileCandidates(root, r.URL.Query().Get("base"), target) {
			info, err := os.Stat(candidate)
			if err == nil && !info.IsDir() {
				http.ServeFile(w, r, candidate)
				return
			}
		}
		http.NotFound(w, r)
	}
}

func vaultFileCandidates(root, base, target string) []string {
	target = cleanVaultPath(target)
	base = cleanVaultPath(base)
	var candidates []string
	if base != "" {
		if joined, ok := safeVaultJoin(root, filepath.Dir(base), target); ok {
			candidates = append(candidates, joined)
		}
	}
	if joined, ok := safeVaultJoin(root, target); ok {
		candidates = append(candidates, joined)
	}
	return candidates
}

func cleanVaultPath(value string) string {
	value = strings.ReplaceAll(value, "\\", "/")
	return strings.TrimLeft(value, "/")
}

func safeVaultJoin(root string, parts ...string) (string, bool) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	joinedParts := append([]string{absRoot}, parts...)
	target, err := filepath.Abs(filepath.Join(joinedParts...))
	if err != nil {
		return "", false
	}
	rel, err := filepath.Rel(absRoot, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", false
	}
	return target, true
}

func isRemoteAsset(value string) bool {
	lower := strings.ToLower(value)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "blob:")
}

type vaultLocks struct {
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func (v *vaultLocks) lock(root string) func() {
	v.mu.Lock()
	lock, ok := v.locks[root]
	if !ok {
		lock = &sync.Mutex{}
		v.locks[root] = lock
	}
	v.mu.Unlock()
	lock.Lock()
	return lock.Unlock
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func staticHandler() http.Handler {
	dist, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		})
	}
	fileServer := http.FileServer(http.FS(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			fileServer.ServeHTTP(w, r)
			return
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
