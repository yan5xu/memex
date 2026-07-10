package store

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/yan5xu/mbase/internal/domain"
)

type QueryOptions struct {
	Select []string `json:"select,omitempty"`
	Where  []string `json:"where,omitempty"`
	Sort   string   `json:"sort,omitempty"`
	Limit  int      `json:"limit,omitempty"`
}

type QueryResult struct {
	Type   string            `json:"type"`
	Fields []domain.FieldDef `json:"fields"`
	Rows   []map[string]any  `json:"rows"`
	Count  int               `json:"count"`
}

func (s *Store) Query(typeID string, opts QueryOptions) (*QueryResult, error) {
	fields, err := s.ListFields(typeID)
	if err != nil {
		return nil, err
	}
	fieldByName := make(map[string]domain.FieldDef)
	for _, f := range fields {
		fieldByName[f.Name] = f
	}
	objects, err := s.ListObjects(typeID, 10000)
	if err != nil {
		return nil, err
	}
	var rows []map[string]any
	for _, obj := range objects {
		row := map[string]any{"id": obj.ID, "type": obj.TypeID}
		for k, v := range obj.Fields {
			if k != "title" {
				row[k] = v
			}
		}
		row["title"] = obj.Title
		if matchWhere(row, opts.Where) {
			rows = append(rows, row)
		}
	}
	if opts.Sort != "" {
		sortRows(rows, opts.Sort)
	}
	if opts.Limit > 0 && len(rows) > opts.Limit {
		rows = rows[:opts.Limit]
	}
	if len(opts.Select) > 0 {
		for i, row := range rows {
			projected := map[string]any{"id": row["id"]}
			for _, name := range opts.Select {
				if val, ok := row[name]; ok {
					projected[name] = val
				}
			}
			rows[i] = projected
		}
	}
	selectedFields := fields
	if len(opts.Select) > 0 {
		selectedFields = nil
		for _, name := range opts.Select {
			if f, ok := fieldByName[name]; ok {
				selectedFields = append(selectedFields, f)
			}
		}
	}
	return &QueryResult{Type: typeID, Fields: selectedFields, Rows: rows, Count: len(rows)}, nil
}

func matchWhere(row map[string]any, wheres []string) bool {
	for _, expr := range wheres {
		field, op, want, ok := parseWhere(expr)
		if !ok {
			return false
		}
		got := row[field]
		switch op {
		case "=":
			if !valueEquals(got, want) {
				return false
			}
		case "!=":
			if valueEquals(got, want) {
				return false
			}
		case "contains":
			if !valueContains(got, want) {
				return false
			}
		}
	}
	return true
}

func valueEquals(got any, want string) bool {
	switch v := got.(type) {
	case nil:
		return false
	case []string:
		for _, item := range v {
			if item == want {
				return true
			}
		}
		return false
	case []any:
		for _, item := range v {
			if fmt.Sprintf("%v", item) == want {
				return true
			}
		}
		return false
	default:
		return fmt.Sprintf("%v", got) == want
	}
}

func valueContains(got any, want string) bool {
	switch v := got.(type) {
	case nil:
		return false
	case []string:
		for _, item := range v {
			if strings.Contains(item, want) {
				return true
			}
		}
		return false
	case []any:
		for _, item := range v {
			if strings.Contains(fmt.Sprintf("%v", item), want) {
				return true
			}
		}
		return false
	default:
		return strings.Contains(fmt.Sprintf("%v", got), want)
	}
}

func parseWhere(expr string) (string, string, string, bool) {
	if parts := strings.SplitN(expr, " contains ", 2); len(parts) == 2 {
		return strings.TrimSpace(parts[0]), "contains", cleanWhereValue(parts[1]), true
	}
	for _, op := range []string{"!=", "="} {
		if parts := strings.SplitN(expr, op, 2); len(parts) == 2 {
			return strings.TrimSpace(parts[0]), op, cleanWhereValue(parts[1]), true
		}
	}
	return "", "", "", false
}

func cleanWhereValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 2 {
		return value
	}
	first := value[0]
	last := value[len(value)-1]
	if first != last {
		return value
	}
	switch first {
	case '"':
		if unquoted, err := strconv.Unquote(value); err == nil {
			return unquoted
		}
		return value[1 : len(value)-1]
	case '\'':
		return strings.ReplaceAll(value[1:len(value)-1], `\'`, `'`)
	default:
		return value
	}
}

func sortRows(rows []map[string]any, sortExpr string) {
	field := sortExpr
	desc := false
	if before, after, ok := strings.Cut(sortExpr, ":"); ok {
		field = before
		desc = after == "desc"
	}
	sort.Slice(rows, func(i, j int) bool {
		a := fmt.Sprintf("%v", rows[i][field])
		b := fmt.Sprintf("%v", rows[j][field])
		if desc {
			return a > b
		}
		return a < b
	})
}
