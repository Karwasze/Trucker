package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// setupTestDB creates a fresh in-memory SQLite database for testing.
// Each call returns an isolated DB so tests don't interfere with each other.
func setupTestDB(t *testing.T) {
	t.Helper()
	var err error
	db, err = sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	createTables := `
	CREATE TABLE IF NOT EXISTS workouts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		workout_type TEXT DEFAULT 'custom',
		workout_day INTEGER DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS exercise_library (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		is_default INTEGER NOT NULL DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS exercises (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workout_id INTEGER,
		name TEXT NOT NULL,
		FOREIGN KEY(workout_id) REFERENCES workouts(id)
	);
	CREATE TABLE IF NOT EXISTS sets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		exercise_id INTEGER,
		reps INTEGER NOT NULL,
		weight REAL NOT NULL,
		FOREIGN KEY(exercise_id) REFERENCES exercises(id)
	);
	CREATE TABLE IF NOT EXISTS gzclp_settings (
		id INTEGER PRIMARY KEY DEFAULT 1,
		current_day INTEGER NOT NULL DEFAULT 1,
		skipped_days INTEGER NOT NULL DEFAULT 0,
		CONSTRAINT single_row CHECK (id = 1)
	);
	CREATE TABLE IF NOT EXISTS gzclp_day_exercises (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		day INTEGER NOT NULL,
		slot TEXT NOT NULL,
		exercise_name TEXT NOT NULL,
		UNIQUE(day, slot)
	);`

	_, err = db.Exec(createTables)
	if err != nil {
		t.Fatalf("failed to create tables: %v", err)
	}

	db.Exec("INSERT OR IGNORE INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 1, 0)")

	t.Cleanup(func() {
		db.Close()
	})
}

// seedWorkout inserts a workout with exercises and sets for testing.
func seedWorkout(t *testing.T, date, workoutType string, workoutDay int, exercises []Exercise) int {
	t.Helper()
	w := Workout{
		Date:        date,
		WorkoutType: workoutType,
		WorkoutDay:  workoutDay,
		Exercises:   exercises,
	}
	err := saveWorkoutToDB(w)
	if err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
	var id int
	db.QueryRow("SELECT id FROM workouts WHERE date = ? ORDER BY id DESC LIMIT 1", date).Scan(&id)
	return id
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

func TestPopulateDefaultExercises(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	var count int
	db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE is_default = 1").Scan(&count)
	if count != 16 {
		t.Errorf("expected 16 default exercises, got %d", count)
	}

	// Verify specific exercises exist
	expected := []string{"Squat", "Bench Press", "Deadlift", "Overhead Press"}
	for _, name := range expected {
		var exists bool
		db.QueryRow("SELECT EXISTS(SELECT 1 FROM exercise_library WHERE name = ?)", name).Scan(&exists)
		if !exists {
			t.Errorf("expected default exercise %q to exist", name)
		}
	}
}

func TestPopulateDefaultExercises_Idempotent(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()
	populateDefaultExercises() // call twice

	var count int
	db.QueryRow("SELECT COUNT(*) FROM exercise_library").Scan(&count)
	if count != 16 {
		t.Errorf("expected 16 exercises after double populate, got %d", count)
	}
}

func TestPopulateDefaultGZCLPDayExercises(t *testing.T) {
	setupTestDB(t)
	populateDefaultGZCLPDayExercises()

	var count int
	db.QueryRow("SELECT COUNT(*) FROM gzclp_day_exercises").Scan(&count)
	if count != 20 {
		t.Errorf("expected 20 GZCLP day exercises, got %d", count)
	}

	// Verify each day has 5 slots
	for day := 1; day <= 4; day++ {
		var dayCount int
		db.QueryRow("SELECT COUNT(*) FROM gzclp_day_exercises WHERE day = ?", day).Scan(&dayCount)
		if dayCount != 5 {
			t.Errorf("expected 5 exercises for day %d, got %d", day, dayCount)
		}
	}
}

func TestGetAllExercises(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	exercises, err := getAllExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(exercises) != 16 {
		t.Errorf("expected 16 exercises, got %d", len(exercises))
	}

	// Verify sorted by name
	for i := 1; i < len(exercises); i++ {
		if exercises[i].Name < exercises[i-1].Name {
			t.Errorf("exercises not sorted: %q before %q", exercises[i-1].Name, exercises[i].Name)
		}
	}
}

func TestGetAllExercises_Empty(t *testing.T) {
	setupTestDB(t)

	exercises, err := getAllExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if exercises != nil && len(exercises) != 0 {
		t.Errorf("expected empty slice, got %d exercises", len(exercises))
	}
}

func TestSaveAndGetWorkouts(t *testing.T) {
	setupTestDB(t)

	workout := Workout{
		Date:        "2026-03-15",
		WorkoutType: "custom",
		WorkoutDay:  0,
		Exercises: []Exercise{
			{
				Name: "Squat",
				Sets: []Set{
					{Weight: 100, Reps: 5},
					{Weight: 110, Reps: 3},
				},
			},
			{
				Name: "Bench Press",
				Sets: []Set{
					{Weight: 80, Reps: 8},
				},
			},
		},
	}

	err := saveWorkoutToDB(workout)
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	workouts, err := getWorkoutsFromDB()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}

	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}

	w := workouts[0]
	if w.Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", w.Date)
	}
	if w.WorkoutType != "custom" {
		t.Errorf("expected workout_type custom, got %s", w.WorkoutType)
	}
	if len(w.Exercises) != 2 {
		t.Fatalf("expected 2 exercises, got %d", len(w.Exercises))
	}

	// Find Squat exercise
	var squat *Exercise
	for i := range w.Exercises {
		if w.Exercises[i].Name == "Squat" {
			squat = &w.Exercises[i]
		}
	}
	if squat == nil {
		t.Fatal("expected Squat exercise")
	}
	if len(squat.Sets) != 2 {
		t.Errorf("expected 2 sets for Squat, got %d", len(squat.Sets))
	}
	if squat.Sets[0].Weight != 100 || squat.Sets[0].Reps != 5 {
		t.Errorf("unexpected set data: %+v", squat.Sets[0])
	}
}

