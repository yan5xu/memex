package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/yan5xu/memex/internal/domain"
	"github.com/yan5xu/memex/internal/store"
)

type Runner struct {
	Root  string
	Stdin io.Reader
}

func NewRunner(root string) *Runner {
	if root == "" {
		root = "."
	}
	return &Runner{Root: root}
}

func (r *Runner) Run(_ context.Context, argv []string) Result {
	if len(argv) == 0 {
		return OK(map[string]any{"usage": usage()})
	}
	switch argv[0] {
	case "vault":
		return r.runVault(argv[1:])
	case "init":
		return r.init()
	case "serve":
		return Fail("serve_internal", "serve is only available from the CLI")
	case "status":
		return r.withStore(func(s *store.Store) Result {
			dirty, err := s.BodyDirty()
			if err != nil {
				return fromErr(err)
			}
			issues, err := currentIssues(s)
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"dirty_bodies": dirty, "issues": issues, "clean": len(dirty) == 0 && len(issues) == 0})
		})
	case "type":
		return r.runType(argv[1:])
	case "field":
		return r.runField(argv[1:])
	case "object":
		return r.runObject(argv[1:])
	case "create":
		return r.runCreate(argv[1:])
	case "upsert":
		return r.runUpsert(argv[1:])
	case "source":
		return r.runSource(argv[1:])
	case "get":
		return r.runGet(argv[1:])
	case "set":
		return r.runSet(argv[1:])
	case "link":
		return r.runLink(argv[1:])
	case "delete", "remove":
		return r.runDelete(argv[1:])
	case "query":
		return r.runQuery(argv[1:])
	case "links":
		return r.runLinks(argv[1:], false)
	case "backlinks":
		return r.runLinks(argv[1:], true)
	case "graph":
		return r.runGraph(argv[1:])
	case "body":
		return r.runBody(argv[1:])
	case "asset":
		return r.runAsset(argv[1:])
	case "refresh":
		return r.withStore(func(s *store.Store) Result {
			if err := s.RefreshAllBodies(); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"refreshed": true})
		})
	case "issues":
		return r.withStore(func(s *store.Store) Result {
			issues, err := currentIssues(s)
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"issues": issues, "count": len(issues)})
		})
	case "doctor":
		flags := parseFlags(argv[1:])
		return r.withStore(func(s *store.Store) Result {
			titleFix := map[string]any{"objects_updated": 0, "fields_synced": 0}
			if flags.Bool("fix-titles") {
				objectsUpdated, fieldsSynced, err := s.BackfillObjectTitles()
				if err != nil {
					return fromErr(err)
				}
				titleFix = map[string]any{"objects_updated": objectsUpdated, "fields_synced": fieldsSynced}
			}
			if err := s.RefreshAllBodies(); err != nil {
				return fromErr(err)
			}
			if err := s.RevalidateAll(); err != nil {
				return fromErr(err)
			}
			issues, err := s.Issues()
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"issues": issues, "count": len(issues), "title_fix": titleFix})
		})
	default:
		return Fail("unknown_command", "unknown command: "+argv[0])
	}
}

func (r *Runner) runCreate(args []string) Result {
	if len(args) < 2 {
		return Fail("usage", "usage: create <type> <id> [--body <file>|--body-stdin] field=value...")
	}
	fieldArgs, body, err := r.extractBodyInput(args[2:])
	if err != nil {
		return fromErr(err)
	}
	fields, err := parseAssignments(fieldArgs)
	if err != nil {
		return fromErr(err)
	}
	return r.withStore(func(s *store.Store) Result {
		obj, err := s.CreateObjectWithBody(args[0], args[1], fields["title"], fields, body)
		if err != nil {
			return fromErr(err)
		}
		return OK(obj, Effect{Kind: "object.create", Object: obj.ID})
	})
}

func (r *Runner) runUpsert(args []string) Result {
	if len(args) < 2 {
		return Fail("usage", "usage: upsert <type> <id> [--body <file>|--body-stdin] field=value...")
	}
	fieldArgs, body, err := r.extractBodyInput(args[2:])
	if err != nil {
		return fromErr(err)
	}
	fields, err := parseAssignments(fieldArgs)
	if err != nil {
		return fromErr(err)
	}
	return r.withStore(func(s *store.Store) Result {
		obj, created, err := s.UpsertObjectWithBody(args[0], args[1], fields["title"], fields, body)
		if err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"object": obj, "created": created, "updated": !created}, Effect{Kind: "object.upsert", Object: obj.ID})
	})
}

