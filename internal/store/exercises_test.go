package store

import "testing"

func TestSeedDefaultExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE is_default = 1").Scan(&count)
	if count != 16 {
		t.Errorf("expected 16 default exercises, got %d", count)
	}

	expected := []string{"Squat", "Bench Press", "Deadlift", "Overhead Press"}
	for _, name := range expected {
		var exists bool
		s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM exercise_library WHERE name = ?)", name).Scan(&exists)
		if !exists {
			t.Errorf("expected default exercise %q to exist", name)
		}
	}
}

func TestSeedDefaultExercises_Idempotent(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error on second seed: %v", err)
	}

	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM exercise_library").Scan(&count)
	if count != 16 {
		t.Errorf("expected 16 exercises after double seed, got %d", count)
	}
}

func TestGetAllExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	exercises, err := s.GetAllExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(exercises) != 16 {
		t.Errorf("expected 16 exercises, got %d", len(exercises))
	}

	for i := 1; i < len(exercises); i++ {
		if exercises[i].Name < exercises[i-1].Name {
			t.Errorf("exercises not sorted: %q before %q", exercises[i-1].Name, exercises[i].Name)
		}
	}
}

func TestGetAllExercises_Empty(t *testing.T) {
	s := newTestStore(t)

	exercises, err := s.GetAllExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if exercises != nil && len(exercises) != 0 {
		t.Errorf("expected empty slice, got %d exercises", len(exercises))
	}
}
