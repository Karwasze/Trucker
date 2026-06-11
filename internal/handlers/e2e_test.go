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

func TestE2E_CreateAndDeleteWorkout(t *testing.T) {
	h, s := newTestHandlers(t)

	// Create a workout
	form := url.Values{}
	form.Set("date", "2026-03-15")
	form.Set("workout_type", "custom")
	form.Set("exercise_0", "Squat")
	form.Set("reps_0_0", "5")
	form.Set("weight_0_0", "100")

	req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.CreateWorkout(w, req)

	if w.Code != http.StatusSeeOther {
		t.Fatalf("create failed: %d", w.Code)
	}

	// Get the workout ID
	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}
	id := workouts[0].ID

	// Delete it
	delForm := url.Values{}
	delForm.Set("id", fmt.Sprintf("%d", id))
	req = httptest.NewRequest("POST", "/workout/delete", strings.NewReader(delForm.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w = httptest.NewRecorder()
	h.DeleteWorkout(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete failed: %d", w.Code)
	}

	// Verify empty
	workouts, _ = s.GetWorkouts()
	if len(workouts) != 0 {
		t.Errorf("expected 0 workouts, got %d", len(workouts))
	}
}

func TestE2E_GZCLPFullDayCycle(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()
	s.SeedDefaultGZCLPDayExercises()

	for expectedDay := 1; expectedDay <= 4; expectedDay++ {
		day, _ := s.GetGZCLPCurrentDay()
		if day != expectedDay {
			t.Fatalf("before workout %d: expected day %d, got %d", expectedDay, expectedDay, day)
		}

		// Log a GZCLP workout
		form := url.Values{}
		form.Set("date", fmt.Sprintf("2026-03-%02d", 10+expectedDay))
		form.Set("workout_type", "gzclp")
		form.Set("workout_day", fmt.Sprintf("%d", expectedDay))
		form.Set("exercise_0", "Squat")
		form.Set("reps_0_0", "5")
		form.Set("weight_0_0", "100")

		req := httptest.NewRequest("POST", "/workout/create", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		h.CreateWorkout(w, req)

		if w.Code != http.StatusSeeOther {
			t.Fatalf("workout %d create failed: %d", expectedDay, w.Code)
		}
	}

	// After 4 workouts, should be back to day 1
	day, _ := s.GetGZCLPCurrentDay()
	if day != 1 {
		t.Errorf("expected day 1 after full cycle, got %d", day)
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
	seedWorkout(t, s, "2026-03-01", "custom", 0, []store.Exercise{
		{Name: "Bench Press", Sets: []store.Set{{Weight: 60, Reps: 10}}},
	})
	// Seed newer workout
	seedWorkout(t, s, "2026-03-15", "custom", 0, []store.Exercise{
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
