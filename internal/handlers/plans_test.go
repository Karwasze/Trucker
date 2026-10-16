package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"trucker/internal/store"
)

const samplePlanJSON = `{
	"name": "5x5",
	"days": [
		{"weekday": "friday", "exercises": [
			{"name": "Squat", "sets": 1, "reps": 3}
		]},
		{"weekday": "Monday", "exercises": [
			{"name": "Squat", "sets": 2, "reps": 5},
			{"name": "Bench Press", "sets": 1, "reps": 5}
		]}
	]
}`

func plansRequest(t *testing.T, h *Handlers, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.PlansAPI(w, req)
	return w
}

func createTestPlan(t *testing.T, h *Handlers) store.TrainingPlan {
	t.Helper()
	w := plansRequest(t, h, "POST", "/api/plans", samplePlanJSON)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating plan, got %d: %s", w.Code, w.Body.String())
	}
	var plan store.TrainingPlan
	if err := json.NewDecoder(w.Body).Decode(&plan); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	return plan
}

func TestPlansAPI_POST(t *testing.T) {
	h, s := newTestHandlers(t)

	plan := createTestPlan(t, h)
	if plan.ID == 0 {
		t.Error("expected created plan to have an ID")
	}
	if len(plan.Days) != 2 || plan.Days[0].Weekday != "monday" || plan.Days[1].Weekday != "friday" {
		t.Errorf("expected days normalised and ordered monday, friday; got %+v", plan.Days)
	}
	if squat := plan.Days[0].Exercises[0]; squat != (store.PlanExercise{Name: "Squat", Sets: 2, Reps: 5}) {
		t.Errorf("unexpected squat: %+v", squat)
	}

	if _, err := s.GetPlan(plan.ID); err != nil {
		t.Errorf("expected plan to be stored: %v", err)
	}
}

