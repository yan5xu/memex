package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/itchyny/gojq"
	"github.com/spf13/cobra"
	"github.com/yan5xu/mbase/internal/app"
	"github.com/yan5xu/mbase/internal/domain"
	"github.com/yan5xu/mbase/internal/store"
	"github.com/yan5xu/mbase/internal/web"
)

var rootDir = "."
var jsonOut bool
var jsonFields []string
var jqExpr string

func Execute() error {
	root := &cobra.Command{
		Use:                "mbase",
		Short:              "Local-first object graph base",
		DisableFlagParsing: true,
		RunE: func(_ *cobra.Command, args []string) error {
			argv, err := preprocess(args)
			if err != nil {
				return err
			}
			if jqExpr != "" && !jsonOut {
				return fmt.Errorf("--jq requires --json")
			}
			argv = optimizeJSONArgs(argv)
			if len(argv) > 0 && argv[0] == "serve" {
				addr := "127.0.0.1:8765"
				for i := 1; i < len(argv); i++ {
					if argv[i] == "--addr" && i+1 < len(argv) {
						addr = argv[i+1]
						i++
					}
				}
				return web.Server{Root: rootDir, Addr: addr}.ListenAndServe()
			}
			runner := app.NewRunner(rootDir)
			runner.Stdin = os.Stdin
			result := runner.Run(context.Background(), argv)
			if jsonOut {
				return printJSON(result)
			}
			if !result.OK {
				return fmt.Errorf("%s", result.Error.Message)
			}
			return printHuman(argv, result)
		},
	}
	return root.Execute()
}

func preprocess(args []string) ([]string, error) {
	var out []string
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-C":
			if i+1 < len(args) {
				rootDir = args[i+1]
				i++
			}
		case "-q", "--jq":
			if i+1 >= len(args) {
				return nil, fmt.Errorf("%s requires an expression", args[i])
			}
			jqExpr = args[i+1]
			i++
		case "--json":
			jsonOut = true
			if i+1 < len(args) && shouldConsumeJSONFields(args[i+1]) {
				jsonFields = splitCSV(args[i+1])
				i++
			}
		default:
			if strings.HasPrefix(args[i], "--json=") {
				jsonOut = true
				jsonFields = splitCSV(strings.TrimPrefix(args[i], "--json="))
				continue
			}
			if strings.HasPrefix(args[i], "--jq=") {
				jqExpr = strings.TrimPrefix(args[i], "--jq=")
				continue
			}
			out = append(out, args[i])
		}
	}
	return out, nil
}

