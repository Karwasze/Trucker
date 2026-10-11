package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"trucker/internal/store"
)

func TestInsightsAPI(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SaveBodyweight("2026-03-30", 80)
	seedWorkout(t, s, "2026-03-25", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 120, Reps: 1}}},
	})

	req := httptest.NewRequest("GET", "/api/insights?date=2026-03-31", nil)
	w := httptest.NewRecorder()
	h.InsightsAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var insights store.Insights
	if err := json.NewDecoder(w.Body).Decode(&insights); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if insights.Date != "2026-03-31" {
		t.Errorf("expected date 2026-03-31, got %s", insights.Date)
	}
	if len(insights.Muscles) != len(store.Muscles) {
		t.Errorf("expected %d muscles, got %d", len(store.Muscles), len(insights.Muscles))
	}
	if len(insights.Strength) != 1 || insights.Strength[0].Exercise != "Squat" {
		t.Errorf("expected squat strength level, got %+v", insights.Strength)
	}
	if len(insights.Recommendations) == 0 {
		t.Error("expected recommendations")
	}
}

func TestInsightsAPI_InvalidDate(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, url := range []string{"/api/insights", "/api/insights?date=yesterday"} {
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		h.InsightsAPI(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", url, w.Code)
		}
	}
}

func TestInsightsAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("POST", "/api/insights?date=2026-03-31", nil)
	w := httptest.NewRecorder()
	h.InsightsAPI(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