func (r *Runner) runSource(args []string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: source add <id> [--body <file>|--body-stdin] [--title <title>] [--url <url>] field=value...")
	}
	switch args[0] {
	case "add":
		return r.runTypedAdd("source.add", "source.item", args[1:], sourceAddFieldAliases())
	default:
		return Fail("unknown_command", "unknown source command: "+args[0])
	}
}

func (r *Runner) runTypedAdd(effectKind, typeID string, args []string, aliases map[string]string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: source add <id> [--body <file>|--body-stdin] [--title <title>] [--url <url>] field=value...")
	}
	fieldArgs, body, err := r.extractBodyInput(args[1:])
	if err != nil {
		return fromErr(err)
	}
	fields, err := parseFieldsFromArgs(fieldArgs, aliases)
	if err != nil {
		return fromErr(err)
	}
	return r.withStore(func(s *store.Store) Result {
		obj, created, err := s.UpsertObjectWithBody(typeID, args[0], fields["title"], fields, body)
		if err != nil {
			return fromErr(err)
		}
		issues, err := s.Issues()
		if err != nil {
			return fromErr(err)
		}
		objectIssues := filterIssuesForObject(issues, obj.ID)
		return OK(map[string]any{
			"object":      obj,
			"created":     created,
			"updated":     !created,
			"issues":      objectIssues,
			"issue_count": len(objectIssues),
		}, Effect{Kind: effectKind, Object: obj.ID})
	})
}

func (r *Runner) runGet(args []string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: get <id> [--no-body|--body-preview <n>]")
	}
	opts, err := detailOptionsFromFlags(parseFlags(args[1:]))
	if err != nil {
		return fromErr(err)
	}
	return r.objectDetail(args[0], opts)
}

func (r *Runner) runSet(args []string) Result {
	if len(args) < 3 {
		return Fail("usage", "usage: set <id> <field> <value>")
	}
	return r.withStore(func(s *store.Store) Result {
		if err := s.SetField(args[0], args[1], args[2]); err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"object": args[0], "field": args[1], "value": args[2]}, Effect{Kind: "object.set", Object: args[0], Field: args[1]})
	})
}

func (r *Runner) runLink(args []string) Result {
	if len(args) < 3 {
		return Fail("usage", "usage: link <id> <field> <target-id>")
	}
	return r.withStore(func(s *store.Store) Result {
		if err := s.LinkObject(args[0], args[1], args[2]); err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"object": args[0], "field": args[1], "target": args[2]}, Effect{Kind: "object.link", Object: args[0], Field: args[1]})
	})
}

func (r *Runner) runDelete(args []string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: delete <id> --yes")
	}
	flags := parseFlags(args[1:])
	if !flags.Bool("yes") {
		return Fail("confirm_required", "delete requires --yes; body markdown is kept on disk")
	}
	return r.withStore(func(s *store.Store) Result {
		obj, err := s.DeleteObject(args[0])
		if err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"object": obj, "body_abs_path": obj.BodyAbsPath, "body_kept": true}, Effect{Kind: "object.delete", Object: obj.ID})
	})
}

func (r *Runner) runVault(args []string) Result {
	if len(args) == 0 || args[0] != "info" {
		return Fail("usage", "usage: vault info")
	}
	dbPath := filepath.Join(r.Root, store.DBPath)
	_, err := os.Stat(dbPath)
	return OK(map[string]any{
		"root":    r.Root,
		"db_path": dbPath,
		"exists":  err == nil,
	})
}

func (r *Runner) init() Result {
	s, err := store.Init(r.Root)
	if err != nil {
		return fromErr(err)
	}
	defer s.Close()
	return OK(map[string]any{"root": r.Root, "db": store.DBPath})
}

func (r *Runner) runType(args []string) Result {
	if len(args) == 0 {
		return Fail("usage", "usage: type list|show|create")
	}
	return r.withStore(func(s *store.Store) Result {
		switch args[0] {
		case "list":
			types, err := s.ListTypes()
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"types": types})
		case "show":
			if len(args) < 2 {
				return Fail("usage", "usage: type show <type>")
			}
			td, err := s.GetType(args[1])
			if err != nil {
				return fromErr(err)
			}
			return OK(td)
		case "create":
			if len(args) < 2 {
				return Fail("usage", "usage: type create <type>")
			}
			if err := s.CreateType(args[1]); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"type": args[1]}, Effect{Kind: "type.create"})
		default:
			return Fail("unknown_command", "unknown type command: "+args[0])
		}
	})
}

