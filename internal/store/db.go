package store

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const DBPath = ".memex/memex.db"

type Store struct {
	DB   *sql.DB
	Root string
}

func Open(root string) (*Store, error) {
	root, err := normalizeRoot(root)
	if err != nil {
		return nil, err
	}
	dbPath := filepath.Join(root, DBPath)
	if _, err := os.Stat(dbPath); err != nil {
		return nil, fmt.Errorf("Memex database not found at %s; run mmx init", dbPath)
	}
	db, err := openSQLite(dbPath)
	if err != nil {
		return nil, err
	}
	configureDB(db)
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{DB: db, Root: root}, nil
}

func Init(root string) (*Store, error) {
	root, err := normalizeRoot(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(root, ".memex"), 0755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(root, "bodies"), 0755); err != nil {
		return nil, err
	}
	db, err := openSQLite(filepath.Join(root, DBPath))
	if err != nil {
		return nil, err
	}
	configureDB(db)
	if _, err := db.Exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`); err != nil {
		_ = db.Close()
		return nil, err
	}
	s := &Store{DB: db, Root: root}
	if err := s.Migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func configureDB(db *sql.DB) {
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(1)
}

func openSQLite(path string) (*sql.DB, error) {
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	u := url.URL{Scheme: "file", Path: path}
	q := u.Query()
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(1)")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	configureDB(db)
	return db, nil
}

func normalizeRoot(root string) (string, error) {
	if root == "" {
		root = "."
	}
	return filepath.Abs(root)
}

func (s *Store) Close() error {
	if s == nil || s.DB == nil {
		return nil
	}
	return s.DB.Close()
}
