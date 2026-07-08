package store

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/yan5xu/mbase/internal/domain"
)

func (s *Store) CreateObject(typeID, id, title string, fields map[string]string) (*domain.Object, error) {
	return s.CreateObjectWithBody(typeID, id, title, fields, nil)
}

func (s *Store) UpsertObjectWithBody(typeID, id, title string, fields map[string]string, body *string) (*domain.Object, bool, error) {
	if fields == nil {
		fields = make(map[string]string)
	}
	if !s.objectExists(id) {
		created, createErr := s.CreateObjectWithBody(typeID, id, title, fields, body)
		return created, true, createErr
	}
	obj, err := s.GetObject(id)
	if err != nil {
		return nil, false, err
	}
	if obj.TypeID != typeID {
		return nil, false, fmt.Errorf("object %q already exists as type %q, not %q", id, obj.TypeID, typeID)
	}
	if title == "" {
		title = fields["title"]
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	if err := s.setFieldsTx(tx, id, typeID, fields); err != nil {
		return nil, false, err
	}
	if title != "" {
		if _, err := tx.Exec(`UPDATE objects SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, title, id); err != nil {
			return nil, false, err
		}
	} else {
		if _, err := tx.Exec(`UPDATE objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id); err != nil {
			return nil, false, err
		}
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.upsert', ?, ?)`, id, mustJSON(map[string]any{"type": typeID, "fields": fields, "body_written": body != nil})); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	if body != nil {
		if err := s.WriteBody(id, *body); err != nil {
			return nil, false, err
		}
	} else if err := s.RevalidateObject(id); err != nil {
		return nil, false, err
	}
	obj, err = s.GetObject(id)
	return obj, false, err
}

func (s *Store) CreateObjectWithBody(typeID, id, title string, fields map[string]string, body *string) (*domain.Object, error) {
	if fields == nil {
		fields = make(map[string]string)
	}
	if _, err := s.GetType(typeID); err != nil {
		return nil, err
	}
	if id == "" {
		return nil, fmt.Errorf("object id is required")
	}
	if title == "" {
		title = fields["title"]
	}
	bodyPath := filepath.Join("bodies", id+".md")
	absBody := filepath.Join(s.Root, bodyPath)
	if err := os.MkdirAll(filepath.Dir(absBody), 0755); err != nil {
		return nil, err
	}
	if body != nil {
		if err := os.WriteFile(absBody, []byte(*body), 0644); err != nil {
			return nil, err
		}
	} else if _, err := os.Stat(absBody); os.IsNotExist(err) {
		if err := os.WriteFile(absBody, []byte("# "+title+"\n"), 0644); err != nil {
			return nil, err
		}
	}
	hash, _ := fileHash(absBody)
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO objects(id, type_id, title, body_path, body_hash) VALUES(?, ?, ?, ?, ?)`, id, typeID, title, bodyPath, hash); err != nil {
		return nil, err
	}
	if title != "" {
		fields["title"] = title
	}
	if err := s.setFieldsTx(tx, id, typeID, fields); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.create', ?, ?)`, id, mustJSON(map[string]any{"type": typeID, "fields": fields, "body_written": body != nil})); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	if err := s.RevalidateObject(id); err != nil {
		return nil, err
	}
	return s.GetObject(id)
}

func (s *Store) GetObject(id string) (*domain.Object, error) {
	var obj domain.Object
	err := s.DB.QueryRow(`SELECT id, type_id, title, body_path, created_at, updated_at FROM objects WHERE id = ?`, id).
		Scan(&obj.ID, &obj.TypeID, &obj.Title, &obj.BodyPath, &obj.CreatedAt, &obj.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("object %q not found", id)
	}
	if err != nil {
		return nil, err
	}
	values, err := s.ObjectValues(id)
	if err != nil {
		return nil, err
	}
	obj.Fields = values
	obj.BodyAbsPath = filepath.Join(s.Root, obj.BodyPath)
	return &obj, nil
}

