package store

import "testing"

func TestMigrate_CreatesSchema(t *testing.T) {
	s := newTestStore(t)

	tables := []string{
		"workouts", "exercise_library", "exercises", "sets",
		"gzclp_settings", "gzclp_day_exercises", "schema_migrations",
	}
	for _, table := range tables {
		var name string
		err := s.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("expected table %q to exist: %v", table, err)
		}
	}

	var version int
	if err := s.db.QueryRow("SELECT version FROM schema_migrations WHERE version = 1").Scan(&version); err != nil {
		t.Errorf("expected migration 1 to be recorded: %v", err)
	}
}

func TestMigrate_IsIdempotent(t *testing.T) {
	s := newTestStore(t)

	if err := s.migrate(); err != nil {
		t.Fatalf("second migrate failed: %v", err)
	}

	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&count); err != nil {
		t.Fatalf("failed to count schema_migrations: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 applied migration, got %d", count)
	}
}
