package store

import (
	"database/sql"
	"fmt"
	"io/fs"
	"path/filepath"
	"reflect"
	"testing"
)

func TestMigrate_CreatesSchema(t *testing.T) {
	s := newTestStore(t)

	tables := []string{
		"workouts", "exercise_library", "exercises", "sets", "schema_migrations",
		"training_plans", "training_plan_exercises", "training_plan_sets",
		"bodyweight", "exercise_muscles", "cardio_workouts", "goals", "planned_sessions",
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
	if count != 9 {
		t.Errorf("expected 9 applied migrations, got %d", count)
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

func TestMigrate_UpgradeFromV3PreservesData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v3.db")

	// Build a database with migrations 0001-0003 applied and some data.
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	stmts := []string{"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"}
	for i, name := range []string{"0001_initial_schema.sql", "0002_remove_gzclp.sql", "0003_add_training_plans.sql"} {
		contents, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatalf("failed to read %s: %v", name, err)
		}
		stmts = append(stmts, string(contents),
			fmt.Sprintf("INSERT INTO schema_migrations (version, applied_at) VALUES (%d, '2026-01-01T00:00:00Z')", i+1))
	}
	stmts = append(stmts,
		"INSERT INTO exercise_library (name, is_default) VALUES ('Hip Thrust', 0)",
		"INSERT INTO workouts (id, date) VALUES (1, '2026-03-15')",
		"INSERT INTO exercises (id, workout_id, name) VALUES (1, 1, 'Hip Thrust')",
		"INSERT INTO sets (exercise_id, reps, weight) VALUES (1, 10, 120)",
	)
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v3 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v3 database: %v", err)
	}
	defer s.Close()

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 1 || len(workouts[0].Exercises) != 1 || workouts[0].Exercises[0].Sets[0].Weight != 120 {
		t.Fatalf("expected workout preserved after upgrade, got %+v", workouts)
	}

	muscles, err := s.GetExerciseMuscles()
	if err != nil {
		t.Fatalf("failed to get muscles: %v", err)
	}
	if len(muscles["Squat"]) == 0 {
		t.Error("expected default tags after upgrade")
	}
	if err := s.SaveBodyweight("2026-03-15", 80); err != nil {
		t.Errorf("failed to save bodyweight after upgrade: %v", err)
	}
}

func TestMigrate_NewDefaultTagsKeepUserTags(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v4.db")

	// Build a database at migration 0004 where Romanian Deadlift is a custom
	// exercise the user already tagged.
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	stmts := []string{"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"}
	for i, name := range []string{
		"0001_initial_schema.sql", "0002_remove_gzclp.sql", "0003_add_training_plans.sql", "0004_add_insights.sql",
	} {
		contents, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatalf("failed to read %s: %v", name, err)
		}
		stmts = append(stmts, string(contents),
			fmt.Sprintf("INSERT INTO schema_migrations (version, applied_at) VALUES (%d, '2026-01-01T00:00:00Z')", i+1))
	}
	stmts = append(stmts,
		"INSERT INTO exercise_library (name, is_default) VALUES ('Romanian Deadlift', 0)",
		"INSERT INTO exercise_muscles (exercise_name, muscle, role) VALUES ('Romanian Deadlift', 'hamstrings', 'primary')",
	)
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v4 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v4 database: %v", err)
	}
	defer s.Close()

	muscles, err := s.GetExerciseMuscles()
	if err != nil {
		t.Fatalf("failed to get muscles: %v", err)
	}
	rdl := muscles["Romanian Deadlift"]
	if len(rdl) != 1 || rdl[0] != (MuscleTarget{Muscle: "hamstrings", Role: RolePrimary}) {
		t.Errorf("expected user's Romanian Deadlift tags kept, got %+v", rdl)
	}
	if len(muscles["Skullcrushers"]) == 0 {
		t.Error("expected Skullcrushers to get default tags")
	}
}

func TestMigrate_UpgradeFromV5BackfillsPlanSchemes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v5.db")

	// Build a database with migrations 0001-0005 applied and a plan whose
	// exercises still carry target sets and progression settings.
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	stmts := []string{"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"}
	for i := 1; i <= 5; i++ {
		matches, err := fs.Glob(migrationsFS, fmt.Sprintf("migrations/%04d_*.sql", i))
		if err != nil || len(matches) != 1 {
			t.Fatalf("failed to find migration %d: %v", i, err)
		}
		contents, err := migrationsFS.ReadFile(matches[0])
		if err != nil {
			t.Fatalf("failed to read %s: %v", matches[0], err)
		}
		stmts = append(stmts, string(contents),
			fmt.Sprintf("INSERT INTO schema_migrations (version, applied_at) VALUES (%d, '2026-01-01T00:00:00Z')", i))
	}
	stmts = append(stmts,
		"INSERT INTO training_plans (id, name) VALUES (1, '5x5')",
		`INSERT INTO training_plan_exercises (id, plan_id, weekday, position, exercise_name, weight_increment, deload_after, deload_percent)
			VALUES (1, 1, 1, 0, 'Squat', 2.5, 3, 10), (2, 1, 1, 1, 'Plank', 0, 0, 0)`,
		`INSERT INTO training_plan_sets (plan_exercise_id, position, reps, weight)
			VALUES (1, 0, 5, 100), (1, 1, 5, 100), (1, 2, 4, 100), (1, 3, 5, 100)`,
	)
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v5 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v5 database: %v", err)
	}
	defer s.Close()

	plan, err := s.GetPlan(1)
	if err != nil {
		t.Fatalf("failed to get plan: %v", err)
	}
	want := []PlanExercise{
		{Name: "Squat", Sets: 4, Reps: 5},
		// No target sets to backfill from, so the column defaults apply.
		{Name: "Plank", Sets: 3, Reps: 5},
	}
	if len(plan.Days) != 1 || !reflect.DeepEqual(plan.Days[0].Exercises, want) {
		t.Errorf("expected exercises %+v, got %+v", want, plan.Days)
	}

	var setCount int
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_sets").Scan(&setCount)
	if setCount != 4 {
		t.Errorf("expected old target sets to be kept, got %d", setCount)
	}
}