func TestPlansAPI_POST_Validation(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"invalid JSON", `{"name": `},
		{"missing name", `{"name": "  ", "days": []}`},
		{"invalid weekday", `{"name": "P", "days": [{"weekday": "funday", "exercises": []}]}`},
		{"duplicate weekday", `{"name": "P", "days": [{"weekday": "monday", "exercises": []}, {"weekday": "MONDAY", "exercises": []}]}`},
		{"missing exercise name", `{"name": "P", "days": [{"weekday": "monday", "exercises": [{"name": "", "sets": 3, "reps": 5}]}]}`},
		{"no sets", `{"name": "P", "days": [{"weekday": "monday", "exercises": [{"name": "Squat", "sets": 0, "reps": 5}]}]}`},
		{"zero reps", `{"name": "P", "days": [{"weekday": "monday", "exercises": [{"name": "Squat", "sets": 3, "reps": 0}]}]}`},
		{"negative sets", `{"name": "P", "days": [{"weekday": "monday", "exercises": [{"name": "Squat", "sets": -1, "reps": 5}]}]}`},
		{"sets as a list", `{"name": "P", "days": [{"weekday": "monday", "exercises": [{"name": "Squat", "sets": [{"reps": 5, "weight": 50}]}]}]}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, s := newTestHandlers(t)

			w := plansRequest(t, h, "POST", "/api/plans", tt.body)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
			}

			plans, _ := s.GetPlans()
			if len(plans) != 0 {
				t.Errorf("expected nothing saved, got %d plans", len(plans))
			}
		})
	}
}

func TestPlansAPI_POST_DuplicateName(t *testing.T) {
	h, _ := newTestHandlers(t)
	createTestPlan(t, h)

	w := plansRequest(t, h, "POST", "/api/plans", samplePlanJSON)
	if w.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", w.Code)
	}
}

func TestPlansAPI_GET_List(t *testing.T) {
	h, _ := newTestHandlers(t)

	w := plansRequest(t, h, "GET", "/api/plans", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected empty array, got %s", body)
	}

	createTestPlan(t, h)

	w = plansRequest(t, h, "GET", "/api/plans", "")
	var plans []store.TrainingPlan
	if err := json.NewDecoder(w.Body).Decode(&plans); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(plans) != 1 || plans[0].Name != "5x5" || len(plans[0].Days) != 2 {
		t.Errorf("unexpected plans: %+v", plans)
	}
}

func TestPlansAPI_GET_One(t *testing.T) {
	h, _ := newTestHandlers(t)
	created := createTestPlan(t, h)

	w := plansRequest(t, h, "GET", fmt.Sprintf("/api/plans?id=%d", created.ID), "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var plan store.TrainingPlan
	json.NewDecoder(w.Body).Decode(&plan)
	if plan.ID != created.ID || plan.Name != "5x5" {
		t.Errorf("unexpected plan: %+v", plan)
	}

	if w := plansRequest(t, h, "GET", "/api/plans?id=999", ""); w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing plan, got %d", w.Code)
	}
	if w := plansRequest(t, h, "GET", "/api/plans?id=abc", ""); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid id, got %d", w.Code)
	}
}

func TestPlansAPI_PUT(t *testing.T) {
	h, s := newTestHandlers(t)
	created := createTestPlan(t, h)

	body := fmt.Sprintf(`{"id": %d, "name": "Renamed", "days": [
		{"weekday": "tuesday", "exercises": [{"name": "Overhead Press", "sets": 3, "reps": 8}]}
	]}`, created.ID)
	w := plansRequest(t, h, "PUT", "/api/plans", body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	plan, _ := s.GetPlan(created.ID)
	if plan.Name != "Renamed" || len(plan.Days) != 1 || plan.Days[0].Weekday != "tuesday" {
		t.Errorf("expected plan replaced, got %+v", plan)
	}
}

func TestPlansAPI_PUT_Errors(t *testing.T) {
	h, _ := newTestHandlers(t)
	created := createTestPlan(t, h)
	other := plansRequest(t, h, "POST", "/api/plans", `{"name": "Other", "days": []}`)
	if other.Code != http.StatusCreated {
		t.Fatalf("failed to create second plan: %d", other.Code)
	}

	tests := []struct {
		name string
		body string
		want int
	}{
		{"missing id", `{"name": "X", "days": []}`, http.StatusBadRequest},
		{"not found", `{"id": 999, "name": "X", "days": []}`, http.StatusNotFound},
		{"invalid", fmt.Sprintf(`{"id": %d, "name": "", "days": []}`, created.ID), http.StatusBadRequest},
		{"duplicate name", fmt.Sprintf(`{"id": %d, "name": "Other", "days": []}`, created.ID), http.StatusConflict},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := plansRequest(t, h, "PUT", "/api/plans", tt.body); w.Code != tt.want {
				t.Errorf("expected %d, got %d", tt.want, w.Code)
			}
		})
	}
}

func TestPlansAPI_DELETE(t *testing.T) {
	h, s := newTestHandlers(t)
	created := createTestPlan(t, h)

	w := plansRequest(t, h, "DELETE", fmt.Sprintf("/api/plans?id=%d", created.ID), "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	plans, _ := s.GetPlans()
	if len(plans) != 0 {
		t.Errorf("expected plan deleted, got %d plans", len(plans))
	}

	if w := plansRequest(t, h, "DELETE", "/api/plans?id=999", ""); w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
	if w := plansRequest(t, h, "DELETE", "/api/plans", ""); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing id, got %d", w.Code)
	}
}

func TestPlansAPI_UnsupportedMethod(t *testing.T) {
	h, _ := newTestHandlers(t)

	if w := plansRequest(t, h, "PATCH", "/api/plans", ""); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func todayRequest(h *Handlers, method, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	w := httptest.NewRecorder()
	h.PlanTodayAPI(w, req)
	return w
}

func TestPlanTodayAPI(t *testing.T) {
	h, s := newTestHandlers(t)
	created := createTestPlan(t, h)
	seedWorkout(t, s, "2026-10-09", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}},
	})

	type todayResponse struct {
		PlanID    int                    `json:"plan_id"`
		Date      string                 `json:"date"`
		Weekday   string                 `json:"weekday"`
		Exercises []store.ExerciseTarget `json:"exercises"`
	}

	w := todayRequest(h, "GET", fmt.Sprintf("/api/plans/today?id=%d&date=2026-10-12", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var monday todayResponse
	json.NewDecoder(w.Body).Decode(&monday)
	if monday.PlanID != created.ID || monday.Date != "2026-10-12" || monday.Weekday != "monday" || len(monday.Exercises) != 2 {
		t.Errorf("unexpected monday response: %+v", monday)
	}
	want := []store.ExerciseTarget{
		{Name: "Squat", Sets: []store.Set{{Reps: 5, Weight: 102.5}, {Reps: 5, Weight: 102.5}},
			Reason: "Weight up 2.5 kg: you completed 2 × 5 @ 100 kg last time."},
		{Name: "Bench Press", Sets: []store.Set{{Reps: 5, Weight: 0}}, Reason: "No history yet: pick a starting weight."},
	}
	if !reflect.DeepEqual(monday.Exercises, want) {
		t.Errorf("expected targets %+v, got %+v", want, monday.Exercises)
	}

	w = todayRequest(h, "GET", fmt.Sprintf("/api/plans/today?id=%d&date=2026-10-13", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on rest day, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"exercises":[]`) {
		t.Errorf("expected empty exercises array on rest day, got %s", w.Body.String())
	}
}