func TestSaveWorkout_GZCLPType(t *testing.T) {
	setupTestDB(t)

	workout := Workout{
		Date:        "2026-03-15",
		WorkoutType: "gzclp",
		WorkoutDay:  2,
		Exercises: []Exercise{
			{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
		},
	}

	err := saveWorkoutToDB(workout)
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	workouts, err := getWorkoutsFromDB()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if workouts[0].WorkoutType != "gzclp" {
		t.Errorf("expected gzclp type, got %s", workouts[0].WorkoutType)
	}
	if workouts[0].WorkoutDay != 2 {
		t.Errorf("expected workout day 2, got %d", workouts[0].WorkoutDay)
	}
}

func TestGetWorkouts_MultipleWorkouts_OrderedByDateDesc(t *testing.T) {
	setupTestDB(t)

	seedWorkout(t, "2026-03-10", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Deadlift", Sets: []Set{{Weight: 120, Reps: 3}}},
	})

	workouts, err := getWorkoutsFromDB()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 2 {
		t.Fatalf("expected 2 workouts, got %d", len(workouts))
	}
}

func TestGetNextGZCLPWorkoutDay_Default(t *testing.T) {
	setupTestDB(t)

	day, err := getNextGZCLPWorkoutDay()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != 1 {
		t.Errorf("expected day 1, got %d", day)
	}
}

func TestGetNextGZCLPWorkoutDay_AfterUpdate(t *testing.T) {
	setupTestDB(t)

	db.Exec("UPDATE gzclp_settings SET current_day = 3 WHERE id = 1")

	day, err := getNextGZCLPWorkoutDay()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != 3 {
		t.Errorf("expected day 3, got %d", day)
	}
}

