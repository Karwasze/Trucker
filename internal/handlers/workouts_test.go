package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestNewWorkoutFormHandler(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	req := httptest.NewRequest("GET", "/workout/new", nil)
	w := httptest.NewRecorder()
	h.NewWorkoutForm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Squat") {
		t.Error("workout form should contain exercise names")
	}
}

func TestCreateWorkout_POST(t *testing.T) {
	h, s := newTestHandlers(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	form.Set("reps_0_1", "5")
	form.Set("weight_0_1", "105")
	form.Set("exercise_1", "Bench Press")
	form.Set("reps_1_0", "8")
	form.Set("weight_1_0", "80")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	// Verify workout was saved
	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if workouts[0].Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", workouts[0].Date)
	}
}

func TestCreateWorkout_GET_Redirects(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/workout/create", nil)
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect for GET, got %d", w.Code)
	}
}

func TestCreateWorkout_GZCLP_AdvancesDay(t *testing.T) {
	h, s := newTestHandlers(t)

	// Current day is 1
	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "gzclp")
	form.Set("workout_day", "1")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303, got %d", w.Code)
	}

	// Day should have advanced to 2
	day, _ := s.GetGZCLPCurrentDay()
	if day != 2 {
		t.Errorf("expected GZCLP day to advance to 2, got %d", day)
	}
}

func TestCreateWorkout_GZCLP_Day4WrapsTo1(t *testing.T) {
	h, s := newTestHandlers(t)
	s.DB().Exec("UPDATE gzclp_settings SET current_day = 4 WHERE id = 1")

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "gzclp")
	form.Set("workout_day", "4")
	form.Set("exercise_0", "Deadlift")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "140")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	day, _ := s.GetGZCLPCurrentDay()
	if day != 1 {
		t.Errorf("expected GZCLP day to wrap to 1, got %d", day)
	}
}

func TestCreateWorkout_SkipsEmptySets(t *testing.T) {
	h, s := newTestHandlers(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	// Set 0: filled
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	// Set 1: empty (both fields present but empty)
	form.Set("reps_0_1", "")
	form.Set("weight_0_1", "")
	// Set 2: filled
	form.Set("reps_0_2", "3")
	form.Set("weight_0_2", "110")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}

	var squat *store.Exercise
	for i := range workouts[0].Exercises {
		if workouts[0].Exercises[i].Name == "Squat" {
			squat = &workouts[0].Exercises[i]
		}
	}
	if squat == nil {
		t.Fatal("expected Squat exercise")
	}
	if len(squat.Sets) != 2 {
		t.Errorf("expected 2 sets (empty one skipped), got %d", len(squat.Sets))
	}
	if squat.Sets[0].Weight != 100 || squat.Sets[0].Reps != 5 {
		t.Errorf("unexpected first set: %+v", squat.Sets[0])
	}
	if squat.Sets[1].Weight != 110 || squat.Sets[1].Reps != 3 {
		t.Errorf("unexpected second set: %+v", squat.Sets[1])
	}
}

func TestCreateWorkout_SkipsExerciseWithAllEmptySets(t *testing.T) {
	h, s := newTestHandlers(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	// Exercise 0: has filled sets
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")
	// Exercise 1: all sets empty
	form.Set("exercise_1", "Bench Press")
	form.Set("reps_1_0", "")
	form.Set("weight_1_0", "")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Errorf("expected 303 redirect, got %d", w.Code)
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	if len(workouts[0].Exercises) != 1 {
		t.Errorf("expected 1 exercise (empty one skipped), got %d", len(workouts[0].Exercises))
	}
	if workouts[0].Exercises[0].Name != "Squat" {
		t.Errorf("expected Squat, got %s", workouts[0].Exercises[0].Name)
	}
}

func TestCreateWorkout_InvalidReps(t *testing.T) {
	h, _ := newTestHandlers(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "abc")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid reps, got %d", w.Code)
	}
}

func TestCreateWorkout_InvalidWeight(t *testing.T) {
	h, _ := newTestHandlers(t)

	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "notanumber")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid weight, got %d", w.Code)
	}
}

func TestListWorkoutsHandler(t *testing.T) {
	h, s := newTestHandlers(t)
	seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
	})

	req := httptest.NewRequest("GET", "/workouts", nil)
	w := httptest.NewRecorder()
	h.ListWorkouts(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "2026-03-15") {
		t.Error("workouts list should contain the workout date")
	}
	if !strings.Contains(body, "Squat") {
		t.Error("workouts list should contain exercise name")
	}
}

func TestListWorkoutsHandler_Empty(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/workouts", nil)
	w := httptest.NewRecorder()
	h.ListWorkouts(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "No workouts logged yet") {
		t.Error("should show empty state message")
	}
}

func TestDeleteWorkout_POST(t *testing.T) {
	h, s := newTestHandlers(t)
	id := seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 100, Reps: 5}}},
	})

	form := url.Values{}
	form.Set("id", fmt.Sprintf("%d", id))

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.DeleteWorkout(w, req)

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

func TestDeleteWorkout_GET_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/workout/delete", nil)
	w := httptest.NewRecorder()
	h.DeleteWorkout(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestDeleteWorkout_MissingID(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.DeleteWorkout(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestDeleteWorkout_NotFound(t *testing.T) {
	h, _ := newTestHandlers(t)

	form := url.Values{}
	form.Set("id", "999")

	req := httptest.NewRequest("POST", "/workout/delete", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.DeleteWorkout(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestLatestExerciseAPI(t *testing.T) {
	h, s := newTestHandlers(t)

	// Seed two workouts for the same exercise on different dates
	seedWorkout(t, s, "2026-03-10", "custom", 0, []store.Exercise{
		{Name: "Squat", Sets: []store.Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
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
