package showcase

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yan5xu/memex/internal/domain"
	"github.com/yan5xu/memex/internal/store"
)

const (
	defaultDirName = "showcase-vault"
	graphViewsFile = "memex.graph-views.json"
)

//go:embed assets/memex-object-detail.png
var workspaceImage []byte

type fieldSpec struct {
	name       string
	kind       domain.FieldKind
	required   bool
	unique     bool
	values     []string
	targetType string
}

type objectSpec struct {
	typeID string
	id     string
	title  string
	fields map[string]string
	body   string
}

type linkSpec struct {
	from   string
	field  string
	target string
}

// DefaultRoot returns the persistent location used by an unconfigured server.
// MEMEX_SHOWCASE_VAULT is primarily useful for packaged deployments and tests.
func DefaultRoot() (string, error) {
	if root := strings.TrimSpace(os.Getenv("MEMEX_SHOWCASE_VAULT")); root != "" {
		return filepath.Abs(root)
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "Memex", defaultDirName), nil
}

// EnsureDefault creates the bundled showcase vault once and preserves later edits.
func EnsureDefault() (string, bool, error) {
	root, err := DefaultRoot()
	if err != nil {
		return "", false, err
	}
	created, err := Ensure(root)
	return root, created, err
}

// Ensure atomically seeds a showcase vault when root does not contain one.
func Ensure(root string) (bool, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false, err
	}
	if vaultExists(absRoot) {
		return false, nil
	}
	if info, statErr := os.Stat(absRoot); statErr == nil && info.IsDir() {
		entries, readErr := os.ReadDir(absRoot)
		if readErr != nil {
			return false, readErr
		}
		if len(entries) > 0 {
			return false, fmt.Errorf("showcase path exists but is not a Memex vault: %s", absRoot)
		}
		if err := os.Remove(absRoot); err != nil {
			return false, err
		}
	} else if statErr != nil && !os.IsNotExist(statErr) {
		return false, statErr
	}

	parent := filepath.Dir(absRoot)
	if err := os.MkdirAll(parent, 0755); err != nil {
		return false, err
	}
	tempRoot, err := os.MkdirTemp(parent, ".memex-showcase-*")
	if err != nil {
		return false, err
	}
	defer os.RemoveAll(tempRoot)
	if err := seed(tempRoot); err != nil {
		return false, err
	}
	if err := os.Rename(tempRoot, absRoot); err != nil {
		if vaultExists(absRoot) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func vaultExists(root string) bool {
	info, err := os.Stat(filepath.Join(root, store.DBPath))
	return err == nil && !info.IsDir()
}

func seed(root string) error {
	s, err := store.Init(root)
	if err != nil {
		return err
	}
	defer s.Close()

	for _, typeID := range []string{"concept", "note", "person", "source.item", "workspace"} {
		if err := s.CreateType(typeID); err != nil {
			return fmt.Errorf("create type %s: %w", typeID, err)
		}
	}
	for typeID, fields := range showcaseFields() {
		for _, field := range fields {
			if _, err := s.AddField(typeID, field.name, field.kind, field.required, field.unique, field.values, field.targetType); err != nil {
				return fmt.Errorf("add field %s.%s: %w", typeID, field.name, err)
			}
		}
	}
	for _, spec := range showcaseObjects() {
		body := spec.body
		if _, err := s.CreateObjectWithBody(spec.typeID, spec.id, spec.title, spec.fields, &body); err != nil {
			return fmt.Errorf("create object %s: %w", spec.id, err)
		}
	}
	for _, link := range showcaseLinks() {
		if err := s.LinkObject(link.from, link.field, link.target); err != nil {
			return fmt.Errorf("link %s.%s to %s: %w", link.from, link.field, link.target, err)
		}
	}

	assetsDir := filepath.Join(root, "assets")
	if err := os.MkdirAll(assetsDir, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "memex-workspace.png"), workspaceImage, 0644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(root, graphViewsFile), []byte(showcaseGraphViews), 0644); err != nil {
		return err
	}
	if err := s.RefreshAllBodies(); err != nil {
		return err
	}
	if err := s.RevalidateAll(); err != nil {
		return err
	}
	issues, err := s.Issues()
	if err != nil {
		return err
	}
	if len(issues) > 0 {
		return fmt.Errorf("showcase vault has %d validation issues", len(issues))
	}
	return nil
}

