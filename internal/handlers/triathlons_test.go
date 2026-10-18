package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestTriathlonsAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	leg := func(activity string, metres, seconds float64) store.CardioWorkout {
		return store.CardioWorkout{
			Date: "2026-03-10", StartedAt: "2026-03-10T07:00:00Z", Activity: activity,
			DurationSeconds: seconds, DistanceM: &metres,
		}
	}
	if _, err := s.SaveCardioWorkouts([]store.CardioWorkout{
		leg(store.ActivitySwimming, 750, 900),
		leg(store.ActivityCycling, 20000, 2400),
		leg(store.ActivityRunning, 5000, 1500),
	}); err != nil {
		t.Fatalf("failed to seed cardio: %v", err)
	}

	w := httptest.NewRecorder()
	h.TriathlonsAPI(w, httptest.NewRequest("GET", "/api/triathlons", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var tris []store.Triathlon
	json.NewDecoder(w.Body).Decode(&tris)
	if len(tris) != 1 || tris[0].Class != store.TriathlonSprint || tris[0].TotalSeconds != 4800 || !tris[0].PR {
		t.Errorf("unexpected triathlons %+v", tris)
	}
}

func TestTriathlonsAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)
	w := httptest.NewRecorder()
	h.TriathlonsAPI(w, httptest.NewRequest("GET", "/api/triathlons", nil))
	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected empty JSON array, got %s", body)
	}
}

func TestTriathlonsAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)
	w := httptest.NewRecorder()
	h.TriathlonsAPI(w, httptest.NewRequest("POST", "/api/triathlons", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
