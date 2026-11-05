package handlers

import (
	"net/http"
	"net/http/httptest"
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

// iOS caches GET responses that don't forbid it, and an insights URL stays
// the same all day, so a run imported after the first load never showed.
func TestAPIResponsesAreNotCached(t *testing.T) {
	h, _ := newTestHandlers(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	for _, path := range []string{
		"/api/insights?date=2026-03-31",
		"/api/insights/cardio?date=2026-03-31",
		"/api/cardio",
		"/api/bodyweight",
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d: %s", path, w.Code, w.Body.String())
		}
		if got := w.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: expected Cache-Control no-store, got %q", path, got)
		}
	}
}
