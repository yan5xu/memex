package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/yan5xu/mmx/internal/domain"
)

func fieldID(typeID, name string) string {
	return typeID + "." + name
}

func (s *Store) CreateType(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("type id is required")
	}
	_, err := s.DB.Exec(`INSERT INTO types(id, name) VALUES(?, ?)`, id, id)
	return err
}

func (s *Store) ListTypes() ([]domain.TypeDef, error) {
	rows, err := s.DB.Query(`SELECT id, name, description FROM types ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TypeDef
	for rows.Next() {
		var t domain.TypeDef
		if err := rows.Scan(&t.ID, &t.Name, &t.Description); err != nil {
			return nil, err
		}
		fields, err := s.ListFields(t.ID)
		if err != nil {
			return nil, err
		}
		t.Fields = fields
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) GetType(id string) (*domain.TypeDef, error) {
	var t domain.TypeDef
	err := s.DB.QueryRow(`SELECT id, name, description FROM types WHERE id = ?`, id).Scan(&t.ID, &t.Name, &t.Description)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("type %q not found", id)
	}
	if err != nil {
		return nil, err
	}
	fields, err := s.ListFields(id)
	if err != nil {
		return nil, err
	}
	t.Fields = fields
	return &t, nil
}

func (s *Store) AddField(typeID, name string, kind domain.FieldKind, required, unique bool, enumValues []string, targetType string) (*domain.FieldDef, error) {
	if _, err := s.GetType(typeID); err != nil {
		return nil, err
	}
	if name == "" {
		return nil, fmt.Errorf("field name is required")
	}
	if !validKind(kind) {
		return nil, fmt.Errorf("invalid field kind %q", kind)
	}
	if (kind == domain.FieldRef || kind == domain.FieldRefList) && targetType == "" {
		return nil, fmt.Errorf("ref fields require --target")
	}
	enumJSON, err := json.Marshal(enumValues)
	if err != nil {
		return nil, err
	}
	pos := 0
	_ = s.DB.QueryRow(`SELECT COALESCE(MAX(position), 0) + 1 FROM fields WHERE type_id = ?`, typeID).Scan(&pos)
	fd := &domain.FieldDef{
		ID:         fieldID(typeID, name),
		TypeID:     typeID,
		Name:       name,
		Kind:       kind,
		Required:   required,
		Unique:     unique,
		EnumValues: enumValues,
		TargetType: targetType,
		Position:   pos,
	}
	_, err = s.DB.Exec(`INSERT INTO fields(id, type_id, name, kind, required, unique_value, enum_json, target_type, position) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		fd.ID, fd.TypeID, fd.Name, string(fd.Kind), boolInt(fd.Required), boolInt(fd.Unique), string(enumJSON), fd.TargetType, fd.Position)
	if err != nil {
		return nil, err
	}
	return fd, nil
}

func (s *Store) ListFields(typeID string) ([]domain.FieldDef, error) {
	rows, err := s.DB.Query(`SELECT id, type_id, name, kind, required, unique_value, enum_json, target_type, position, description FROM fields WHERE type_id = ? ORDER BY position, name`, typeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.FieldDef
	for rows.Next() {
		var fd domain.FieldDef
		var kind, enumJSON string
		var required, unique int
		if err := rows.Scan(&fd.ID, &fd.TypeID, &fd.Name, &kind, &required, &unique, &enumJSON, &fd.TargetType, &fd.Position, &fd.Description); err != nil {
			return nil, err
		}
		fd.Kind = domain.FieldKind(kind)
		fd.Required = required != 0
		fd.Unique = unique != 0
		_ = json.Unmarshal([]byte(enumJSON), &fd.EnumValues)
		out = append(out, fd)
	}
	return out, rows.Err()
}

func (s *Store) GetField(typeID, name string) (*domain.FieldDef, error) {
	var fd domain.FieldDef
	var kind, enumJSON string
	var required, unique int
	err := s.DB.QueryRow(`SELECT id, type_id, name, kind, required, unique_value, enum_json, target_type, position, description FROM fields WHERE type_id = ? AND name = ?`, typeID, name).
		Scan(&fd.ID, &fd.TypeID, &fd.Name, &kind, &required, &unique, &enumJSON, &fd.TargetType, &fd.Position, &fd.Description)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("field %q not found on type %q", name, typeID)
	}
	if err != nil {
		return nil, err
	}
	fd.Kind = domain.FieldKind(kind)
	fd.Required = required != 0
	fd.Unique = unique != 0
	_ = json.Unmarshal([]byte(enumJSON), &fd.EnumValues)
	return &fd, nil
}

func validKind(kind domain.FieldKind) bool {
	switch kind {
	case domain.FieldText, domain.FieldNumber, domain.FieldBool, domain.FieldDate, domain.FieldURL, domain.FieldEnum, domain.FieldList, domain.FieldRef, domain.FieldRefList, domain.FieldJSON:
		return true
	default:
		return false
	}
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