func TestMigrate_UpgradeFromV6AddsPressAndPullUpDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v6.db")

	// Build a database at migration 0006 where the new built-ins already
	// exist as custom exercises, one of them tagged and logged by the user.
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	stmts := []string{"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"}
	for i := 1; i <= 6; i++ {
		matches, err := fs.Glob(migrationsFS, fmt.Sprintf("migrations/%04d_*.sql", i))
		if err != nil || len(matches) != 1 {
			t.Fatalf("failed to find migration %d: %v", i, err)
		}
		contents, err := migrationsFS.ReadFile(matches[0])
		if err != nil {
			t.Fatalf("failed to read %s: %v", matches[0], err)
		}
		stmts = append(stmts, string(contents),
			fmt.Sprintf("INSERT INTO schema_migrations (version, applied_at) VALUES (%d, '2026-01-01T00:00:00Z')", i))
	}
	stmts = append(stmts,
		"INSERT INTO exercise_library (id, name, is_default) VALUES (100, 'Pull-up', 0), (101, 'Incline Bench Press', 0), (102, 'Incline Dumbbell Press', 0)",
		"INSERT INTO exercise_muscles (exercise_name, muscle, role) VALUES ('Pull-up', 'back', 'primary')",
		"INSERT INTO workouts (id, date) VALUES (1, '2026-10-01')",
		"INSERT INTO exercises (id, workout_id, name) VALUES (1, 1, 'Pull-up')",
		"INSERT INTO sets (exercise_id, reps, weight) VALUES (1, 8, 0)",
	)
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v6 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v6 database: %v", err)
	}
	defer s.Close()
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("failed to seed: %v", err)
	}

	for id, name := range map[int]string{100: "Pull-up", 101: "Incline Bench Press", 102: "Incline Dumbbell Press"} {
		var gotID, count int
		var isDefault bool
		s.db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE name = ?", name).Scan(&count)
		s.db.QueryRow("SELECT id, is_default FROM exercise_library WHERE name = ?", name).Scan(&gotID, &isDefault)
		if count != 1 || gotID != id || !isDefault {
			t.Errorf("expected %s to stay exercise %d and become default, got %d rows, id %d, default %v", name, id, count, gotID, isDefault)
		}
	}

	muscles, err := s.GetExerciseMuscles()
	if err != nil {
		t.Fatalf("failed to get muscles: %v", err)
	}
	if pullUp := muscles["Pull-up"]; len(pullUp) != 1 || pullUp[0] != (MuscleTarget{Muscle: "back", Role: RolePrimary}) {
		t.Errorf("expected user's Pull-up tags kept, got %+v", pullUp)
	}
	for _, name := range []string{"Incline Bench Press", "Incline Dumbbell Press"} {
		if len(muscles[name]) != 3 {
			t.Errorf("expected %s to get 3 default tags, got %+v", name, muscles[name])
		}
	}

	stats, err := s.GetStatisticsResponse("Pull-up")
	if err != nil || len(stats.Data) != 1 {
		t.Errorf("expected Pull-up history to remain, got %+v (%v)", stats.Data, err)
	}
}

func TestMigrate_UpgradeFromV7AddsCardioKeepingWorkouts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v7.db")

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	stmts := []string{"CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"}
	for i := 1; i <= 7; i++ {
		matches, err := fs.Glob(migrationsFS, fmt.Sprintf("migrations/%04d_*.sql", i))
		if err != nil || len(matches) != 1 {
			t.Fatalf("failed to find migration %d: %v", i, err)
		}
		contents, err := migrationsFS.ReadFile(matches[0])
		if err != nil {
			t.Fatalf("failed to read %s: %v", matches[0], err)
		}
		stmts = append(stmts, string(contents),
			fmt.Sprintf("INSERT INTO schema_migrations (version, applied_at) VALUES (%d, '2026-01-01T00:00:00Z')", i))
	}
	stmts = append(stmts,
		"INSERT INTO workouts (id, date) VALUES (1, '2026-10-01')",
		"INSERT INTO exercises (id, workout_id, name) VALUES (1, 1, 'Squat')",
		"INSERT INTO sets (exercise_id, reps, weight) VALUES (1, 5, 100)",
		"INSERT INTO bodyweight (date, weight) VALUES ('2026-10-01', 80)",
	)
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("failed to build v7 database: %v", err)
		}
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("failed to open and migrate v7 database: %v", err)
	}
	defer s.Close()

	workouts, err := s.GetWorkouts()
	if err != nil || len(workouts) != 1 || len(workouts[0].Exercises) != 1 {
		t.Errorf("expected the logged workout kept, got %+v (%v)", workouts, err)
	}
	bodyweight, err := s.ListBodyweight()
	if err != nil || len(bodyweight) != 1 {
		t.Errorf("expected bodyweight kept, got %+v (%v)", bodyweight, err)
	}
	if _, err := s.SaveCardioWorkouts([]CardioWorkout{{
		Date: "2026-10-02", StartedAt: "2026-10-02T07:00:00Z", Activity: ActivityRunning, DurationSeconds: 1800,
	}}); err != nil {
		t.Errorf("expected cardio workouts to be storable, got %v", err)
	}
}