func TestGetGZCLPExercises(t *testing.T) {
	setupTestDB(t)
	populateDefaultGZCLPDayExercises()

	tests := []struct {
		day                                    int
		wantT1, wantT2, wantT3, wantA1, wantA2 string
	}{
		{1, "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"},
		{2, "Overhead Press", "Deadlift", "Bent Over Row", "Lateral Raise", "Leg Curl"},
		{3, "Bench Press", "Squat", "Lat Pulldown", "Chest Fly", "Leg Press"},
		{4, "Deadlift", "Overhead Press", "Bent Over Row", "Leg Curl", "Lateral Raise"},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("Day%d", tt.day), func(t *testing.T) {
			t1, t2, t3, a1, a2 := getGZCLPExercises(tt.day)
			if t1 != tt.wantT1 {
				t.Errorf("T1: got %q, want %q", t1, tt.wantT1)
			}
			if t2 != tt.wantT2 {
				t.Errorf("T2: got %q, want %q", t2, tt.wantT2)
			}
			if t3 != tt.wantT3 {
				t.Errorf("T3: got %q, want %q", t3, tt.wantT3)
			}
			if a1 != tt.wantA1 {
				t.Errorf("Additional1: got %q, want %q", a1, tt.wantA1)
			}
			if a2 != tt.wantA2 {
				t.Errorf("Additional2: got %q, want %q", a2, tt.wantA2)
			}
		})
	}
}

func TestGetGZCLPExercises_FallbackDefaults(t *testing.T) {
	setupTestDB(t)
	// No day exercises populated — should return hardcoded defaults
	t1, t2, t3, a1, a2 := getGZCLPExercises(99)
	if t1 != "Squat" || t2 != "Bench Press" || t3 != "Lat Pulldown" || a1 != "Leg Press" || a2 != "Chest Fly" {
		t.Errorf("unexpected fallback defaults: %s, %s, %s, %s, %s", t1, t2, t3, a1, a2)
	}
}

func TestGetGZCLPAllDayExercises(t *testing.T) {
	setupTestDB(t)
	populateDefaultGZCLPDayExercises()

	assignments, err := getGZCLPAllDayExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(assignments) != 20 {
		t.Errorf("expected 20 assignments, got %d", len(assignments))
	}
}

func TestCalculate1RM(t *testing.T) {
	tests := []struct {
		weight float64
		reps   int
		want   float64
	}{
		{100, 1, 100},
		{100, 5, 112.5},  // 100 * 36/32
		{80, 10, 106.67},  // 80 * 36/27
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%.0fx%d", tt.weight, tt.reps), func(t *testing.T) {
			got := calculate1RM(tt.weight, tt.reps)
			// Allow small floating point difference
			diff := got - tt.want
			if diff < -0.01 || diff > 0.01 {
				t.Errorf("calculate1RM(%.0f, %d) = %.2f, want %.2f", tt.weight, tt.reps, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// E2E / Integration Tests (HTTP handlers)
// ---------------------------------------------------------------------------

func TestHomeHandler(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	home(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Trucker") {
		t.Error("home page should contain 'Trucker'")
	}
}

func TestNewWorkoutFormHandler(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	req := httptest.NewRequest("GET", "/workout/new", nil)
	w := httptest.NewRecorder()
	newWorkoutForm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Squat") {
		t.Error("workout form should contain exercise names")
	}
}

func TestCreateWorkout_POST(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	form.Set("reps_0_1", "5")
	form.Set("weight_0_1", "105")
	form.Set("exercise_1", "Bench Press")
	form.Set("reps_1_0", "8")
	form.Set("weight_1_0", "80")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	// Verify workout was saved
	workouts, _ := getWorkoutsFromDB()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if workouts[0].Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", workouts[0].Date)
	}
}

func TestCreateWorkout_GET_Redirects(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/workout/create", nil)
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect for GET, got %d", w.Code)
	}
}

func TestCreateWorkout_GZCLP_AdvancesDay(t *testing.T) {
	setupTestDB(t)

	// Current day is 1
	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "gzclp")
	form.Set("workout_day", "1")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303, got %d", w.Code)
	}

	// Day should have advanced to 2
	day, _ := getNextGZCLPWorkoutDay()
	if day != 2 {
		t.Errorf("expected GZCLP day to advance to 2, got %d", day)
	}
}