func (s *Store) ObjectValues(id string) (map[string]any, error) {
	rows, err := s.DB.Query(`SELECT f.name, fv.value_json FROM field_values fv JOIN fields f ON f.id = fv.field_id WHERE fv.object_id = ? ORDER BY f.position, f.name`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]any)
	for rows.Next() {
		var name, raw string
		if err := rows.Scan(&name, &raw); err != nil {
			return nil, err
		}
		var v any
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			v = raw
		}
		out[name] = v
	}
	return out, rows.Err()
}

func (s *Store) ListObjects(typeID string, limit int) ([]domain.Object, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.DB.Query(`SELECT id FROM objects WHERE (? = '' OR type_id = ?) ORDER BY updated_at DESC, id LIMIT ?`, typeID, typeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Object
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		obj, err := s.GetObject(id)
		if err != nil {
			return nil, err
		}
		out = append(out, *obj)
	}
	return out, rows.Err()
}

func (s *Store) SetField(objectID, name, value string) error {
	obj, err := s.GetObject(objectID)
	if err != nil {
		return err
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := s.setFieldsTx(tx, objectID, obj.TypeID, map[string]string{name: value}); err != nil {
		return err
	}
	if name == "title" {
		if _, err := tx.Exec(`UPDATE objects SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, value, objectID); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(`UPDATE objects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, objectID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.set', ?, ?)`, objectID, mustJSON(map[string]any{"field": name, "value": value})); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.RevalidateObject(objectID)
}

func (s *Store) LinkObject(objectID, fieldName, targetID string) error {
	obj, err := s.GetObject(objectID)
	if err != nil {
		return err
	}
	fd, err := s.GetField(obj.TypeID, fieldName)
	if err != nil {
		return err
	}
	if fd.Kind != domain.FieldRef && fd.Kind != domain.FieldRefList {
		return fmt.Errorf("field %q is %s, not ref/ref_list", fieldName, fd.Kind)
	}
	if _, err := s.GetObject(targetID); err != nil {
		return err
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var values []string
	if fd.Kind == domain.FieldRef {
		values = []string{targetID}
	} else {
		current, _ := s.ObjectValues(objectID)
		for _, v := range stringSlice(current[fieldName]) {
			if v == targetID {
				values = stringSlice(current[fieldName])
				break
			}
			values = append(values, v)
		}
		if len(values) == 0 || values[len(values)-1] != targetID {
			values = append(values, targetID)
		}
	}
	if err := s.setValueTx(tx, objectID, fd, values); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.link', ?, ?)`, objectID, mustJSON(map[string]any{"field": fieldName, "target": targetID})); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.RevalidateObject(objectID)
}

func (s *Store) UnlinkObject(objectID, fieldName, targetID string) error {
	obj, err := s.GetObject(objectID)
	if err != nil {
		return err
	}
	fd, err := s.GetField(obj.TypeID, fieldName)
	if err != nil {
		return err
	}
	current, err := s.ObjectValues(objectID)
	if err != nil {
		return err
	}
	var values []string
	for _, v := range stringSlice(current[fieldName]) {
		if v != targetID {
			values = append(values, v)
		}
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if fd.Kind == domain.FieldRef {
		if _, err := tx.Exec(`DELETE FROM field_values WHERE object_id = ? AND field_id = ?`, objectID, fd.ID); err != nil {
			return err
		}
	} else if err := s.setValueTx(tx, objectID, fd, values); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM links WHERE from_object_id = ? AND field_id = ? AND to_object_id = ? AND kind = 'field'`, objectID, fd.ID, targetID); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.unlink', ?, ?)`, objectID, mustJSON(map[string]any{"field": fieldName, "target": targetID})); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.RevalidateObject(objectID)
}

func (s *Store) DeleteObject(objectID string) (*domain.Object, error) {
	obj, err := s.GetObject(objectID)
	if err != nil {
		return nil, err
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM links WHERE from_object_id = ? OR to_object_id = ?`, objectID, objectID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM issues WHERE object_id = ?`, objectID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM objects WHERE id = ?`, objectID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('object.delete', ?, ?)`, objectID, mustJSON(map[string]any{"body_path": obj.BodyPath})); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return obj, nil
}

func (s *Store) setFieldsTx(tx *sql.Tx, objectID, typeID string, fields map[string]string) error {
	for name, raw := range fields {
		fd, err := s.GetField(typeID, name)
		if err != nil {
			return err
		}
		value, err := parseFieldValue(*fd, raw)
		if err != nil {
			return err
		}
		if err := s.validateUniqueTx(tx, objectID, fd, value); err != nil {
			return err
		}
		if err := s.setValueTx(tx, objectID, fd, value); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) setValueTx(tx *sql.Tx, objectID string, fd *domain.FieldDef, value any) error {
	raw := mustJSON(value)
	text, number, boolValue := typedColumns(value)
	if _, err := tx.Exec(`INSERT INTO field_values(object_id, field_id, value_json, value_text, value_number, value_bool, updated_at) VALUES(?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(object_id, field_id) DO UPDATE SET value_json = excluded.value_json, value_text = excluded.value_text, value_number = excluded.value_number, value_bool = excluded.value_bool, updated_at = CURRENT_TIMESTAMP`,
		objectID, fd.ID, raw, text, number, boolValue); err != nil {
		return err
	}
	if fd.Kind == domain.FieldRef || fd.Kind == domain.FieldRefList {
		if _, err := tx.Exec(`DELETE FROM links WHERE from_object_id = ? AND field_id = ? AND kind = 'field'`, objectID, fd.ID); err != nil {
			return err
		}
		for _, target := range stringSlice(value) {
			resolved := 1
			if _, err := s.GetObject(target); err != nil {
				resolved = 0
			}
			if _, err := tx.Exec(`INSERT INTO links(from_object_id, to_object_id, kind, relation, field_id, resolved) VALUES(?, ?, 'field', ?, ?, ?)`, objectID, target, fd.Name, fd.ID, resolved); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) validateUniqueTx(tx *sql.Tx, objectID string, fd *domain.FieldDef, value any) error {
	if !fd.Unique {
		return nil
	}
	key := fmt.Sprintf("%v", value)
	var existing string
	err := tx.QueryRow(`SELECT object_id FROM field_values WHERE field_id = ? AND value_text = ? AND object_id != ? LIMIT 1`, fd.ID, key, objectID).Scan(&existing)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("unique constraint violation: field=%s value=%q already exists on %s", fd.Name, key, existing)
}

func parseFieldValue(fd domain.FieldDef, raw string) (any, error) {
	switch fd.Kind {
	case domain.FieldNumber:
		return strconv.ParseFloat(raw, 64)
	case domain.FieldBool:
		return strconv.ParseBool(raw)
	case domain.FieldList, domain.FieldRefList:
		if strings.TrimSpace(raw) == "" {
			return []string{}, nil
		}
		return splitCSV(raw), nil
	case domain.FieldEnum:
		for _, allowed := range fd.EnumValues {
			if raw == allowed {
				return raw, nil
			}
		}
		return nil, fmt.Errorf("invalid enum value %q for %s", raw, fd.Name)
	default:
		return raw, nil
	}
}

func typedColumns(value any) (string, any, any) {
	switch v := value.(type) {
	case string:
		return v, nil, nil
	case float64:
		return fmt.Sprintf("%g", v), v, nil
	case bool:
		return fmt.Sprintf("%t", v), nil, boolInt(v)
	case []string:
		return strings.Join(v, ","), nil, nil
	default:
		return fmt.Sprintf("%v", v), nil, nil
	}
}

func splitCSV(s string) []string {
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

func stringSlice(v any) []string {
	switch val := v.(type) {
	case nil:
		return nil
	case string:
		if val == "" {
			return nil
		}
		return []string{val}
	case []string:
		return val
	case []any:
		out := make([]string, 0, len(val))
		for _, item := range val {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func mustJSON(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func fileHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}