func showcaseFields() map[string][]fieldSpec {
	return map[string][]fieldSpec{
		"workspace": {
			{name: "name", kind: domain.FieldText, required: true},
			{name: "status", kind: domain.FieldEnum, values: []string{"active", "archived"}},
			{name: "one_liner", kind: domain.FieldText},
			{name: "website", kind: domain.FieldURL},
			{name: "owner", kind: domain.FieldRef, targetType: "person"},
			{name: "concepts", kind: domain.FieldRefList, targetType: "concept"},
			{name: "sources", kind: domain.FieldRefList, targetType: "source.item"},
			{name: "tags", kind: domain.FieldList},
			{name: "cover", kind: domain.FieldText},
		},
		"person": {
			{name: "name", kind: domain.FieldText, required: true},
			{name: "role", kind: domain.FieldEnum, values: []string{"owner", "researcher", "editor", "agent"}},
			{name: "bio", kind: domain.FieldText},
			{name: "skills", kind: domain.FieldList},
		},
		"concept": {
			{name: "title", kind: domain.FieldText, required: true},
			{name: "summary", kind: domain.FieldText},
			{name: "status", kind: domain.FieldEnum, values: []string{"emerging", "established", "archived"}},
			{name: "related", kind: domain.FieldRefList, targetType: "concept"},
			{name: "tags", kind: domain.FieldList},
		},
		"source.item": {
			{name: "title", kind: domain.FieldText, required: true},
			{name: "url", kind: domain.FieldURL},
			{name: "item_type", kind: domain.FieldEnum, values: []string{"documentation", "article", "demo", "research"}},
			{name: "evidence_level", kind: domain.FieldEnum, values: []string{"S1", "S2", "S3", "S4"}},
			{name: "collected_at", kind: domain.FieldDate},
			{name: "about_workspace", kind: domain.FieldRef, targetType: "workspace"},
			{name: "supports", kind: domain.FieldRefList, targetType: "concept"},
		},
		"note": {
			{name: "title", kind: domain.FieldText, required: true},
			{name: "kind", kind: domain.FieldEnum, values: []string{"guide", "decision", "takeaway"}},
			{name: "status", kind: domain.FieldEnum, values: []string{"draft", "published"}},
			{name: "about_workspace", kind: domain.FieldRef, targetType: "workspace"},
			{name: "sources", kind: domain.FieldRefList, targetType: "source.item"},
			{name: "concepts", kind: domain.FieldRefList, targetType: "concept"},
			{name: "author", kind: domain.FieldRef, targetType: "person"},
			{name: "tags", kind: domain.FieldList},
		},
	}
}