func (r *Runner) runField(args []string) Result {
	return r.withStore(func(s *store.Store) Result {
		if len(args) < 1 {
			return Fail("usage", "usage: field list <type>|field add <type> <field> --kind <kind>")
		}
		switch args[0] {
		case "list":
			if len(args) < 2 {
				return Fail("usage", "usage: field list <type>")
			}
			fields, err := s.ListFields(args[1])
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"type": args[1], "fields": fields, "count": len(fields)})
		case "add":
			if len(args) < 3 {
				return Fail("usage", "usage: field add <type> <field> --kind <kind>")
			}
			typeID, name := args[1], args[2]
			flags := parseFlags(args[3:])
			kind := domain.FieldKind(flags.Get("kind"))
			if kind == "" {
				kind = domain.FieldText
			}
			enumValues := splitList(flags.Get("values"))
			fd, err := s.AddField(typeID, name, kind, flags.Bool("required"), flags.Bool("unique"), enumValues, flags.Get("target"))
			if err != nil {
				return fromErr(err)
			}
			return OK(fd, Effect{Kind: "field.add", Field: name})
		default:
			return Fail("unknown_command", "unknown field command: "+args[0])
		}
	})
}

func (r *Runner) runObject(args []string) Result {
	if len(args) == 0 {
		return Fail("usage", "usage: object create|get|list|set|link|unlink")
	}
	return r.withStore(func(s *store.Store) Result {
		switch args[0] {
		case "create":
			if len(args) < 2 {
				return Fail("usage", "usage: object create <type> --id <id> [--field k=v] [--body <file>|--body-stdin]")
			}
			flags := parseFlags(args[2:])
			fields := parseFieldFlags(args[2:])
			body, err := r.bodyInputFromFlags(flags)
			if err != nil {
				return fromErr(err)
			}
			obj, err := s.CreateObjectWithBody(args[1], flags.Get("id"), flags.Get("title"), fields, body)
			if err != nil {
				return fromErr(err)
			}
			return OK(obj, Effect{Kind: "object.create", Object: obj.ID})
		case "get":
			if len(args) < 2 {
				return Fail("usage", "usage: object get <id> [--no-body|--body-preview <n>]")
			}
			opts, err := detailOptionsFromFlags(parseFlags(args[2:]))
			if err != nil {
				return fromErr(err)
			}
			obj, err := s.GetObject(args[1])
			if err != nil {
				return fromErr(err)
			}
			links, _ := s.Links(args[1])
			backlinks, _ := s.Backlinks(args[1])
			data := map[string]any{"object": obj, "links": links, "backlinks": backlinks}
			r.addBodyDetail(s, args[1], data, opts)
			return OK(data)
		case "list":
			flags := parseFlags(args[1:])
			limit := flags.Int("limit", 100)
			objects, err := s.ListObjects(flags.Get("type"), limit)
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"objects": objects, "count": len(objects)})
		case "set":
			if len(args) < 4 {
				return Fail("usage", "usage: object set <id> <field> <value>")
			}
			if err := s.SetField(args[1], args[2], args[3]); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"object": args[1], "field": args[2], "value": args[3]}, Effect{Kind: "object.set", Object: args[1], Field: args[2]})
		case "link":
			if len(args) < 4 {
				return Fail("usage", "usage: object link <id> <field> <target>")
			}
			if err := s.LinkObject(args[1], args[2], args[3]); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"object": args[1], "field": args[2], "target": args[3]}, Effect{Kind: "object.link", Object: args[1], Field: args[2]})
		case "unlink":
			if len(args) < 4 {
				return Fail("usage", "usage: object unlink <id> <field> <target>")
			}
			if err := s.UnlinkObject(args[1], args[2], args[3]); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"object": args[1], "field": args[2], "target": args[3]}, Effect{Kind: "object.unlink", Object: args[1], Field: args[2]})
		default:
			return Fail("unknown_command", "unknown object command: "+args[0])
		}
	})
}

