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
func seedWorkout(t *testing.T, s *Store, date, workoutType string, workoutDay int, exercises []Exercise) int {
	t.Helper()
	w := Workout{
		Date:        date,
		WorkoutType: workoutType,
		WorkoutDay:  workoutDay,
		Exercises:   exercises,
	}
	if err := s.SaveWorkout(w); err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
	var id int
	s.db.QueryRow("SELECT id FROM workouts WHERE date = ? ORDER BY id DESC LIMIT 1", date).Scan(&id)
	return id
}
