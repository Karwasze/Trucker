package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func postWorkout(t *testing.T, h *Handlers, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/workouts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)
	return w
}

func TestWorkoutsAPI_POST(t *testing.T) {
	h, s := newTestHandlers(t)

	w := postWorkout(t, h, `{
		"date": "2026-03-15",
		"exercises": [
			{"name": "Squat", "sets": [{"reps": 5, "weight": 100}, {"reps": 5, "weight": 105}]},
			{"name": "Bench Press", "sets": [{"reps": 8, "weight": 80}]}
		]
	}`)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json content type, got %q", ct)
	}

	var created store.Workout
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if created.ID == 0 {
		t.Error("expected created workout to have an ID")
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if workouts[0].ID != created.ID {
		t.Errorf("expected stored ID %d, got %d", created.ID, workouts[0].ID)
	}
	if workouts[0].Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", workouts[0].Date)
	}
	if len(workouts[0].Exercises) != 2 {
		t.Errorf("expected 2 exercises, got %d", len(workouts[0].Exercises))
	}
}

func TestWorkoutsAPI_POST_SkipsExercisesWithoutSets(t *testing.T) {
	h, s := newTestHandlers(t)

	w := postWorkout(t, h, `{"date": "2026-03-15", "exercises": [
		{"name": "Squat", "sets": [{"reps": 5, "weight": 100}]},
		{"name": "Bench Press", "sets": []},
		{"name": "", "sets": [{"reps": 5, "weight": 60}]}
	]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts[0].Exercises) != 1 {
		t.Fatalf("expected 1 exercise (empty ones skipped), got %d", len(workouts[0].Exercises))
	}
	if workouts[0].Exercises[0].Name != "Squat" {
		t.Errorf("expected Squat, got %s", workouts[0].Exercises[0].Name)
	}
}

func TestWorkoutsAPI_POST_InvalidJSON(t *testing.T) {
	h, _ := newTestHandlers(t)

	w := postWorkout(t, h, `{"date": "2026-03-15", "exercises": [{"name": "Squat", "sets": [{"reps": "abc", "weight": 100}]}]}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid reps, got %d", w.Code)
	}
}

func TestWorkoutsAPI_POST_InvalidDate(t *testing.T) {
	h, s := newTestHandlers(t)

	for _, date := range []string{"", "15/03/2026"} {
		w := postWorkout(t, h, fmt.Sprintf(`{"date": %q, "exercises": []}`, date))
		if w.Code != http.StatusBadRequest {
			t.Errorf("date %q: expected 400, got %d", date, w.Code)
		}
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 0 {
		t.Errorf("expected no workouts saved, got %d", len(workouts))
	}
}

func TestWorkoutsAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	seedWorkout(t, s, "2026-03-15", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
	})

	req := httptest.NewRequest("GET", "/api/workouts", nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var workouts []store.Workout
	if err := json.NewDecoder(w.Body).Decode(&workouts); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if workouts[0].Date != "2026-03-15" || workouts[0].Exercises[0].Name != "Squat" {
		t.Errorf("unexpected workout: %+v", workouts[0])
	}
}

func TestWorkoutsAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/workouts", nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected empty array, got %s", body)
	}
}

func TestWorkoutsAPI_DELETE(t *testing.T) {
	h, s := newTestHandlers(t)
	id := seedWorkout(t, s, "2026-03-15", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
	})

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/workouts?id=%d", id), nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify workout is gone
	workouts, _ := s.GetWorkouts()
	if len(workouts) != 0 {
		t.Errorf("expected 0 workouts after delete, got %d", len(workouts))
	}

	// Verify cascaded deletes
	var exerciseCount, setCount int
	s.DB().QueryRow("SELECT COUNT(*) FROM exercises").Scan(&exerciseCount)
	s.DB().QueryRow("SELECT COUNT(*) FROM sets").Scan(&setCount)
	if exerciseCount != 0 {
		t.Errorf("expected 0 exercises after cascade delete, got %d", exerciseCount)
	}
	if setCount != 0 {
		t.Errorf("expected 0 sets after cascade delete, got %d", setCount)
	}
}