type objectDetailOptions struct {
	NoBody      bool
	BodyPreview int
}

func (r *Runner) objectDetail(id string, opts objectDetailOptions) Result {
	return r.withStore(func(s *store.Store) Result {
		obj, err := s.GetObject(id)
		if err != nil {
			return fromErr(err)
		}
		links, _ := s.Links(id)
		backlinks, _ := s.Backlinks(id)
		data := map[string]any{"object": obj, "links": links, "backlinks": backlinks}
		r.addBodyDetail(s, id, data, opts)
		return OK(data)
	})
}

func (r *Runner) runQuery(args []string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: query <type> [--select a,b] [--where expr]")
	}
	flags := parseFlags(args[1:])
	opts := store.QueryOptions{
		Select: splitList(flags.Get("select")),
		Where:  flags.All("where"),
		Sort:   flags.Get("sort"),
		Limit:  flags.Int("limit", 100),
	}
	return r.withStore(func(s *store.Store) Result {
		result, err := s.Query(args[0], opts)
		if err != nil {
			return fromErr(err)
		}
		return OK(result)
	})
}

func (r *Runner) runLinks(args []string, back bool) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: links <id> [--type <type>] [--kind <kind>] [--relation <field>] [--filter <text>]")
	}
	flags := parseFlags(args[1:])
	opts := store.LinkFilterOptions{
		Type:     flags.Get("type"),
		Kind:     flags.Get("kind"),
		Relation: flags.Get("relation"),
		Filter:   flags.Get("filter"),
	}
	return r.withStore(func(s *store.Store) Result {
		links, err := s.FilteredLinks(args[0], back, opts)
		if err != nil {
			return fromErr(err)
		}
		return OK(map[string]any{"links": links, "count": len(links)})
	})
}

func (r *Runner) runGraph(args []string) Result {
	if len(args) == 0 {
		return Fail("usage", "usage: graph export|query|view|views")
	}
	switch args[0] {
	case "export":
		return r.withStore(func(s *store.Store) Result {
			objects, err := s.ListObjects("", 10000)
			if err != nil {
				return fromErr(err)
			}
			links, err := s.AllLinks()
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"nodes": objects, "edges": links})
		})
	case "views":
		return r.runGraphViews(args[1:])
	case "view":
		return r.runGraphView(args[1:])
	case "query":
		return r.runGraphQuery(args[1:])
	default:
		return Fail("unknown_command", "unknown graph command: "+args[0])
	}
}

type graphViewConfig struct {
	Version int         `json:"version"`
	Views   []graphView `json:"views"`
}

type graphView struct {
	ID          string                       `json:"id"`
	Label       string                       `json:"label"`
	RootType    string                       `json:"root_type"`
	Description string                       `json:"description,omitempty"`
	Steps       []graphViewStep              `json:"steps,omitempty"`
	Paths       []graphViewPath              `json:"paths,omitempty"`
	Nodes       map[string]graphNodeTemplate `json:"nodes,omitempty"`
	Bridges     map[string]graphBridgeConfig `json:"bridges,omitempty"`
}

type graphViewStep struct {
	Relation   string `json:"relation"`
	Direction  string `json:"direction"`
	TargetType string `json:"target_type,omitempty"`
	Display    string `json:"display,omitempty"`
}

type graphViewPath struct {
	Steps []graphViewStep `json:"steps"`
}

type graphNodeTemplate struct {
	Variant       string   `json:"variant,omitempty"`
	TitleField    string   `json:"title_field,omitempty"`
	SubtitleField string   `json:"subtitle_field,omitempty"`
	MetaFields    []string `json:"meta_fields,omitempty"`
	BadgeFields   []string `json:"badge_fields,omitempty"`
	ImageField    string   `json:"image_field,omitempty"`
}

type graphBridgeConfig struct {
	LabelFields []string `json:"label_fields,omitempty"`
	Aggregate   *bool    `json:"aggregate,omitempty"`
}

