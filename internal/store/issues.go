package store

import (
	"fmt"

	"github.com/yan5xu/mmx/internal/domain"
)

func (s *Store) RevalidateObject(id string) error {
	obj, err := s.GetObject(id)
	if err != nil {
		return err
	}
	if _, err := s.DB.Exec(`DELETE FROM issues WHERE object_id = ?`, id); err != nil {
		return err
	}
	fields, err := s.ListFields(obj.TypeID)
	if err != nil {
		return err
	}
	values := obj.Fields
	for _, fd := range fields {
		value, exists := values[fd.Name]
		if fd.Required && (!exists || value == nil || fmt.Sprintf("%v", value) == "") {
			if err := s.addIssue(id, fd.ID, "missing_required", "error", "required field "+fd.Name+" is missing"); err != nil {
				return err
			}
		}
		if (fd.Kind == domain.FieldRef || fd.Kind == domain.FieldRefList) && exists {
			for _, target := range stringSlice(value) {
				if !s.objectExists(target) {
					if err := s.addIssue(id, fd.ID, "broken_ref", "error", "field "+fd.Name+" references missing object "+target); err != nil {
						return err
					}
				}
			}
		}
	}
	links, err := s.Links(id)
	if err != nil {
		return err
	}
	for _, l := range links {
		resolved := s.objectExists(l.ToID)
		if _, err := s.DB.Exec(`UPDATE links SET resolved = ? WHERE id = ?`, boolInt(resolved), l.ID); err != nil {
			return err
		}
		if !resolved {
			if err := s.addIssue(id, l.FieldID, "broken_link", "error", "link references missing object "+l.ToID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) RevalidateAll() error {
	rows, err := s.DB.Query(`SELECT id FROM objects ORDER BY id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	for _, id := range ids {
		if err := s.RevalidateObject(id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Issues() ([]domain.Issue, error) {
	rows, err := s.DB.Query(`SELECT id, object_id, field_id, kind, severity, message, created_at FROM issues ORDER BY severity, kind, object_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Issue
	for rows.Next() {
		var issue domain.Issue
		if err := rows.Scan(&issue.ID, &issue.ObjectID, &issue.FieldID, &issue.Kind, &issue.Severity, &issue.Message, &issue.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, issue)
	}
	return out, rows.Err()
}

func (s *Store) addIssue(objectID, fieldID, kind, severity, message string) error {
	_, err := s.DB.Exec(`INSERT INTO issues(object_id, field_id, kind, severity, message) VALUES(?, ?, ?, ?, ?)`, objectID, fieldID, kind, severity, message)
	return err
}
