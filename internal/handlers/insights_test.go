package handlers

import (
	"encoding/json"
	"fmt"
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
	if insights.Adherence != nil {
		t.Errorf("expected no adherence without a plan, got %+v", insights.Adherence)
	}
}

func TestInsightsAPI_TimespanAndPlan(t *testing.T) {
	h, s := newTestHandlers(t)
	plan, err := s.CreatePlan(store.TrainingPlan{Name: "5x5", Days: []store.PlanDay{
		{Weekday: "monday", Exercises: []store.PlanExercise{{Name: "Squat", Sets: 3, Reps: 5}}},
	}})
	if err != nil {
		t.Fatalf("failed to create plan: %v", err)
	}
	for _, date := range []string{"2026-03-16", "2026-03-23", "2026-03-30"} {
		if _, err := s.SaveWorkout(store.Workout{Date: date, PlanID: &plan.ID, Exercises: []store.Exercise{
			{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
		}}); err != nil {
			t.Fatalf("failed to seed workout: %v", err)
		}
	}

	req := httptest.NewRequest("GET", fmt.Sprintf("/api/insights?date=2026-03-31&from=2026-03-20&plan_id=%d", plan.ID), nil)
	w := httptest.NewRecorder()
	h.InsightsAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var insights store.Insights
	if err := json.NewDecoder(w.Body).Decode(&insights); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if insights.From != "2026-03-20" {
		t.Errorf("expected from 2026-03-20, got %q", insights.From)
	}
	if a := insights.Adherence; a == nil || a.Plan != "5x5" || a.Scheduled != 2 || a.Completed != 2 {
		t.Errorf("expected 2 of 2 5x5 sessions since Mar 20, got %+v", a)
	}
	if insights.Tonnage.Total != 1000 {
		t.Errorf("expected 1000 kg since Mar 20, got %v", insights.Tonnage.Total)
	}
}

func TestInsightsAPI_InvalidDate(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, url := range []string{
		"/api/insights",
		"/api/insights?date=yesterday",
		"/api/insights?date=2026-03-31&from=March",
		"/api/insights?date=2026-03-31&plan_id=abc",
		"/api/insights?date=2026-03-31&plan_id=-1",
	} {
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