func (r *Runner) runGraphViews(args []string) Result {
	if len(args) == 0 || args[0] == "list" {
		config, err := r.readGraphViewConfig()
		if err != nil {
			return fromErr(err)
		}
		return r.withStore(func(s *store.Store) Result {
			types, err := s.ListTypes()
			if err != nil {
				return fromErr(err)
			}
			if err := validateGraphViewConfig(config, types); err != nil {
				return fromErr(err)
			}
			return OK(config)
		})
	}
	if args[0] != "write" {
		return Fail("usage", "usage: graph views [list]|write --stdin")
	}
	flags := parseFlags(args[1:])
	if !flags.Bool("stdin") {
		return Fail("usage", "usage: graph views write --stdin")
	}
	if r.Stdin == nil {
		return Fail("bad_request", "stdin is required")
	}
	raw, err := io.ReadAll(r.Stdin)
	if err != nil {
		return fromErr(err)
	}
	var config graphViewConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return fromErr(err)
	}
	return r.validateAndWriteGraphViewConfig(config)
}

func (r *Runner) readGraphViewConfig() (graphViewConfig, error) {
	path := filepath.Join(r.Root, "memex.graph-views.json")
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return graphViewConfig{Version: 1, Views: []graphView{}}, nil
	}
	if err != nil {
		return graphViewConfig{}, err
	}
	var config graphViewConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return graphViewConfig{}, err
	}
	return normalizeGraphViewConfig(config)
}

func (r *Runner) writeGraphViewConfig(config graphViewConfig) error {
	if err := os.MkdirAll(r.Root, 0755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	path := filepath.Join(r.Root, "memex.graph-views.json")
	tmp, err := os.CreateTemp(r.Root, ".memex.graph-views-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0644); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func normalizeGraphViewConfig(config graphViewConfig) (graphViewConfig, error) {
	if config.Version == 0 {
		config.Version = 1
	}
	seen := make(map[string]bool)
	out := make([]graphView, 0, len(config.Views))
	for _, view := range config.Views {
		view.ID = strings.TrimSpace(view.ID)
		view.Label = strings.TrimSpace(view.Label)
		view.RootType = strings.TrimSpace(view.RootType)
		view.Description = strings.TrimSpace(view.Description)
		if view.ID == "" {
			return graphViewConfig{}, fmt.Errorf("graph view id is required")
		}
		if seen[view.ID] {
			return graphViewConfig{}, fmt.Errorf("duplicate graph view id: %s", view.ID)
		}
		if view.Label == "" {
			view.Label = view.ID
		}
		if view.RootType == "" {
			return graphViewConfig{}, fmt.Errorf("graph view %s root_type is required", view.ID)
		}
		if len(view.Paths) == 0 && len(view.Steps) > 0 {
			view.Paths = []graphViewPath{{Steps: view.Steps}}
		}
		if len(view.Paths) == 0 {
			return graphViewConfig{}, fmt.Errorf("graph view %s requires at least one step", view.ID)
		}
		for pathIndex := range view.Paths {
			if len(view.Paths[pathIndex].Steps) == 0 {
				return graphViewConfig{}, fmt.Errorf("graph view %s path %d requires at least one step", view.ID, pathIndex)
			}
			for stepIndex := range view.Paths[pathIndex].Steps {
				step := &view.Paths[pathIndex].Steps[stepIndex]
				step.Relation = strings.TrimSpace(step.Relation)
				step.Direction = strings.TrimSpace(step.Direction)
				step.TargetType = strings.TrimSpace(step.TargetType)
				step.Display = strings.TrimSpace(step.Display)
				if step.Relation == "" {
					return graphViewConfig{}, fmt.Errorf("graph view %s path %d step %d relation is required", view.ID, pathIndex, stepIndex)
				}
				if step.Direction != "in" && step.Direction != "out" {
					return graphViewConfig{}, fmt.Errorf("graph view %s path %d step %d direction must be in or out", view.ID, pathIndex, stepIndex)
				}
				if step.Display != "" && step.Display != "node" && step.Display != "bridge" {
					return graphViewConfig{}, fmt.Errorf("graph view %s path %d step %d display must be node or bridge", view.ID, pathIndex, stepIndex)
				}
				if step.Display == "bridge" && stepIndex == len(view.Paths[pathIndex].Steps)-1 {
					return graphViewConfig{}, fmt.Errorf("graph view %s path %d cannot bridge its terminal step", view.ID, pathIndex)
				}
			}
		}
		if config.Version < 2 && (len(view.Nodes) > 0 || len(view.Bridges) > 0 || len(view.Paths) > 1) {
			config.Version = 2
		}
		if config.Version >= 2 {
			view.Steps = nil
		} else {
			view.Steps = append([]graphViewStep(nil), view.Paths[0].Steps...)
			view.Paths = nil
		}
		seen[view.ID] = true
		out = append(out, view)
	}
	config.Views = out
	return config, nil
}

func (r *Runner) runBody(args []string) Result {
	if len(args) < 2 {
		return Fail("usage", "usage: body path|refresh|write|append <id>")
	}
	return r.withStore(func(s *store.Store) Result {
		switch args[0] {
		case "path":
			path, err := s.BodyPath(args[1])
			if err != nil {
				return fromErr(err)
			}
			obj, err := s.GetObject(args[1])
			if err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"body_path": obj.BodyPath, "body_abs_path": path})
		case "refresh":
			if err := s.RefreshBody(args[1]); err != nil {
				return fromErr(err)
			}
			return OK(map[string]any{"object": args[1], "refreshed": true}, Effect{Kind: "body.refresh", Object: args[1]})
		case "write", "append":
			flags := parseFlags(args[2:])
			if !flags.Bool("stdin") {
				return Fail("usage", "usage: body "+args[0]+" <id> --stdin")
			}
			body, err := r.readStdinString()
			if err != nil {
				return fromErr(err)
			}
			if args[0] == "write" {
				err = s.WriteBody(args[1], body)
			} else {
				err = s.AppendBody(args[1], body)
			}
			if err != nil {
				return fromErr(err)
			}
			path, _ := s.BodyPath(args[1])
			return OK(map[string]any{"object": args[1], "body_abs_path": path, "bytes": len([]byte(body)), "written": args[0] == "write", "appended": args[0] == "append"}, Effect{Kind: "body." + args[0], Object: args[1]})
		default:
			return Fail("unknown_command", "unknown body command: "+args[0])
		}
	})
}