func showcaseObjects() []objectSpec {
	return []objectSpec{
		{
			typeID: "person", id: "person.mira-chen", title: "Mira Chen",
			fields: map[string]string{"name": "Mira Chen", "role": "researcher", "bio": "Maintains a shared knowledge model with people and agents.", "skills": "research,modeling,editing"},
			body:   "# Mira Chen\n\nMira turns open-ended research into reusable objects, evidence, and decisions. She maintains [[workspace.memex]] as a shared surface for human judgment and agent execution.\n",
		},
		{
			typeID: "concept", id: "concept.local-first", title: "Local-first",
			fields: map[string]string{"title": "Local-first", "summary": "The primary copy of the knowledge base stays on the user's machine.", "status": "established", "tags": "architecture,ownership"},
			body:   "# Local-first\n\nThe vault remains inspectable on disk: SQLite carries structure, while Markdown and assets remain ordinary files. This makes [[workspace.memex]] useful without requiring a hosted account.\n",
		},
		{
			typeID: "concept", id: "concept.typed-knowledge", title: "Typed knowledge",
			fields: map[string]string{"title": "Typed knowledge", "summary": "Stable identities and dynamic schemas make notes queryable without flattening them.", "status": "established", "tags": "schema,objects,links"},
			body:   "# Typed knowledge\n\nA type declares fields and relation targets. Objects keep stable IDs; their bodies keep the explanation readable. See [[note.modeling-principles]] for the working rules.\n",
		},
		{
			typeID: "concept", id: "concept.human-agent-collaboration", title: "Human-agent collaboration",
			fields: map[string]string{"title": "Human-agent collaboration", "summary": "People shape meaning while agents perform repeatable structured operations.", "status": "emerging", "tags": "agents,workflow"},
			body:   "# Human-agent collaboration\n\nPeople spend their attention on interpretation and writing. Agents use `mmx`, the local API, and `window.memex` to maintain the same vault.\n",
		},
		{
			typeID: "workspace", id: "workspace.memex", title: "Memex Showcase",
			fields: map[string]string{"name": "Memex Showcase", "status": "active", "one_liner": "A typed, local-first knowledge workspace for people and agents.", "website": "https://github.com/yan5xu/memex", "tags": "local-first,knowledge-graph,markdown", "cover": "assets/memex-workspace.png"},
			body:   showcaseWorkspaceBody,
		},
		{
			typeID: "source.item", id: "source.memex-readme", title: "Memex README",
			fields: map[string]string{"title": "Memex README", "url": "https://github.com/yan5xu/memex", "item_type": "documentation", "evidence_level": "S1", "collected_at": "2026-07-13"},
			body:   "# Memex README\n\nThe project README defines the product model, storage boundary, CLI surface, and Web UI. It supports [[concept.local-first]] and [[concept.typed-knowledge]].\n",
		},
		{
			typeID: "source.item", id: "source.memex-interface-tour", title: "Memex interface tour",
			fields: map[string]string{"title": "Memex interface tour", "url": "https://github.com/yan5xu/memex#readme", "item_type": "demo", "evidence_level": "S1", "collected_at": "2026-07-13"},
			body:   "# Memex interface tour\n\nThis captured interface demonstrates the table, object reader, inspector, and graph workspace.\n\n![Memex object reader {wide}](assets/memex-workspace.png)\n",
		},
		{
			typeID: "note", id: "note.start-here", title: "Start Here / 从这里开始",
			fields: map[string]string{"title": "Start Here / 从这里开始", "kind": "guide", "status": "published", "tags": "welcome,guide"},
			body:   showcaseStartBody,
		},
		{
			typeID: "note", id: "note.modeling-principles", title: "Modeling principles",
			fields: map[string]string{"title": "Modeling principles", "kind": "decision", "status": "published", "tags": "schema,writing,links"},
			body:   showcasePrinciplesBody,
		},
	}
}