func TestWorkoutsAPI_DELETE_MissingID(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/workouts", nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestWorkoutsAPI_DELETE_NotFound(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/workouts?id=999", nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestWorkoutsAPI_UnsupportedMethod(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("PATCH", "/api/workouts", nil)
	w := httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestLatestExerciseAPI(t *testing.T) {
	h, s := newTestHandlers(t)

	// Seed two workouts for the same exercise on different dates
	seedWorkout(t, s, "2026-03-10", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, s, "2026-03-15", []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}, {Weight: 105, Reps: 3}}},
	})

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Squat", nil)
	w := httptest.NewRecorder()
	h.LatestExercise(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var result struct {
		Sets []store.Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)
	if len(result.Sets) != 2 {
		t.Fatalf("expected 2 sets from latest workout, got %d", len(result.Sets))
	}
	if result.Sets[0].Weight != 100 {
		t.Errorf("expected weight 100, got %.1f", result.Sets[0].Weight)
	}
}

func TestLatestExerciseAPI_MissingName(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/latest-exercise", nil)
	w := httptest.NewRecorder()
	h.LatestExercise(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestLatestExerciseAPI_NoData(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Squat", nil)
	w := httptest.NewRecorder()
	h.LatestExercise(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var result struct {
		Sets []store.Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)
	if len(result.Sets) != 0 {
		t.Errorf("expected 0 sets, got %d", len(result.Sets))
	}
}

func TestWorkoutsAPI_POST_WithPlanAppliesProgression(t *testing.T) {
	h, s := newTestHandlers(t)
	plan := createTestPlan(t, h)

	// 2026-10-12 is a Monday: squat hits its targets, bench misses.
	w := postWorkout(t, h, fmt.Sprintf(`{"date": "2026-10-12", "plan_id": %d, "exercises": [
		{"name": "Squat", "sets": [{"reps": 5, "weight": 100}, {"reps": 5, "weight": 100}]},
		{"name": "Bench Press", "sets": [{"reps": 4, "weight": 80}]}
	]}`, plan.ID))
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		ID          int                       `json:"id"`
		PlanID      *int                      `json:"plan_id"`
		Progression []store.ProgressionResult `json:"progression"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.ID == 0 || resp.PlanID == nil || *resp.PlanID != plan.ID {
		t.Errorf("expected workout linked to plan %d, got %+v", plan.ID, resp)
	}
	want := []store.ProgressionResult{
		{Exercise: "Squat", Result: store.ResultProgressed},
		{Exercise: "Bench Press", Result: store.ResultMissed},
	}
	if fmt.Sprint(resp.Progression) != fmt.Sprint(want) {
		t.Errorf("expected progression %+v, got %+v", want, resp.Progression)
	}

	updated, _ := s.GetPlan(plan.ID)
	mon := updated.Days[0].Exercises
	if mon[0].Sets[0].Weight != 102.5 || mon[0].Sets[1].Weight != 102.5 {
		t.Errorf("expected squat targets raised to 102.5, got %+v", mon[0].Sets)
	}
	if mon[1].ConsecutiveMisses != 1 || mon[1].Sets[0].Reps != 5 {
		t.Errorf("expected bench unchanged with 1 miss, got %+v", mon[1])
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 || workouts[0].PlanID == nil || *workouts[0].PlanID != plan.ID {
		t.Errorf("expected stored workout linked to plan, got %+v", workouts)
	}
}

func TestWorkoutsAPI_POST_UnknownPlan(t *testing.T) {
	h, s := newTestHandlers(t)

	w := postWorkout(t, h, `{"date": "2026-10-12", "plan_id": 999, "exercises": [{"name": "Squat", "sets": [{"reps": 5, "weight": 100}]}]}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 0 {
		t.Errorf("expected nothing saved, got %d workouts", len(workouts))
	}
}

func TestWorkoutsAPI_POST_WithoutPlanHasNoProgression(t *testing.T) {
	h, _ := newTestHandlers(t)

	w := postWorkout(t, h, `{"date": "2026-10-12", "exercises": [{"name": "Squat", "sets": [{"reps": 5, "weight": 100}]}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
	body := w.Body.String()
	if strings.Contains(body, "progression") || strings.Contains(body, "plan_id") {
		t.Errorf("expected no plan fields in response, got %s", body)
	}
}