func (r *Runner) runAsset(args []string) Result {
	if len(args) < 1 {
		return Fail("usage", "usage: asset import <file> [--name <filename>]")
	}
	switch args[0] {
	case "import":
		if len(args) < 2 {
			return Fail("usage", "usage: asset import <file> [--name <filename>]")
		}
		flags := parseFlags(args[2:])
		return r.withStore(func(s *store.Store) Result {
			asset, err := s.ImportAssetFile(args[1], flags.Get("name"))
			if err != nil {
				return fromErr(err)
			}
			return OK(asset, Effect{Kind: "asset.import"})
		})
	default:
		return Fail("unknown_command", "unknown asset command: "+args[0])
	}
}

func (r *Runner) extractBodyInput(args []string) ([]string, *string, error) {
	rest := make([]string, 0, len(args))
	var body *string
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--body-stdin":
			if body != nil {
				return nil, nil, fmt.Errorf("use only one of --body and --body-stdin")
			}
			value, err := r.readStdinString()
			if err != nil {
				return nil, nil, err
			}
			body = &value
		case "--body":
			if body != nil {
				return nil, nil, fmt.Errorf("use only one of --body and --body-stdin")
			}
			if i+1 >= len(args) {
				return nil, nil, fmt.Errorf("--body requires a file path")
			}
			value, err := readBodyFile(args[i+1])
			if err != nil {
				return nil, nil, err
			}
			body = &value
			i++
		default:
			rest = append(rest, args[i])
		}
	}
	return rest, body, nil
}

func (r *Runner) bodyInputFromFlags(flags Flags) (*string, error) {
	bodyFile := flags.Get("body")
	bodyStdin := flags.Bool("body-stdin")
	if bodyFile != "" && bodyStdin {
		return nil, fmt.Errorf("use only one of --body and --body-stdin")
	}
	if bodyFile != "" {
		value, err := readBodyFile(bodyFile)
		if err != nil {
			return nil, err
		}
		return &value, nil
	}
	if bodyStdin {
		value, err := r.readStdinString()
		if err != nil {
			return nil, err
		}
		return &value, nil
	}
	return nil, nil
}

func readBodyFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (r *Runner) readStdinString() (string, error) {
	if r.Stdin == nil {
		return "", fmt.Errorf("stdin is unavailable in this runner")
	}
	data, err := io.ReadAll(r.Stdin)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func detailOptionsFromFlags(flags Flags) (objectDetailOptions, error) {
	opts := objectDetailOptions{BodyPreview: -1}
	if flags.Bool("no-body") {
		opts.NoBody = true
	}
	if flags.Has("body-preview") {
		n, err := strconv.Atoi(flags.Get("body-preview"))
		if err != nil || n < 0 {
			return opts, fmt.Errorf("--body-preview requires a non-negative integer")
		}
		opts.BodyPreview = n
	}
	return opts, nil
}

func (r *Runner) addBodyDetail(s *store.Store, id string, data map[string]any, opts objectDetailOptions) {
	if opts.NoBody {
		data["body_omitted"] = true
		return
	}
	body, _ := s.ReadBody(id)
	if opts.BodyPreview >= 0 {
		data["body_preview"] = truncateRunes(body, opts.BodyPreview)
		data["body_truncated"] = runeLen(body) > opts.BodyPreview
		data["body_chars"] = runeLen(body)
		return
	}
	data["body"] = body
}

func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

func runeLen(s string) int {
	return len([]rune(s))
}

func (r *Runner) withStore(fn func(*store.Store) Result) Result {
	s, err := store.Open(r.Root)
	if err != nil {
		return fromErr(err)
	}
	defer s.Close()
	return fn(s)
}

func currentIssues(s *store.Store) ([]domain.Issue, error) {
	if err := s.RevalidateAll(); err != nil {
		return nil, err
	}
	return s.Issues()
}

func fromErr(err error) Result {
	return Fail("error", err.Error())
}

type Flags map[string][]string

func parseFlags(args []string) Flags {
	flags := make(Flags)
	for i := 0; i < len(args); i++ {
		if args[i] == "--field" && i+1 < len(args) {
			flags["field"] = append(flags["field"], args[i+1])
			i++
			continue
		}
		if strings.HasPrefix(args[i], "--") {
			key := strings.TrimPrefix(args[i], "--")
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				flags[key] = append(flags[key], args[i+1])
				i++
			} else {
				flags[key] = append(flags[key], "true")
			}
		}
	}
	return flags
}

func parseFieldsFromArgs(args []string, aliases map[string]string) (map[string]string, error) {
	fields := make(map[string]string)
	flags := parseFlags(args)
	for flag, field := range aliases {
		if value := flags.Get(flag); value != "" {
			fields[field] = value
		}
	}
	for _, assignment := range flags.All("field") {
		key, value, ok := strings.Cut(assignment, "=")
		if !ok || strings.TrimSpace(key) == "" {
			return nil, fmt.Errorf("field assignment must be key=value: %s", assignment)
		}
		fields[strings.TrimSpace(key)] = value
	}
	for _, assignment := range positionalAssignments(args) {
		key, value, ok := strings.Cut(assignment, "=")
		if !ok || strings.TrimSpace(key) == "" {
			return nil, fmt.Errorf("field assignment must be key=value: %s", assignment)
		}
		fields[strings.TrimSpace(key)] = value
	}
	return fields, nil
}

func positionalAssignments(args []string) []string {
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--field" {
			if i+1 < len(args) {
				i++
			}
			continue
		}
		if strings.HasPrefix(arg, "--") {
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				i++
			}
			continue
		}
		if strings.Contains(arg, "=") {
			out = append(out, arg)
		}
	}
	return out
}

func sourceAddFieldAliases() map[string]string {
	return map[string]string{
		"title":             "title",
		"url":               "url",
		"platform":          "platform",
		"item-type":         "item_type",
		"author":            "author",
		"published-at":      "published_at",
		"collected-at":      "collected_at",
		"quality":           "quality",
		"processing-status": "processing_status",
		"evidence-level":    "evidence_level",
		"summary":           "summary",
		"language":          "language",
		"capture-method":    "capture_method",
		"capture-status":    "capture_status",
		"captured-at":       "captured_at",
		"about-company":     "about_company",
		"from-touchpoint":   "from_touchpoint",
	}
}

func filterIssuesForObject(issues []domain.Issue, id string) []domain.Issue {
	out := make([]domain.Issue, 0)
	for _, issue := range issues {
		if issue.ObjectID == id {
			out = append(out, issue)
		}
	}
	return out
}

func (f Flags) Bool(name string) bool {
	return len(f[name]) > 0 && f[name][0] == "true"
}

func (f Flags) Int(name string, fallback int) int {
	if len(f[name]) == 0 {
		return fallback
	}
	n, err := strconv.Atoi(f[name][0])
	if err != nil {
		return fallback
	}
	return n
}

