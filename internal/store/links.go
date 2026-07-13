package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/yan5xu/memex/internal/domain"
	"github.com/yan5xu/memex/internal/markdown"
)

func (s *Store) RefreshBody(id string) error {
	obj, err := s.GetObject(id)
	if err != nil {
		return err
	}
	abs := filepath.Join(s.Root, obj.BodyPath)
	data, err := os.ReadFile(abs)
	if err != nil {
		return err
	}
	hash, _ := fileHash(abs)
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM links WHERE from_object_id = ? AND kind = 'body'`, id); err != nil {
		return err
	}
	for _, link := range markdown.ExtractWikiLinks(string(data)) {
		resolved := 1
		if _, err := s.GetObject(link.Target); err != nil {
			resolved = 0
		}
		if _, err := tx.Exec(`INSERT INTO links(from_object_id, to_object_id, kind, relation, line, text, resolved) VALUES(?, ?, 'body', 'mentions', ?, ?, ?)`,
			id, link.Target, link.Line, link.Text, resolved); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`UPDATE objects SET body_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, hash, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO ops(op, object_id) VALUES('body.refresh', ?)`, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.RevalidateObject(id)
}

func (s *Store) BodyPath(id string) (string, error) {
	obj, err := s.GetObject(id)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.Root, obj.BodyPath), nil
}

func (s *Store) ReadBody(id string) (string, error) {
	path, err := s.BodyPath(id)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *Store) WriteBody(id, body string) error {
	path, err := s.BodyPath(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(body), 0644); err != nil {
		return err
	}
	if _, err := s.DB.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('body.write', ?, ?)`, id, mustJSON(map[string]any{"bytes": len([]byte(body))})); err != nil {
		return err
	}
	return s.RefreshBody(id)
}

func (s *Store) AppendBody(id, body string) error {
	path, err := s.BodyPath(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	if _, err := f.WriteString(body); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if _, err := s.DB.Exec(`INSERT INTO ops(op, object_id, payload_json) VALUES('body.append', ?, ?)`, id, mustJSON(map[string]any{"bytes": len([]byte(body))})); err != nil {
		return err
	}
	return s.RefreshBody(id)
}

func (s *Store) Links(id string) ([]domain.Link, error) {
	return s.linkQuery(`SELECT id, from_object_id, to_object_id, kind, relation, field_id, line, text, resolved, created_at FROM links WHERE from_object_id = ? ORDER BY kind, relation, to_object_id`, id)
}

func (s *Store) Backlinks(id string) ([]domain.Link, error) {
	return s.linkQuery(`SELECT id, from_object_id, to_object_id, kind, relation, field_id, line, text, resolved, created_at FROM links WHERE to_object_id = ? ORDER BY kind, relation, from_object_id`, id)
}

type LinkFilterOptions struct {
	Type     string
	Kind     string
	Relation string
	Filter   string
}

func (s *Store) FilteredLinks(id string, back bool, opts LinkFilterOptions) ([]domain.Link, error) {
	var links []domain.Link
	var err error
	if back {
		links, err = s.Backlinks(id)
	} else {
		links, err = s.Links(id)
	}
	if err != nil {
		return nil, err
	}
	out := make([]domain.Link, 0, len(links))
	needle := strings.ToLower(strings.TrimSpace(opts.Filter))
	for _, link := range links {
		if opts.Kind != "" && link.Kind != opts.Kind {
			continue
		}
		if opts.Relation != "" && link.Relation != opts.Relation {
			continue
		}
		otherID := link.ToID
		if back {
			otherID = link.FromID
		}
		var otherTitle string
		if opts.Type != "" || needle != "" {
			other, err := s.GetObject(otherID)
			if err == nil {
				otherTitle = other.Title
				if opts.Type != "" && other.TypeID != opts.Type {
					continue
				}
			} else if opts.Type != "" && inferredObjectType(otherID) != opts.Type {
				continue
			}
		}
		if needle != "" && !linkMatchesFilter(link, otherID, otherTitle, needle) {
			continue
		}
		out = append(out, link)
	}
	return out, nil
}

func (s *Store) AllLinks() ([]domain.Link, error) {
	return s.linkQuery(`SELECT id, from_object_id, to_object_id, kind, relation, field_id, line, text, resolved, created_at FROM links ORDER BY from_object_id, kind, relation, to_object_id`)
}

func (s *Store) linkQuery(query string, args ...any) ([]domain.Link, error) {
	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Link
	for rows.Next() {
		var l domain.Link
		var resolved int
		if err := rows.Scan(&l.ID, &l.FromID, &l.ToID, &l.Kind, &l.Relation, &l.FieldID, &l.Line, &l.Text, &resolved, &l.CreatedAt); err != nil {
			return nil, err
		}
		l.Resolved = resolved != 0
		out = append(out, l)
	}
	return out, rows.Err()
}

func linkMatchesFilter(link domain.Link, otherID, otherTitle, needle string) bool {
	values := []string{link.FromID, link.ToID, otherID, otherTitle, link.Kind, link.Relation, link.Text}
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), needle) {
			return true
		}
	}
	return false
}

func inferredObjectType(id string) string {
	if strings.HasPrefix(id, "source.") {
		return "source.item"
	}
	if strings.HasPrefix(id, "social.analytics.") {
		return "social.analytics.snapshot"
	}
	if strings.HasPrefix(id, "social.account.") {
		return "social.account"
	}
	if strings.HasPrefix(id, "social.post.") {
		return "social.post"
	}
	if prefix, _, ok := strings.Cut(id, "."); ok {
		return prefix
	}
	return ""
}

func (s *Store) RefreshAllBodies() error {
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
		if err := s.RefreshBody(id); err != nil {
			return fmt.Errorf("refresh %s: %w", id, err)
		}
	}
	return nil
}

func (s *Store) BodyDirty() ([]string, error) {
	rows, err := s.DB.Query(`SELECT id, body_path, body_hash FROM objects ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var dirty []string
	for rows.Next() {
		var id, bodyPath, oldHash string
		if err := rows.Scan(&id, &bodyPath, &oldHash); err != nil {
			return nil, err
		}
		hash, err := fileHash(filepath.Join(s.Root, bodyPath))
		if err != nil {
			dirty = append(dirty, id)
			continue
		}
		if hash != oldHash {
			dirty = append(dirty, id)
		}
	}
	return dirty, rows.Err()
}

func (s *Store) objectExists(id string) bool {
	var tmp string
	err := s.DB.QueryRow(`SELECT id FROM objects WHERE id = ?`, id).Scan(&tmp)
	return err != sql.ErrNoRows && err == nil
}
