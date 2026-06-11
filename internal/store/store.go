package store

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

// Store provides access to the application's persistent data.
type Store struct {
	db *sql.DB
}

// Open connects to the SQLite database at dataSourceName, applies any
// pending schema migrations, and ensures required singleton rows exist.
func Open(dataSourceName string) (*Store, error) {
	db, err := sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return nil, err
	}

	s := &Store{db: db}

	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec("INSERT OR IGNORE INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 1, 0)"); err != nil {
		db.Close()
		return nil, err
	}

	return s, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// DB returns the underlying database connection. It exists primarily for
// test setup and assertions that need direct table access.
func (s *Store) DB() *sql.DB {
	return s.db
}

// SeedDefaults populates the database with default exercises and GZCLP day
// assignments. It is safe to call repeatedly.
func (s *Store) SeedDefaults() error {
	if err := s.SeedDefaultExercises(); err != nil {
		return err
	}
	return s.SeedDefaultGZCLPDayExercises()
}