func TestCreateWorkout_GZCLP_Day4WrapsTo1(t *testing.T) {
	setupTestDB(t)
	db.Exec("UPDATE gzclp_settings SET current_day = 4 WHERE id = 1")

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "gzclp")
	form.Set("workout_day", "4")
	form.Set("exercise_0", "Deadlift")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "140")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	day, _ := getNextGZCLPWorkoutDay()
	if day != 1 {
		t.Errorf("expected GZCLP day to wrap to 1, got %d", day)
	}
}

func TestCreateWorkout_SkipsEmptySets(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	// Set 0: filled
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	// Set 1: empty (both fields present but empty)
	form.Set("reps_0_1", "")
	form.Set("weight_0_1", "")
	// Set 2: filled
	form.Set("reps_0_2", "3")
	form.Set("weight_0_2", "110")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	workouts, _ := getWorkoutsFromDB()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}

	var squat *Exercise
	for i := range workouts[0].Exercises {
		if workouts[0].Exercises[i].Name == "Squat" {
			squat = &workouts[0].Exercises[i]
		}
	}
	if squat == nil {
		t.Fatal("expected Squat exercise")
	}
	if len(squat.Sets) != 2 {
		t.Errorf("expected 2 sets (empty one skipped), got %d", len(squat.Sets))
	}
	if squat.Sets[0].Weight != 100 || squat.Sets[0].Reps != 5 {
		t.Errorf("unexpected first set: %+v", squat.Sets[0])
	}
	if squat.Sets[1].Weight != 110 || squat.Sets[1].Reps != 3 {
		t.Errorf("unexpected second set: %+v", squat.Sets[1])
	}
}

func TestCreateWorkout_SkipsExerciseWithAllEmptySets(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	// Exercise 0: has filled sets
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	// Exercise 1: all sets empty
	form.Set("exercise_1", "Bench Press")
	form.Set("reps_1_0", "")
	form.Set("weight_1_0", "")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	workouts, _ := getWorkoutsFromDB()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if len(workouts[0].Exercises) != 1 {
		t.Errorf("expected 1 exercise (empty one skipped), got %d", len(workouts[0].Exercises))
	}
	if workouts[0].Exercises[0].Name != "Squat" {
		t.Errorf("expected Squat, got %s", workouts[0].Exercises[0].Name)
	}
}

func TestCreateWorkout_InvalidReps(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "abc")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid reps, got %d", w.Code)
	}
}

func TestCreateWorkout_InvalidWeight(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "notanumber")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid weight, got %d", w.Code)
	}
}

func TestListWorkoutsHandler(t *testing.T) {
	setupTestDB(t)
	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
	})

	req := httptest.NewRequest("GET", "/workouts", nil)
	w := httptest.NewRecorder()
	listWorkouts(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "2026-03-15") {
		t.Error("workouts list should contain the workout date")
	}
	if !strings.Contains(body, "Squat") {
		t.Error("workouts list should contain exercise name")
	}
}

func TestListWorkoutsHandler_Empty(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/workouts", nil)
	w := httptest.NewRecorder()
	listWorkouts(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "No workouts logged yet") {
		t.Error("should show empty state message")
	}
}

func TestDeleteWorkout_POST(t *testing.T) {
	setupTestDB(t)
	id := seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
	})

	form := url.Values{}
	form.Set("id", fmt.Sprintf("%d", id))

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	deleteWorkout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify workout is gone
	workouts, _ := getWorkoutsFromDB()
	if len(workouts) != 0 {
		t.Errorf("expected 0 workouts after delete, got %d", len(workouts))
	}

	// Verify cascaded deletes
	var exerciseCount, setCount int
	db.QueryRow("SELECT COUNT(*) FROM exercises").Scan(&exerciseCount)
	db.QueryRow("SELECT COUNT(*) FROM sets").Scan(&setCount)
	if exerciseCount != 0 {
		t.Errorf("expected 0 exercises after cascade delete, got %d", exerciseCount)
	}
	if setCount != 0 {
		t.Errorf("expected 0 sets after cascade delete, got %d", setCount)
	}
}

