package store

import (
	"errors"
	"testing"
)

func TestSeedDefaultExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE is_default = 1").Scan(&count)
	if count != 18 {
		t.Errorf("expected 18 default exercises, got %d", count)
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
	if count != 18 {
		t.Errorf("expected 18 exercises after double seed, got %d", count)
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
	if len(exercises) != 18 {
		t.Errorf("expected 18 exercises, got %d", len(exercises))
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

func TestSeedDefaultExercises_PromotesExistingCustomExercise(t *testing.T) {
	s := newTestStore(t)

	// Romanian Deadlift was added as a custom exercise and logged before it
	// became built-in.
	custom, err := s.CreateExercise("Romanian Deadlift")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	seedWorkout(t, s, "2026-03-10", []Exercise{{Name: "Romanian Deadlift", Sets: []Set{{Weight: 100, Reps: 8}}}})

	if err := s.SeedDefaultExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var id, count int
	var isDefault bool
	s.db.QueryRow("SELECT COUNT(*) FROM exercise_library WHERE name = 'Romanian Deadlift'").Scan(&count)
	s.db.QueryRow("SELECT id, is_default FROM exercise_library WHERE name = 'Romanian Deadlift'").Scan(&id, &isDefault)
	if count != 1 {
		t.Errorf("expected one Romanian Deadlift, got %d", count)
	}
	if id != custom.ID || !isDefault {
		t.Errorf("expected exercise %d to become default, got id %d default %v", custom.ID, id, isDefault)
	}

	stats, err := s.GetStatisticsResponse("Romanian Deadlift")
	if err != nil || len(stats.Data) != 1 {
		t.Errorf("expected logged history to remain, got %+v (%v)", stats.Data, err)
	}
	if err := s.DeleteExercise(custom.ID); !errors.Is(err, ErrDefaultExercise) {
		t.Errorf("expected promoted exercise to be protected, got %v", err)
	}
}