func printJSON(v any) error {
	payload := v
	if len(jsonFields) > 0 {
		payload = selectJSONFields(payload, jsonFields)
	}
	if jqExpr != "" {
		return printJQ(payload, jqExpr)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(payload)
}

func printHuman(argv []string, result app.Result) error {
	if len(argv) == 0 {
		if data, ok := result.Data.(map[string]any); ok {
			fmt.Println(data["usage"])
			return nil
		}
		return printJSON(result.Data)
	}
	switch argv[0] {
	case "create":
		if obj, ok := asObject(result.Data); ok {
			printCreatedObject(obj)
			return nil
		}
	case "get":
		if printObjectDetail(result.Data) {
			return nil
		}
	case "set":
		data, _ := result.Data.(map[string]any)
		fmt.Printf("Updated %s\n", data["object"])
		fmt.Printf("  %s = %s\n", data["field"], data["value"])
		return nil
	case "link":
		data, _ := result.Data.(map[string]any)
		fmt.Printf("Linked %s\n", data["object"])
		fmt.Printf("  %s -> %s\n", data["field"], data["target"])
		return nil
	case "delete", "remove":
		if printDeletedObject(result.Data) {
			return nil
		}
	case "query":
		if q, ok := result.Data.(*store.QueryResult); ok {
			printQuery(q)
			return nil
		}
	case "object":
		if len(argv) > 1 {
			switch argv[1] {
			case "create":
				if obj, ok := asObject(result.Data); ok {
					printCreatedObject(obj)
					return nil
				}
			case "get":
				if printObjectDetail(result.Data) {
					return nil
				}
			}
		}
	case "body":
		if printBodyResult(argv, result.Data) {
			return nil
		}
	}
	return printJSON(result.Data)
}

func optimizeJSONArgs(argv []string) []string {
	if !jsonOut || len(jsonFields) == 0 || jsonFieldsContain("body") || jsonFieldsContain("body_preview") || hasArg(argv, "--no-body") {
		return argv
	}
	if len(argv) >= 2 && argv[0] == "get" {
		return append(append([]string(nil), argv...), "--no-body")
	}
	if len(argv) >= 3 && argv[0] == "object" && argv[1] == "get" {
		return append(append([]string(nil), argv...), "--no-body")
	}
	return argv
}

func shouldConsumeJSONFields(next string) bool {
	if strings.HasPrefix(next, "-") {
		return false
	}
	if strings.Contains(next, ",") {
		return true
	}
	return !isTopLevelCommand(next)
}

func isTopLevelCommand(s string) bool {
	switch s {
	case "vault", "init", "serve", "status", "type", "field", "object", "create", "get", "set", "link", "delete", "remove", "query", "links", "backlinks", "graph", "body", "refresh", "issues", "doctor":
		return true
	default:
		return false
	}
}

func splitCSV(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func jsonFieldsContain(name string) bool {
	for _, field := range jsonFields {
		if field == name {
			return true
		}
	}
	return false
}

func hasArg(argv []string, name string) bool {
	for _, arg := range argv {
		if arg == name {
			return true
		}
	}
	return false
}

func selectJSONFields(v any, fields []string) any {
	normalized := normalizeJSON(v)
	if result, ok := normalized.(map[string]any); ok {
		if data, ok := result["data"]; ok {
			if _, hasOK := result["ok"]; hasOK {
				normalized = data
			}
		}
	}
	source, ok := normalized.(map[string]any)
	if !ok {
		return normalized
	}
	out := make(map[string]any, len(fields))
	for _, field := range fields {
		if value, ok := lookupJSONField(source, field); ok {
			out[field] = value
		}
	}
	return out
}

func lookupJSONField(source map[string]any, field string) (any, bool) {
	if value, ok := lookupDotPath(source, field); ok {
		return value, true
	}
	if object, ok := source["object"].(map[string]any); ok {
		if value, ok := lookupDotPath(object, field); ok {
			return value, true
		}
		if fields, ok := object["fields"].(map[string]any); ok {
			if value, ok := lookupDotPath(fields, field); ok {
				return value, true
			}
		}
	}
	return nil, false
}

func lookupDotPath(source map[string]any, path string) (any, bool) {
	current := any(source)
	for _, part := range strings.Split(path, ".") {
		m, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = m[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func normalizeJSON(v any) any {
	data, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return v
	}
	return out
}

func printJQ(v any, expr string) error {
	query, err := gojq.Parse(expr)
	if err != nil {
		return err
	}
	iter := query.Run(normalizeJSON(v))
	var wrote bool
	for {
		value, ok := iter.Next()
		if !ok {
			break
		}
		if err, ok := value.(error); ok {
			return err
		}
		if err := printJQValue(value); err != nil {
			return err
		}
		wrote = true
	}
	if !wrote {
		return nil
	}
	return nil
}

func printJQValue(value any) error {
	switch v := value.(type) {
	case nil:
		fmt.Println("null")
	case string:
		fmt.Println(v)
	case bool:
		fmt.Println(v)
	case float64:
		fmt.Println(v)
	default:
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(v)
	}
	return nil
}

func asObject(v any) (*domain.Object, bool) {
	switch obj := v.(type) {
	case *domain.Object:
		return obj, true
	case domain.Object:
		return &obj, true
	default:
		return nil, false
	}
}

func printCreatedObject(obj *domain.Object) {
	fmt.Printf("Created %s\n", obj.ID)
	fmt.Printf("  type: %s\n", obj.TypeID)
	fmt.Printf("  body: %s\n", obj.BodyAbsPath)
	fmt.Println()
	fmt.Printf("Next: edit %s, then run `%s body refresh %s` if you add wiki links manually.\n", obj.BodyAbsPath, commandPrefix(), obj.ID)
}

func printDeletedObject(v any) bool {
	data, ok := v.(map[string]any)
	if !ok {
		return false
	}
	obj, ok := asObject(data["object"])
	if !ok {
		return false
	}
	fmt.Printf("Deleted %s\n", obj.ID)
	fmt.Printf("  type: %s\n", obj.TypeID)
	fmt.Printf("  body kept: %s\n", obj.BodyAbsPath)
	return true
}

func printBodyResult(argv []string, v any) bool {
	if len(argv) < 2 {
		return false
	}
	data, ok := v.(map[string]any)
	if !ok {
		return false
	}
	switch argv[1] {
	case "write":
		fmt.Printf("Wrote body for %s\n", data["object"])
	case "append":
		fmt.Printf("Appended body for %s\n", data["object"])
	default:
		return false
	}
	fmt.Printf("  body: %s\n", data["body_abs_path"])
	fmt.Printf("  bytes: %v\n", data["bytes"])
	return true
}

func printObjectDetail(v any) bool {
	data, ok := v.(map[string]any)
	if !ok {
		return false
	}
	obj, ok := asObject(data["object"])
	if !ok {
		return false
	}
	fmt.Printf("%s\n", obj.ID)
	fmt.Printf("  type: %s\n", obj.TypeID)
	if obj.Title != "" {
		fmt.Printf("  title: %s\n", obj.Title)
	}
	fmt.Printf("  body: %s\n", obj.BodyAbsPath)

	if len(obj.Fields) > 0 {
		fmt.Println()
		fmt.Println("Fields")
		keys := make([]string, 0, len(obj.Fields))
		for k := range obj.Fields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("  %-16s %s\n", k, humanValue(obj.Fields[k]))
		}
	}

	printLinks("Links", data["links"], false)
	printLinks("Backlinks", data["backlinks"], true)
	return true
}

func printLinks(title string, v any, reverse bool) {
	links, ok := v.([]domain.Link)
	if !ok {
		if ptrs, ok := v.([]*domain.Link); ok {
			for _, link := range ptrs {
				if link != nil {
					links = append(links, *link)
				}
			}
		}
	}
	if len(links) == 0 {
		return
	}
	fmt.Println()
	fmt.Println(title)
	limit := len(links)
	if limit > 12 {
		limit = 12
	}
	for _, link := range links[:limit] {
		target := link.ToID
		if reverse {
			target = link.FromID
		}
		fmt.Printf("  %-10s %-18s %s\n", link.Kind, link.Relation, target)
	}
	if len(links) > limit {
		fmt.Printf("  ... %d more\n", len(links)-limit)
	}
}

func printQuery(q *store.QueryResult) {
	fmt.Printf("%s: %d rows\n", q.Type, q.Count)
	if len(q.Rows) == 0 {
		return
	}
	fields := []string{"id"}
	for _, f := range q.Fields {
		if f.Name != "id" {
			fields = append(fields, f.Name)
		}
	}
	widths := make([]int, len(fields))
	for i, field := range fields {
		widths[i] = len(field)
	}
	for _, row := range q.Rows {
		for i, field := range fields {
			if n := len(humanValue(row[field])); n > widths[i] {
				widths[i] = min(n, 36)
			}
		}
	}
	for i, field := range fields {
		fmt.Printf("%-*s", widths[i]+2, field)
	}
	fmt.Println()
	for i := range fields {
		fmt.Print(strings.Repeat("-", widths[i]))
		fmt.Print("  ")
	}
	fmt.Println()
	for _, row := range q.Rows {
		for i, field := range fields {
			value := truncate(humanValue(row[field]), widths[i])
			fmt.Printf("%-*s", widths[i]+2, value)
		}
		fmt.Println()
	}
}

func humanValue(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case []string:
		return strings.Join(x, ", ")
	case []any:
		parts := make([]string, 0, len(x))
		for _, item := range x {
			parts = append(parts, humanValue(item))
		}
		return strings.Join(parts, ", ")
	default:
		return fmt.Sprint(x)
	}
}

func truncate(s string, width int) string {
	if len(s) <= width {
		return s
	}
	if width <= 1 {
		return s[:width]
	}
	return s[:width-1] + "…"
}

func commandPrefix() string {
	return "mbase -C " + shellQuote(rootDir)
}

func shellQuote(s string) string {
	if s == "" {
		return strconv.Quote(".")
	}
	if strings.IndexFunc(s, func(r rune) bool {
		return !(r == '/' || r == '.' || r == '_' || r == '-' || r == ':' || r == '+' || r == '=' || r == '@' || r == '%' || r == ',' || r == '~' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z')
	}) == -1 {
		return s
	}
	return strconv.Quote(s)
}