func TestDeleteWorkout_GET_MethodNotAllowed(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/workout/delete", nil)
	w := httptest.NewRecorder()
	deleteWorkout(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestDeleteWorkout_MissingID(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	deleteWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestDeleteWorkout_NotFound(t *testing.T) {
	setupTestDB(t)

	form := url.Values{}
	form.Set("id", "999")

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	deleteWorkout(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestSkipGZCLPDay_POST(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("POST", "/gzclp/skip", nil)
	w := httptest.NewRecorder()
	skipGZCLPDay(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	day, _ := getNextGZCLPWorkoutDay()
	if day != 2 {
		t.Errorf("expected day 2 after skip, got %d", day)
	}

	// Verify skipped_days incremented
	var skipped int
	db.QueryRow("SELECT skipped_days FROM gzclp_settings WHERE id = 1").Scan(&skipped)
	if skipped != 1 {
		t.Errorf("expected skipped_days = 1, got %d", skipped)
	}
}

func TestSkipGZCLPDay_GET_MethodNotAllowed(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/gzclp/skip", nil)
	w := httptest.NewRecorder()
	skipGZCLPDay(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestSkipGZCLPDay_CyclesThrough(t *testing.T) {
	setupTestDB(t)

	// Skip 4 times, should cycle back to 1
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("POST", "/gzclp/skip", nil)
		w := httptest.NewRecorder()
		skipGZCLPDay(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("skip %d failed with %d", i+1, w.Code)
		}
	}

	day, _ := getNextGZCLPWorkoutDay()
	if day != 1 {
		t.Errorf("expected day 1 after 4 skips, got %d", day)
	}
}

func TestGZCLPFormHandler(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()
	populateDefaultGZCLPDayExercises()

	req := httptest.NewRequest("GET", "/gzclp", nil)
	w := httptest.NewRecorder()
	gzclpForm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Squat") {
		t.Error("GZCLP form should contain exercise names")
	}
}

func TestExercisesPageHandler(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/exercises", nil)
	w := httptest.NewRecorder()
	exercisesPage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestStatisticsPageHandler(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/statistics", nil)
	w := httptest.NewRecorder()
	statisticsPage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

// ---------------------------------------------------------------------------
// API Tests
// ---------------------------------------------------------------------------

func TestExercisesAPI_GET(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	req := httptest.NewRequest("GET", "/api/exercises", nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var exercises []ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercises)
	if len(exercises) != 16 {
		t.Errorf("expected 16 exercises, got %d", len(exercises))
	}
}

func TestExercisesAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/api/exercises", nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Should return [] not null
	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Errorf("expected empty JSON array, got %s", body)
	}
}

func TestExercisesAPI_POST(t *testing.T) {
	setupTestDB(t)

	body := `{"name": "Hip Thrust"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var exercise ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercise)
	if exercise.Name != "Hip Thrust" {
		t.Errorf("expected name Hip Thrust, got %s", exercise.Name)
	}
	if exercise.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if exercise.IsDefault {
		t.Error("custom exercise should not be default")
	}
}

func TestExercisesAPI_POST_EmptyName(t *testing.T) {
	setupTestDB(t)

	body := `{"name": ""}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty name, got %d", w.Code)
	}
}

func TestExercisesAPI_POST_Duplicate(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	body := `{"name": "Squat"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected 409 for duplicate, got %d", w.Code)
	}
}

func TestExercisesAPI_PUT(t *testing.T) {
	setupTestDB(t)

	// Insert a custom exercise
	result, _ := db.Exec("INSERT INTO exercise_library (name, is_default) VALUES ('Old Name', 0)")
	id, _ := result.LastInsertId()

	body := fmt.Sprintf(`{"id": %d, "name": "New Name"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify name changed
	var name string
	db.QueryRow("SELECT name FROM exercise_library WHERE id = ?", id).Scan(&name)
	if name != "New Name" {
		t.Errorf("expected 'New Name', got %q", name)
	}
}

func TestExercisesAPI_PUT_DefaultProtected(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	var id int
	db.QueryRow("SELECT id FROM exercise_library WHERE name = 'Squat'").Scan(&id)

	body := fmt.Sprintf(`{"id": %d, "name": "Back Squat"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for editing default exercise, got %d", w.Code)
	}
}

func TestExercisesAPI_PUT_UpdatesGZCLPReferences(t *testing.T) {
	setupTestDB(t)

	// Insert custom exercise and assign to GZCLP
	db.Exec("INSERT INTO exercise_library (name, is_default) VALUES ('Custom Lift', 0)")
	db.Exec("INSERT INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (1, 'T1', 'Custom Lift')")

	var id int
	db.QueryRow("SELECT id FROM exercise_library WHERE name = 'Custom Lift'").Scan(&id)

	body := fmt.Sprintf(`{"id": %d, "name": "Renamed Lift"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify GZCLP reference updated
	var gzclpName string
	db.QueryRow("SELECT exercise_name FROM gzclp_day_exercises WHERE day = 1 AND slot = 'T1'").Scan(&gzclpName)
	if gzclpName != "Renamed Lift" {
		t.Errorf("expected GZCLP reference to update to 'Renamed Lift', got %q", gzclpName)
	}
}

func TestExercisesAPI_DELETE(t *testing.T) {
	setupTestDB(t)

	result, _ := db.Exec("INSERT INTO exercise_library (name, is_default) VALUES ('To Delete', 0)")
	id, _ := result.LastInsertId()

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", id), nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE id = ?", id).Scan(&count)
	if count != 0 {
		t.Error("exercise should have been deleted")
	}
}

func TestExercisesAPI_DELETE_DefaultProtected(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()

	var id int
	db.QueryRow("SELECT id FROM exercise_library WHERE name = 'Squat'").Scan(&id)

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", id), nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for deleting default, got %d", w.Code)
	}
}

func TestExercisesAPI_DELETE_MissingID(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("DELETE", "/api/exercises", nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestExercisesAPI_UnsupportedMethod(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("PATCH", "/api/exercises", nil)
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestGZCLPConfigAPI_GET(t *testing.T) {
	setupTestDB(t)
	populateDefaultGZCLPDayExercises()

	req := httptest.NewRequest("GET", "/api/gzclp/config", nil)
	w := httptest.NewRecorder()
	handleGZCLPConfigAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var assignments []GZCLPDayExercise
	json.NewDecoder(w.Body).Decode(&assignments)
	if len(assignments) != 20 {
		t.Errorf("expected 20 assignments, got %d", len(assignments))
	}
}

func TestGZCLPConfigAPI_PUT(t *testing.T) {
	setupTestDB(t)

	body := `[{"day":1,"slot":"T1","exercise_name":"Front Squat"}]`
	req := httptest.NewRequest("PUT", "/api/gzclp/config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleGZCLPConfigAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var name string
	db.QueryRow("SELECT exercise_name FROM gzclp_day_exercises WHERE day = 1 AND slot = 'T1'").Scan(&name)
	if name != "Front Squat" {
		t.Errorf("expected Front Squat, got %q", name)
	}
}

func TestGZCLPConfigAPI_UnsupportedMethod(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("DELETE", "/api/gzclp/config", nil)
	w := httptest.NewRecorder()
	handleGZCLPConfigAPI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestLatestExerciseAPI(t *testing.T) {
	setupTestDB(t)

	// Seed two workouts for the same exercise on different dates
	seedWorkout(t, "2026-03-10", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}, {Weight: 105, Reps: 3}}},
	})

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Squat", nil)
	w := httptest.NewRecorder()
	getLatestExercise(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var result struct {
		Sets []Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)
	if len(result.Sets) != 2 {
		t.Fatalf("expected 2 sets from latest workout, got %d", len(result.Sets))
	}
	if result.Sets[0].Weight != 100 {
		t.Errorf("expected weight 100, got %.1f", result.Sets[0].Weight)
	}
}

func TestLatestExerciseAPI_MissingName(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/api/latest-exercise", nil)
	w := httptest.NewRecorder()
	getLatestExercise(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestLatestExerciseAPI_NoData(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Squat", nil)
	w := httptest.NewRecorder()
	getLatestExercise(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var result struct {
		Sets []Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)
	if len(result.Sets) != 0 {
		t.Errorf("expected 0 sets, got %d", len(result.Sets))
	}
}

func TestStatisticsAPI_ExerciseList(t *testing.T) {
	setupTestDB(t)

	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
		{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 8}}},
	})

	req := httptest.NewRequest("GET", "/api/statistics", nil)
	w := httptest.NewRecorder()
	getStatisticsData(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if len(response.Exercises) != 2 {
		t.Errorf("expected 2 exercises, got %d", len(response.Exercises))
	}
}

func TestStatisticsAPI_ExerciseData(t *testing.T) {
	setupTestDB(t)

	seedWorkout(t, "2026-03-10", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}, {Weight: 80, Reps: 10}}},
	})
	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 110, Reps: 5}}},
	})

	req := httptest.NewRequest("GET", "/api/statistics?exercise=Squat", nil)
	w := httptest.NewRecorder()
	getStatisticsData(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if len(response.Data) != 2 {
		t.Fatalf("expected 2 data points, got %d", len(response.Data))
	}

	// Should be sorted by date
	if response.Data[0].Date != "2026-03-10" {
		t.Errorf("expected first date 2026-03-10, got %s", response.Data[0].Date)
	}
	if response.Data[1].Date != "2026-03-15" {
		t.Errorf("expected second date 2026-03-15, got %s", response.Data[1].Date)
	}

	// Verify 1RM calculation for first workout: max of (100*5) and (80*10)
	// 100 * 36/32 = 112.5, 80 * 36/27 = 106.67 → best is 112.5
	if response.Data[0].Estimated1RM < 112.4 || response.Data[0].Estimated1RM > 112.6 {
		t.Errorf("expected estimated 1RM ~112.5, got %.2f", response.Data[0].Estimated1RM)
	}

	// Verify total volume for first workout: (100*5) + (80*10) = 500 + 800 = 1300
	if response.Data[0].TotalVolume != 1300 {
		t.Errorf("expected total volume 1300, got %.0f", response.Data[0].TotalVolume)
	}
}