func (f Flags) All(name string) []string {
	return f[name]
}

func (f Flags) Get(name string) string {
	if len(f[name]) == 0 {
		return ""
	}
	return f[name][0]
}

func (f Flags) String() string {
	return fmt.Sprintf("%v", map[string][]string(f))
}

func (f Flags) Set(name, value string) {
	f[name] = append(f[name], value)
}

func (f Flags) Del(name string) {
	delete(f, name)
}

func (f Flags) Has(name string) bool {
	return len(f[name]) > 0
}

func (f Flags) MarshalJSON() ([]byte, error) {
	return nil, fmt.Errorf("not implemented")
}

func (f Flags) UnmarshalJSON(_ []byte) error {
	return fmt.Errorf("not implemented")
}

func (f Flags) Value(name string) string {
	return f.Get(name)
}

func (f Flags) Append(name, value string) {
	f[name] = append(f[name], value)
}

func (f Flags) First(name string) string {
	return f.Get(name)
}

func (f Flags) Required(name string) (string, bool) {
	v := f.Get(name)
	return v, v != ""
}

func (f Flags) Slice(name string) []string {
	return f[name]
}

func (f Flags) Lookup(name string) (string, bool) {
	if len(f[name]) == 0 {
		return "", false
	}
	return f[name][0], true
}

func (f Flags) Merge(other Flags) {
	for k, vals := range other {
		f[k] = append(f[k], vals...)
	}
}

func (f Flags) Copy() Flags {
	out := make(Flags)
	for k, vals := range f {
		out[k] = append([]string(nil), vals...)
	}
	return out
}

func (f Flags) IsEmpty() bool {
	return len(f) == 0
}

func (f Flags) Keys() []string {
	var keys []string
	for k := range f {
		keys = append(keys, k)
	}
	return keys
}

func (f Flags) Len() int {
	return len(f)
}

func (f Flags) Values(name string) []string {
	return f[name]
}

func (f Flags) Or(name, fallback string) string {
	if v := f.Get(name); v != "" {
		return v
	}
	return fallback
}

func (f Flags) Path(name string) string {
	return f.Get(name)
}

func parseFieldFlags(args []string) map[string]string {
	out := make(map[string]string)
	for i := 0; i < len(args); i++ {
		if args[i] != "--field" || i+1 >= len(args) {
			continue
		}
		if key, value, ok := strings.Cut(args[i+1], "="); ok {
			out[key] = value
		}
		i++
	}
	return out
}

func parseAssignments(args []string) (map[string]string, error) {
	out := make(map[string]string)
	for _, arg := range args {
		key, value, ok := strings.Cut(arg, "=")
		if !ok || strings.TrimSpace(key) == "" {
			return nil, fmt.Errorf("field assignment must be key=value: %s", arg)
		}
		out[strings.TrimSpace(key)] = value
	}
	return out, nil
}

func splitList(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func usage() string {
	return `mmx commands:
  init
  vault info
  status
  create <type> <id> [--body <file>|--body-stdin] field=value...
  upsert <type> <id> [--body <file>|--body-stdin] field=value...
  source add <id> [--body <file>|--body-stdin] [--title <title>] [--url <url>] field=value...
  get <id> [--no-body|--body-preview <n>]
  set <id> <field> <value>
  link <id> <field> <target-id>
  delete <id> --yes
  type list|show|create
  field list <type>
  field add <type> <field> --kind <kind>
  object create|get|list|set|link|unlink
  query <type>
  links <id> [--type <type>] [--kind <kind>] [--relation <field>] [--filter <text>]
  backlinks <id> [--type <type>] [--kind <kind>] [--relation <field>] [--filter <text>]
  graph export
  graph query --view <id> --center <object-id>
  graph view list|show|validate|apply
  graph views [list]|write --stdin
  body path|refresh|write|append <id>
  asset import <file> [--name <filename>]
  refresh
  issues
  doctor [--fix-titles]`
}

func (f Flags) Index(name string, i int) string {
	if len(f[name]) <= i {
		return ""
	}
	return f[name][i]
}

func (f Flags) Raw() map[string][]string {
	return map[string][]string(f)
}

func (f Flags) Env(name string) string {
	if v := f.Get(name); v != "" {
		return v
	}
	return os.Getenv(name)
}