// The plan trains Squat as 2 × 5 on Monday and 1 × 3 on Friday: Monday's
// target follows the last Monday, not the heavy single on Friday in between.
func TestPlanTodayAPI_SchemePerDay(t *testing.T) {
	h, s := newTestHandlers(t)
	created := createTestPlan(t, h)
	seedWorkout(t, s, "2026-10-12", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}},
	})
	seedWorkout(t, s, "2026-10-16", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Reps: 3, Weight: 120}}},
	})

	w := todayRequest(h, "GET", fmt.Sprintf("/api/plans/today?id=%d&date=2026-10-19", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var monday struct {
		Exercises []store.ExerciseTarget `json:"exercises"`
	}
	json.NewDecoder(w.Body).Decode(&monday)
	want := store.ExerciseTarget{Name: "Squat", Sets: []store.Set{{Reps: 5, Weight: 102.5}, {Reps: 5, Weight: 102.5}},
		Reason: "Weight up 2.5 kg: you completed 2 × 5 @ 100 kg last time."}
	if len(monday.Exercises) == 0 || !reflect.DeepEqual(monday.Exercises[0], want) {
		t.Errorf("expected squat target %+v, got %+v", want, monday.Exercises)
	}
}

// After the plan's workout for the day is logged, the day returns it, so
// the app doesn't offer the same workout again (e.g. after losing its draft).
func TestPlanTodayAPI_LoggedWorkout(t *testing.T) {
	h, s := newTestHandlers(t)
	created := createTestPlan(t, h)
	target := fmt.Sprintf("/api/plans/today?id=%d&date=2026-10-12", created.ID)

	var before map[string]json.RawMessage
	json.NewDecoder(todayRequest(h, "GET", target).Body).Decode(&before)
	if _, ok := before["workout"]; ok {
		t.Errorf("expected no workout before logging, got %s", before["workout"])
	}

	planID := created.ID
	id, err := s.SaveWorkout(store.Workout{Date: "2026-10-12", PlanID: &planID, Exercises: []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Reps: 5, Weight: 100}}},
	}})
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	w := todayRequest(h, "GET", target)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var after struct {
		Exercises []store.ExerciseTarget `json:"exercises"`
		Workout   *store.Workout         `json:"workout"`
	}
	json.NewDecoder(w.Body).Decode(&after)
	if after.Workout == nil || after.Workout.ID != id || len(after.Workout.Exercises) != 1 {
		t.Errorf("expected logged workout %d, got %+v", id, after.Workout)
	}
	if len(after.Exercises) != 2 {
		t.Errorf("expected the plan's targets alongside the workout, got %+v", after.Exercises)
	}
}

func TestPlanTodayAPI_DefaultsToToday(t *testing.T) {
	h, _ := newTestHandlers(t)
	created := createTestPlan(t, h)

	w := todayRequest(h, "GET", fmt.Sprintf("/api/plans/today?id=%d", created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp struct {
		Date string `json:"date"`
	}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Date == "" {
		t.Error("expected date to default to today")
	}
}

func TestPlanTodayAPI_Errors(t *testing.T) {
	h, _ := newTestHandlers(t)
	created := createTestPlan(t, h)

	tests := []struct {
		name   string
		method string
		target string
		want   int
	}{
		{"missing id", "GET", "/api/plans/today", http.StatusBadRequest},
		{"invalid date", "GET", fmt.Sprintf("/api/plans/today?id=%d&date=12-10-2026", created.ID), http.StatusBadRequest},
		{"not found", "GET", "/api/plans/today?id=999", http.StatusNotFound},
		{"wrong method", "POST", fmt.Sprintf("/api/plans/today?id=%d", created.ID), http.StatusMethodNotAllowed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := todayRequest(h, tt.method, tt.target); w.Code != tt.want {
				t.Errorf("expected %d, got %d", tt.want, w.Code)
			}
		})
	}
}
