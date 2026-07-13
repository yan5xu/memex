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
	"github.com/yan5xu/mmx/internal/app"
	"github.com/yan5xu/mmx/internal/domain"
	"github.com/yan5xu/mmx/internal/store"
	"github.com/yan5xu/mmx/internal/web"
)

var rootDir = "."
var jsonOut bool
var jsonFields []string
var jqExpr string

func Execute() error {
	root := &cobra.Command{
		Use:                "mmx",
		Short:              "Memex local-first typed knowledge workspace",
		DisableFlagParsing: true,
		RunE: func(_ *cobra.Command, args []string) error {
			argv, err := preprocess(args)
			if err != nil {
				return err
			}
			if hasHelpArg(argv) {
				result := app.NewRunner(rootDir).Run(context.Background(), nil)
				if jsonOut {
					return printJSON(result)
				}
				if data, ok := result.Data.(map[string]any); ok {
					fmt.Println(data["usage"])
					return nil
				}
				return printHuman(nil, result)
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
	case "upsert":
		if printUpsertedObject(result.Data) {
			return nil
		}
	case "source":
		if len(argv) > 1 && argv[1] == "add" && printUpsertedObject(result.Data) {
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
	case "field":
		if len(argv) > 1 && argv[1] == "list" && printFieldList(result.Data) {
			return nil
		}
	case "query":
		if q, ok := result.Data.(*store.QueryResult); ok {
			printQuery(q)
			return nil
		}
	case "links":
		if printLinkList("Links", result.Data, false) {
			return nil
		}
	case "backlinks":
		if printLinkList("Backlinks", result.Data, true) {
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
	case "asset":
		if printAssetResult(argv, result.Data) {
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
	case "vault", "init", "serve", "status", "type", "field", "object", "create", "upsert", "source", "get", "set", "link", "delete", "remove", "query", "links", "backlinks", "graph", "body", "asset", "refresh", "issues", "doctor":
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

func hasHelpArg(argv []string) bool {
	for _, arg := range argv {
		if arg == "-h" || arg == "--help" {
			return true
		}
	}
	return len(argv) == 1 && argv[0] == "help"
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

func printUpsertedObject(v any) bool {
	data, ok := v.(map[string]any)
	if !ok {
		return false
	}
	obj, ok := asObject(data["object"])
	if !ok {
		return false
	}
	action := "Updated"
	if created, ok := data["created"].(bool); ok && created {
		action = "Created"
	}
	fmt.Printf("%s %s\n", action, obj.ID)
	fmt.Printf("  type: %s\n", obj.TypeID)
	if obj.Title != "" {
		fmt.Printf("  title: %s\n", obj.Title)
	}
	fmt.Printf("  body: %s\n", obj.BodyAbsPath)
	if issueCount, ok := data["issue_count"]; ok {
		fmt.Printf("  issues: %v\n", issueCount)
	}
	if action == "Created" {
		fmt.Println()
		fmt.Printf("Next: edit %s, then run `%s body refresh %s` if you add wiki links manually.\n", obj.BodyAbsPath, commandPrefix(), obj.ID)
	}
	return true
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

func printLinkList(title string, v any, reverse bool) bool {
	data, ok := v.(map[string]any)
	if !ok {
		return false
	}
	links := linkSlice(data["links"])
	count := len(links)
	fmt.Printf("%s: %d\n", title, count)
	printLinkRows(links, reverse)
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

func printAssetResult(argv []string, v any) bool {
	if len(argv) < 2 || argv[1] != "import" {
		return false
	}
	var asset *store.Asset
	switch data := v.(type) {
	case *store.Asset:
		asset = data
	case store.Asset:
		asset = &data
	default:
		return false
	}
	fmt.Printf("Imported asset\n")
	fmt.Printf("  path: %s\n", asset.Path)
	fmt.Printf("  file: %s\n", asset.AbsPath)
	fmt.Printf("  markdown: %s\n", asset.Markdown)
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
	links := linkSlice(v)
	if len(links) == 0 {
		return
	}
	fmt.Println()
	fmt.Println(title)
	printLinkRows(links, reverse)
}

func linkSlice(v any) []domain.Link {
	links, ok := v.([]domain.Link)
	if ok {
		return links
	}
	if ptrs, ok := v.([]*domain.Link); ok {
		for _, link := range ptrs {
			if link != nil {
				links = append(links, *link)
			}
		}
	}
	return links
}

func printLinkRows(links []domain.Link, reverse bool) {
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

func printFieldList(data any) bool {
	payload, ok := data.(map[string]any)
	if !ok {
		return false
	}
	fields, ok := payload["fields"].([]domain.FieldDef)
	if !ok {
		return false
	}
	fmt.Printf("%s fields: %d\n", payload["type"], len(fields))
	if len(fields) == 0 {
		return true
	}
	columns := []string{"name", "kind", "target", "required", "unique", "values"}
	widths := make([]int, len(columns))
	for i, column := range columns {
		widths[i] = len(column)
	}
	rows := make([][]string, 0, len(fields))
	for _, field := range fields {
		values := strings.Join(field.EnumValues, ",")
		row := []string{
			field.Name,
			string(field.Kind),
			field.TargetType,
			strconv.FormatBool(field.Required),
			strconv.FormatBool(field.Unique),
			values,
		}
		for i, value := range row {
			if len(value) > widths[i] {
				widths[i] = min(len(value), 36)
			}
		}
		rows = append(rows, row)
	}
	for i, column := range columns {
		fmt.Printf("%-*s", widths[i]+2, column)
	}
	fmt.Println()
	for i := range columns {
		fmt.Print(strings.Repeat("-", widths[i]))
		fmt.Print("  ")
	}
	fmt.Println()
	for _, row := range rows {
		for i, value := range row {
			fmt.Printf("%-*s", widths[i]+2, truncate(value, widths[i]))
		}
		fmt.Println()
	}
	return true
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
	return "mmx -C " + shellQuote(rootDir)
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
