package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"trucker/internal/store"
)

func TestAchievementsAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	metres := 5000.0
	if _, err := s.SaveCardioWorkouts([]store.CardioWorkout{{
		Date: "2026-03-10", StartedAt: "2026-03-10T07:00:00Z", Activity: store.ActivityRunning,
		DurationSeconds: 1440, DistanceM: &metres,
	}}); err != nil {
		t.Fatalf("failed to seed cardio: %v", err)
	}

	w := httptest.NewRecorder()
	h.AchievementsAPI(w, httptest.NewRequest("GET", "/api/achievements", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var achievements []store.Achievement
	if err := json.NewDecoder(w.Body).Decode(&achievements); err != nil {
		t.Fatal(err)
	}
	for _, a := range achievements {
		if a.ID != "pace-running-5000" {
			continue
		}
		if a.Best == nil || *a.Best != 1440 || a.Tiers[1].EarnedOn != "2026-03-10" || a.Tiers[2].EarnedOn != "" {
			t.Errorf("unexpected 5 km achievement %+v", a)
		}
		return
	}
	t.Errorf("no 5 km achievement in %+v", achievements)
}

func TestAchievementsAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)
	w := httptest.NewRecorder()
	h.AchievementsAPI(w, httptest.NewRequest("POST", "/api/achievements", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
