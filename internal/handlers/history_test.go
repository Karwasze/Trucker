package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestHistoryAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)

	w := httptest.NewRecorder()
	h.HistoryAPI(w, httptest.NewRequest("GET", "/api/history", nil))
	if body := strings.TrimSpace(w.Body.String()); body != `{"oldest":null}` {
		t.Errorf("expected no oldest date without workouts, got %s", body)
	}

	seedWorkout(t, s, "2026-05-02", nil)
	w = httptest.NewRecorder()
	h.HistoryAPI(w, httptest.NewRequest("GET", "/api/history", nil))
	if body := strings.TrimSpace(w.Body.String()); body != `{"oldest":"2026-05-02"}` {
		t.Errorf("expected the oldest workout's date, got %s", body)
	}
}

func TestHistoryAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)
	w := httptest.NewRecorder()
	h.HistoryAPI(w, httptest.NewRequest("POST", "/api/history", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

// Workouts, cardio and triathlons are listed a month at a time by History.
func TestListsBetweenDates(t *testing.T) {
	h, s := newTestHandlers(t)
	seedWorkout(t, s, "2026-09-30", nil)
	seedWorkout(t, s, "2026-10-01", nil)
	run := func(date string) store.CardioWorkout {
		return store.CardioWorkout{Date: date, StartedAt: date + "T07:00:00Z", Activity: store.ActivityRunning, DurationSeconds: 1500}
	}
	if _, err := s.SaveCardioWorkouts([]store.CardioWorkout{run("2026-10-31"), run("2026-11-01")}); err != nil {
		t.Fatalf("failed to seed cardio: %v", err)
	}

	for _, tc := range []struct {
		api  http.HandlerFunc
		path string
		date string
	}{
		{h.WorkoutsAPI, "/api/workouts", "2026-10-01"},
		{h.CardioAPI, "/api/cardio", "2026-10-31"},
		{h.TriathlonsAPI, "/api/triathlons", ""},
	} {
		w := httptest.NewRecorder()
		tc.api(w, httptest.NewRequest("GET", tc.path+"?from=2026-10-01&to=2026-10-31", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d: %s", tc.path, w.Code, w.Body.String())
		}
		body := w.Body.String()
		if tc.date == "" {
			if strings.TrimSpace(body) != "[]" {
				t.Errorf("%s: expected none, got %s", tc.path, body)
			}
		} else if strings.Count(body, `"date"`) != 1 || !strings.Contains(body, tc.date) {
			t.Errorf("%s: expected only %s, got %s", tc.path, tc.date, body)
		}

		w = httptest.NewRecorder()
		tc.api(w, httptest.NewRequest("GET", tc.path+"?from=October", nil))
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400 for a malformed date, got %d", tc.path, w.Code)
		}
	}
}
