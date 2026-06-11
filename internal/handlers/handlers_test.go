package handlers

import (
	"testing"

	"trucker/internal/store"
)

// templatesDir points at the repo's templates directory from within
// internal/handlers, where these tests run.
const templatesDir = "../../templates"

// newTestHandlers creates a Handlers instance backed by a fresh in-memory
// store. Each call returns isolated state so tests don't interfere with
// each other.
func newTestHandlers(t *testing.T) (*Handlers, *store.Store) {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open test store: %v", err)
	}
	t.Cleanup(func() {
		s.Close()
	})
	return New(s, templatesDir), s
}

// seedWorkout inserts a workout with exercises and sets for testing.
func seedWorkout(t *testing.T, s *store.Store, date, workoutType string, workoutDay int, exercises []store.Exercise) int {
	t.Helper()
	w := store.Workout{
		Date:        date,
		WorkoutType: workoutType,
		WorkoutDay:  workoutDay,
		Exercises:   exercises,
	}
	if err := s.SaveWorkout(w); err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
	var id int
	s.DB().QueryRow("SELECT id FROM workouts WHERE date = ? ORDER BY id DESC LIMIT 1", date).Scan(&id)
	return id
}
