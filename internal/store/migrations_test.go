package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestMigrate_CreatesSchema(t *testing.T) {
	s := newTestStore(t)

	tables := []string{
		"workouts", "exercise_library", "exercises", "sets", "schema_migrations",
		"training_plans", "training_plan_exercises", "training_plan_sets",
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

	if !columnExists(t, s.db, "workouts", "plan_id") {
		t.Error("expected workouts.plan_id column to exist")
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
	if count != 3 {
		t.Errorf("expected 3 applied migrations, got %d", count)
	}
}

// columnExists reports whether table has a column with the given name.
func columnExists(t *testing.T, db *sql.DB, table, column string) bool {
	t.Helper()
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?", table, column).Scan(&count); err != nil {
		t.Fatalf("failed to inspect columns of %s: %v", table, err)
	}
	return count > 0
}

func TestMigrate_RemovesGZCLPSchema(t *testing.T) {
	s := newTestStore(t)

	for _, table := range []string{"gzclp_settings", "gzclp_day_exercises"} {
		var count int
		s.db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count)
		if count != 0 {
			t.Errorf("expected table %q to be dropped", table)
		}
	}
	for _, column := range []string{"workout_type", "workout_day"} {
		if columnExists(t, s.db, "workouts", column) {
			t.Errorf("expected workouts.%s to be dropped", column)
		}
	}
}

func TestMigrate_UpgradeFromV1PreservesWorkouts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v1.db")

	// Build a database as it looked with only migration 0001 applied,
	// including GZCLP data.
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	v1, err := migrationsFS.ReadFile("migrations/0001_initial_schema.sql")
	if err != nil {
		t.Fatalf("failed to read 0001: %v", err)
	}
	for _, stmt := range []string{
		string(v1),
		"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
		"INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z')",
		"INSERT INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 3, 1)",
		"INSERT INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (1, 'T1', 'Squat')",
		"INSERT INTO workouts (id, date, workout_type, workout_day) VALUES (1, '2026-03-15', 'gzclp', 2)",
		"INSERT INTO exercises (id, workout_id, name) VALUES (1, 1, 'Squat')",
		"INSERT INTO sets (exercise_id, reps, weight) VALUES (1, 5, 100)",
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v1 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v1 database: %v", err)
	}
	defer s.Close()

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout after upgrade, got %d", len(workouts))
	}
	w := workouts[0]
	if w.ID != 1 || w.Date != "2026-03-15" {
		t.Errorf("unexpected workout after upgrade: %+v", w)
	}
	if len(w.Exercises) != 1 || w.Exercises[0].Name != "Squat" || len(w.Exercises[0].Sets) != 1 {
		t.Fatalf("expected Squat with 1 set after upgrade, got %+v", w.Exercises)
	}
	if set := w.Exercises[0].Sets[0]; set.Reps != 5 || set.Weight != 100 {
		t.Errorf("unexpected set after upgrade: %+v", set)
	}

	if columnExists(t, s.db, "workouts", "workout_type") || columnExists(t, s.db, "workouts", "workout_day") {
		t.Error("expected GZCLP columns to be dropped from upgraded database")
	}
	if w.PlanID != nil {
		t.Errorf("expected existing workout to have no plan_id, got %d", *w.PlanID)
	}

	// New workouts still save after the upgrade.
	if _, err := s.SaveWorkout(Workout{Date: "2026-03-16"}); err != nil {
		t.Errorf("failed to save workout after upgrade: %v", err)
	}
}
