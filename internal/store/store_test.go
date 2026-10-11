package store

import "testing"

// newTestStore creates a fresh in-memory store for testing. Each call
// returns an isolated store so tests don't interfere with each other.
func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("failed to open test store: %v", err)
	}
	t.Cleanup(func() {
		s.Close()
	})
	return s
}

// seedWorkout inserts a workout with exercises and sets for testing.
func seedWorkout(t *testing.T, s *Store, date string, exercises []Exercise) int {
	t.Helper()
	w := Workout{
		Date:      date,
		Exercises: exercises,
	}
	id, err := s.SaveWorkout(w)
	if err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
	return id
}