func TestStatisticsAPI_NoExerciseData(t *testing.T) {
	setupTestDB(t)

	req := httptest.NewRequest("GET", "/api/statistics?exercise=Nonexistent", nil)
	w := httptest.NewRecorder()
	getStatisticsData(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var response StatisticsResponse
	json.NewDecoder(w.Body).Decode(&response)
	if response.Data == nil || len(response.Data) != 0 {
		t.Errorf("expected empty data array, got %v", response.Data)
	}
}

// ---------------------------------------------------------------------------
// E2E: Full workflow tests
// ---------------------------------------------------------------------------

func TestE2E_CreateAndDeleteWorkout(t *testing.T) {
	setupTestDB(t)

	// Create a workout
	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	createWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("create failed: %d", w.Code)
	}

	// Get the workout ID
	workouts, _ := getWorkoutsFromDB()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	id := workouts[0].ID

	// Delete it
	delForm := url.Values{}
	delForm.Set("id", fmt.Sprintf("%d", id))
	req = httptest.NewRequest("POST", "/workout/delete", strings.NewReader(delForm.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w = httptest.NewRecorder()
	deleteWorkout(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete failed: %d", w.Code)
	}

	// Verify empty
	workouts, _ = getWorkoutsFromDB()
	if len(workouts) != 0 {
		t.Errorf("expected 0 workouts, got %d", len(workouts))
	}
}

func TestE2E_GZCLPFullDayCycle(t *testing.T) {
	setupTestDB(t)
	populateDefaultExercises()
	populateDefaultGZCLPDayExercises()

	for expectedDay := 1; expectedDay <= 4; expectedDay++ {
		day, _ := getNextGZCLPWorkoutDay()
		if day != expectedDay {
			t.Fatalf("before workout %d: expected day %d, got %d", expectedDay, expectedDay, day)
		}

		// Log a GZCLP workout
		form := url.Values{}
		form.Set("date", fmt.Sprintf("2026-03-%02d", 10+expectedDay))
		form.Set("workout_type", "gzclp")
		form.Set("workout_day", fmt.Sprintf("%d", expectedDay))
		form.Set("exercise_0", "Squat")
		form.Set("reps_0_0", "5")
		form.Set("weight_0_0", "100")

		req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		createWorkout(w, req)

		if w.Code != http.StatusSeeOther {
			t.Fatalf("workout %d create failed: %d", expectedDay, w.Code)
		}
	}

	// After 4 workouts, should be back to day 1
	day, _ := getNextGZCLPWorkoutDay()
	if day != 1 {
		t.Errorf("expected day 1 after full cycle, got %d", day)
	}
}

func TestE2E_ExerciseCRUD(t *testing.T) {
	setupTestDB(t)

	// Create
	body := `{"name": "Hip Thrust"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("create failed: %d", w.Code)
	}
	var created ExerciseDB
	json.NewDecoder(w.Body).Decode(&created)

	// Read
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	handleExercisesAPI(w, req)
	var exercises []ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercises)
	if len(exercises) != 1 {
		t.Fatalf("expected 1 exercise, got %d", len(exercises))
	}
	if exercises[0].Name != "Hip Thrust" {
		t.Errorf("expected Hip Thrust, got %s", exercises[0].Name)
	}

	// Update
	body = fmt.Sprintf(`{"id": %d, "name": "Barbell Hip Thrust"}`, created.ID)
	req = httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	handleExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("update failed: %d", w.Code)
	}

	// Verify update
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	handleExercisesAPI(w, req)
	json.NewDecoder(w.Body).Decode(&exercises)
	if exercises[0].Name != "Barbell Hip Thrust" {
		t.Errorf("expected updated name, got %s", exercises[0].Name)
	}

	// Delete
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", created.ID), nil)
	w = httptest.NewRecorder()
	handleExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("delete failed: %d", w.Code)
	}

	// Verify deleted
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	handleExercisesAPI(w, req)
	body2 := strings.TrimSpace(w.Body.String())
	if body2 != "[]" {
		t.Errorf("expected empty array after delete, got %s", body2)
	}
}

func TestE2E_LatestExerciseAfterMultipleWorkouts(t *testing.T) {
	setupTestDB(t)

	// Seed older workout
	seedWorkout(t, "2026-03-01", "custom", 0, []Exercise{
		{Name: "Bench Press", Sets: []Set{{Weight: 60, Reps: 10}}},
	})
	// Seed newer workout
	seedWorkout(t, "2026-03-15", "custom", 0, []Exercise{
		{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 5}, {Weight: 85, Reps: 3}}},
	})

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Bench+Press", nil)
	w := httptest.NewRecorder()
	getLatestExercise(w, req)

	var result struct {
		Sets []Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)

	if len(result.Sets) != 2 {
		t.Fatalf("expected 2 sets from latest workout, got %d", len(result.Sets))
	}
	if result.Sets[0].Weight != 80 {
		t.Errorf("expected first set weight 80, got %.1f", result.Sets[0].Weight)
	}
	if result.Sets[1].Weight != 85 {
		t.Errorf("expected second set weight 85, got %.1f", result.Sets[1].Weight)
	}
}