func showcaseLinks() []linkSpec {
	return []linkSpec{
		{from: "workspace.memex", field: "owner", target: "person.mira-chen"},
		{from: "workspace.memex", field: "concepts", target: "concept.local-first"},
		{from: "workspace.memex", field: "concepts", target: "concept.typed-knowledge"},
		{from: "workspace.memex", field: "concepts", target: "concept.human-agent-collaboration"},
		{from: "workspace.memex", field: "sources", target: "source.memex-readme"},
		{from: "workspace.memex", field: "sources", target: "source.memex-interface-tour"},
		{from: "source.memex-readme", field: "about_workspace", target: "workspace.memex"},
		{from: "source.memex-readme", field: "supports", target: "concept.local-first"},
		{from: "source.memex-readme", field: "supports", target: "concept.typed-knowledge"},
		{from: "source.memex-interface-tour", field: "about_workspace", target: "workspace.memex"},
		{from: "source.memex-interface-tour", field: "supports", target: "concept.human-agent-collaboration"},
		{from: "note.start-here", field: "about_workspace", target: "workspace.memex"},
		{from: "note.start-here", field: "sources", target: "source.memex-readme"},
		{from: "note.start-here", field: "concepts", target: "concept.local-first"},
		{from: "note.start-here", field: "concepts", target: "concept.typed-knowledge"},
		{from: "note.start-here", field: "author", target: "person.mira-chen"},
		{from: "note.modeling-principles", field: "about_workspace", target: "workspace.memex"},
		{from: "note.modeling-principles", field: "sources", target: "source.memex-readme"},
		{from: "note.modeling-principles", field: "concepts", target: "concept.typed-knowledge"},
		{from: "note.modeling-principles", field: "concepts", target: "concept.human-agent-collaboration"},
		{from: "note.modeling-principles", field: "author", target: "person.mira-chen"},
		{from: "concept.typed-knowledge", field: "related", target: "concept.local-first"},
		{from: "concept.human-agent-collaboration", field: "related", target: "concept.typed-knowledge"},
	}
}

const showcaseWorkspaceBody = `# Memex Showcase

Memex combines **typed objects** with readable Markdown. This vault is a working example: every table row, relation, backlink, image, and graph view is backed by the same local files and SQLite index.

![Memex object reader {wide}](assets/memex-workspace.png)

## What lives where

| Layer | Responsibility | Example |
| --- | --- | --- |
| Type | Schema and relation constraints | ` + "`workspace.owner -> person`" + ` |
| Object | Stable identity and queryable fields | ` + "`workspace.memex`" + ` |
| Body | Narrative, evidence, images, and code | This page |
| Link | Reusable relationships | [[concept.typed-knowledge]] |

` + "```facts" + `
Storage | SQLite + Markdown
Interface | Web UI + mmx CLI + local API
Ownership | Local-first
Collaboration | Human + agent
` + "```" + `

## A shared workflow

1. A person defines what deserves a stable identity.
2. An agent creates or updates objects through ` + "`mmx`" + `.
3. The person reads and edits the body in the Web UI.
4. Memex validates fields, references, and body links before Git records the change.

` + "```mermaid" + `
flowchart LR
  Human[Human judgment] --> Vault[(Memex vault)]
  Agent[Agent operations] --> Vault
  Vault --> Table[Tables]
  Vault --> Page[Object pages]
  Vault --> Graph[Graph views]
` + "```" + `

## Explore next

- Open [[note.start-here]] for a short guided tour.
- Inspect [[person.mira-chen]] to see backlinks.
- Switch to Graph and choose **Workspace map**.
- Open Schema to inspect the ` + "`ref`" + ` and ` + "`ref_list`" + ` fields behind the graph.

> This is a normal writable vault. Edit it, create objects, or switch to your own vault at any time.
`

const showcaseStartBody = `# Start Here / 从这里开始

这个默认 Vault 用真实数据展示 Memex 的核心能力，不是静态产品导览。你可以直接修改正文、创建对象或删除示例。

## 五分钟体验

- [ ] 在 **对象** 中切换 ` + "`workspace`" + `、` + "`concept`" + `、` + "`source.item`" + ` 和 ` + "`note`" + `。
- [ ] 打开 [[workspace.memex]]，查看图片、表格、Mermaid 和双链。
- [ ] 展开 Inspector，观察 Field Links、Body Links 与 Backlinks。
- [ ] 在 **结构** 中选择一个 Type，查看动态 Schema。
- [ ] 在 **图谱** 中选择 **Workspace map**，再把中心切到 Memex Showcase。

## 人和 Agent 如何分工

- **人更高频：** 阅读、编辑 Body、判断证据、组织叙事。
- **Agent 更高频：** 查重、创建对象、写字段、建立 Link、刷新索引、运行 ` + "`issues`" + `。
- **共同协议：** [[concept.typed-knowledge]] 保证结构清晰，[[concept.local-first]] 保证数据可见且可迁移。

` + "```bash" + `
mmx -C /path/to/vault query workspace
mmx -C /path/to/vault get workspace.memex --body-preview 500
mmx -C /path/to/vault issues
` + "```" + `

下一步可以阅读 [[note.modeling-principles]]，也可以直接在正文编辑器里修改这一页。
`

