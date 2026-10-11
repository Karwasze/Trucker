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

func TestE2E_CreateAndDeleteWorkout(t *testing.T) {
	h, s := newTestHandlers(t)

	// Create a workout
	w := postWorkout(t, h, `{"date": "2026-03-15",
		"exercises": [{"name": "Squat", "sets": [{"reps": 5, "weight": 100}]}]}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("create failed: %d", w.Code)
	}
	var created store.Workout
	json.NewDecoder(w.Body).Decode(&created)

	// List it
	req := httptest.NewRequest("GET", "/api/workouts", nil)
	w = httptest.NewRecorder()
	h.WorkoutsAPI(w, req)
	var workouts []store.Workout
	json.NewDecoder(w.Body).Decode(&workouts)
	if len(workouts) != 1 || workouts[0].ID != created.ID {
		t.Fatalf("expected the created workout in the list, got %+v", workouts)
	}

	// Delete it
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/workouts?id=%d", created.ID), nil)
	w = httptest.NewRecorder()
	h.WorkoutsAPI(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete failed: %d", w.Code)
	}

	// Verify empty
	workouts, _ = s.GetWorkouts()
	if len(workouts) != 0 {
		t.Errorf("expected 0 workouts, got %d", len(workouts))
	}
}

func TestE2E_ExerciseCRUD(t *testing.T) {
	h, _ := newTestHandlers(t)

	// Create
	body := `{"name": "Hip Thrust"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("create failed: %d", w.Code)
	}
	var created store.ExerciseDB
	json.NewDecoder(w.Body).Decode(&created)

	// Read
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	var exercises []store.ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercises)
	if len(exercises) != 1 {
		t.Fatalf("expected 1 exercise, got %d", len(exercises))
	}
	if exercises[0].Name != "Hip Thrust" {
		t.Errorf("expected Hip Thrust, got %s", exercises[0].Name)
	}

	// Update
	body = fmt.Sprintf(`{"id": %d, "name": "Barbell Hip Thrust"}`, created.ID)
	req = httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("update failed: %d", w.Code)
	}

	// Verify update
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	json.NewDecoder(w.Body).Decode(&exercises)
	if exercises[0].Name != "Barbell Hip Thrust" {
		t.Errorf("expected updated name, got %s", exercises[0].Name)
	}

	// Delete
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", created.ID), nil)
	w = httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("delete failed: %d", w.Code)
	}

	// Verify deleted
	req = httptest.NewRequest("GET", "/api/exercises", nil)
	w = httptest.NewRecorder()
	h.ExercisesAPI(w, req)
	body2 := strings.TrimSpace(w.Body.String())
	if body2 != "[]" {
		t.Errorf("expected empty array after delete, got %s", body2)
	}
}

func TestE2E_LatestExerciseAfterMultipleWorkouts(t *testing.T) {
	h, s := newTestHandlers(t)

	// Seed older workout
	seedWorkout(t, s, "2026-03-01", []store.Exercise{
		{Name: "Bench Press", Sets: []store.Set{{Weight: 60, Reps: 10}}},
	})
	// Seed newer workout
	seedWorkout(t, s, "2026-03-15", []store.Exercise{
		{Name: "Bench Press", Sets: []store.Set{{Weight: 80, Reps: 5}, {Weight: 85, Reps: 3}}},
	})

	req := httptest.NewRequest("GET", "/api/latest-exercise?name=Bench+Press", nil)
	w := httptest.NewRecorder()
	h.LatestExercise(w, req)

	var result struct {
		Sets []store.Set `json:"sets"`
	}
	json.NewDecoder(w.Body).Decode(&result)

	if len(result.Sets) != 2 {
		t.Fatalf("expected 2 sets from latest workout, got %d", len(result.Sets))
	}
	if result.Sets[0].Weight != 80 {
		t.Errorf("expected first set weight 80, got %.1f", result.Sets[0].Weight)
	}
	if result.Sets[1].Weight != 85 {
		t.Errorf("expected second set weight 85, got %.1f", result.Sets[1].Weight)
	}
}
