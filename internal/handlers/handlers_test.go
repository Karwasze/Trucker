package handlers

import (
	"testing"

	"trucker/internal/store"
)

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
	return New(s), s
}

// seedWorkout inserts a workout with exercises and sets for testing.
func seedWorkout(t *testing.T, s *store.Store, date string, exercises []store.Exercise) int {
	t.Helper()
	w := store.Workout{
		Date:      date,
		Exercises: exercises,
	}
	id, err := s.SaveWorkout(w)
	if err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
	return id
}