const showcasePrinciplesBody = `# Modeling principles

## Keep facts, prose, and judgment distinct

1. **Fields** hold facts that need filtering, validation, or projection.
2. **Body** holds explanation, context, images, and evolving arguments.
3. **Source items** preserve evidence.
4. **Notes** preserve human decisions and takeaways.

## Promote a link when it becomes reusable

A mention can begin as a body link. When the relation must be queried or constrained, promote it to a ` + "`ref`" + ` or ` + "`ref_list`" + ` field. [[concept.human-agent-collaboration]] depends on this shared, inspectable protocol.

` + "```timeline" + `
Observe | Capture a source or write a body mention
Model | Give reusable entities a type and stable id
Connect | Add field links for queryable relationships
Validate | Refresh bodies and run issues
Reuse | Read the same knowledge as a page, table, or graph
` + "```" + `

## Review checklist

- Is the object identity stable?
- Are queryable facts in fields rather than buried in prose?
- Does every strong claim point to [[source.memex-readme]] or another source?
- Can a person understand the body without reading raw JSON?
`

const showcaseGraphViews = `{
  "version": 1,
  "views": [
    {
      "id": "workspace-map",
      "label": "Workspace map",
      "description": "Read a workspace through its owner, concepts, evidence, and notes.",
      "root_type": "workspace",
      "paths": [
        {"steps": [{"relation": "owner", "direction": "out", "target_type": "person", "display": "node"}]},
        {"steps": [{"relation": "concepts", "direction": "out", "target_type": "concept", "display": "node"}]},
        {"steps": [{"relation": "sources", "direction": "out", "target_type": "source.item", "display": "node"}]},
        {"steps": [{"relation": "about_workspace", "direction": "in", "target_type": "note", "display": "node"}]}
      ],
      "nodes": {
        "workspace": {"variant": "rich", "title_field": "name", "subtitle_field": "one_liner", "meta_fields": ["status", "website"], "badge_fields": ["tags"], "image_field": "cover"},
        "person": {"variant": "standard", "title_field": "name", "subtitle_field": "bio", "badge_fields": ["role"]},
        "concept": {"variant": "standard", "title_field": "title", "subtitle_field": "summary", "badge_fields": ["status"]},
        "source.item": {"variant": "compact", "title_field": "title", "meta_fields": ["item_type", "evidence_level"]},
        "note": {"variant": "standard", "title_field": "title", "meta_fields": ["kind", "status"]}
      }
    },
    {
      "id": "concept-evidence-bridge",
      "label": "Concept evidence bridge",
      "description": "Fold evidence objects into derived edges between concepts and workspaces.",
      "root_type": "concept",
      "paths": [
        {"steps": [
          {"relation": "supports", "direction": "in", "target_type": "source.item", "display": "bridge"},
          {"relation": "about_workspace", "direction": "out", "target_type": "workspace", "display": "node"}
        ]}
      ],
      "nodes": {
        "concept": {"variant": "rich", "title_field": "title", "subtitle_field": "summary", "badge_fields": ["status"]},
        "workspace": {"variant": "standard", "title_field": "name", "subtitle_field": "one_liner", "badge_fields": ["status"]}
      },
      "bridges": {
        "source.item": {"label_fields": ["item_type", "evidence_level"]}
      }
    }
  ]
}
`
