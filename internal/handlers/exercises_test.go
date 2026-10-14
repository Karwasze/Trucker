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

func TestExercisesAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	req := httptest.NewRequest("GET", "/api/exercises", nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var exercises []store.ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercises)
	if len(exercises) != 21 {
		t.Errorf("expected 18 exercises, got %d", len(exercises))
	}
}

func TestExercisesAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/exercises", nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Should return [] not null
	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Errorf("expected empty JSON array, got %s", body)
	}
}

func TestExercisesAPI_POST(t *testing.T) {
	h, _ := newTestHandlers(t)

	body := `{"name": "Hip Thrust"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var exercise store.ExerciseDB
	json.NewDecoder(w.Body).Decode(&exercise)
	if exercise.Name != "Hip Thrust" {
		t.Errorf("expected name Hip Thrust, got %s", exercise.Name)
	}
	if exercise.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if exercise.IsDefault {
		t.Error("custom exercise should not be default")
	}
}

func TestExercisesAPI_POST_EmptyName(t *testing.T) {
	h, _ := newTestHandlers(t)

	body := `{"name": ""}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty name, got %d", w.Code)
	}
}

func TestExercisesAPI_POST_Duplicate(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	body := `{"name": "Squat"}`
	req := httptest.NewRequest("POST", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected 409 for duplicate, got %d", w.Code)
	}
}

func TestExercisesAPI_PUT(t *testing.T) {
	h, s := newTestHandlers(t)

	// Insert a custom exercise
	result, _ := s.DB().Exec("INSERT INTO exercise_library (name, is_default) VALUES ('Old Name', 0)")
	id, _ := result.LastInsertId()

	body := fmt.Sprintf(`{"id": %d, "name": "New Name"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify name changed
	var name string
	s.DB().QueryRow("SELECT name FROM exercise_library WHERE id = ?", id).Scan(&name)
	if name != "New Name" {
		t.Errorf("expected 'New Name', got %q", name)
	}
}

func TestExercisesAPI_PUT_DefaultProtected(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	var id int
	s.DB().QueryRow("SELECT id FROM exercise_library WHERE name = 'Squat'").Scan(&id)

	body := fmt.Sprintf(`{"id": %d, "name": "Back Squat"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for editing default exercise, got %d", w.Code)
	}
}

func TestExercisesAPI_DELETE(t *testing.T) {
	h, s := newTestHandlers(t)

	result, _ := s.DB().Exec("INSERT INTO exercise_library (name, is_default) VALUES ('To Delete', 0)")
	id, _ := result.LastInsertId()

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", id), nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var count int
	s.DB().QueryRow("SELECT COUNT(*) FROM exercise_library WHERE id = ?", id).Scan(&count)
	if count != 0 {
		t.Error("exercise should have been deleted")
	}
}

func TestExercisesAPI_DELETE_DefaultProtected(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	var id int
	s.DB().QueryRow("SELECT id FROM exercise_library WHERE name = 'Squat'").Scan(&id)

	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/exercises?id=%d", id), nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for deleting default, got %d", w.Code)
	}
}

func TestExercisesAPI_DELETE_MissingID(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/exercises", nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestExercisesAPI_UnsupportedMethod(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("PATCH", "/api/exercises", nil)
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestExerciseMusclesAPI_PUT(t *testing.T) {
	h, s := newTestHandlers(t)

	body := `{"name":"Hip Thrust","muscles":[{"muscle":"glutes","role":"primary"},{"muscle":"hamstrings","role":"secondary"}]}`
	req := httptest.NewRequest("PUT", "/api/exercise-muscles", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.ExerciseMusclesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	muscles, _ := s.GetExerciseMuscles()
	if len(muscles["Hip Thrust"]) != 2 {
		t.Errorf("expected 2 tags saved, got %+v", muscles["Hip Thrust"])
	}
}

func TestExerciseMusclesAPI_PUT_DefaultExerciseAllowed(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()

	body := `{"name":"Squat","muscles":[{"muscle":"quads","role":"primary"}]}`
	req := httptest.NewRequest("PUT", "/api/exercise-muscles", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.ExerciseMusclesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestExerciseMusclesAPI_PUT_Invalid(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, body := range []string{
		`not json`,
		`{"muscles":[]}`,
		`{"name":"Dip","muscles":[{"muscle":"forearms","role":"primary"}]}`,
	} {
		req := httptest.NewRequest("PUT", "/api/exercise-muscles", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.ExerciseMusclesAPI(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}
}

func TestExerciseMusclesAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/exercise-muscles", nil)
	w := httptest.NewRecorder()
	h.ExerciseMusclesAPI(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestExerciseMusclesAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SetExerciseMuscles("Hip Thrust", []store.MuscleTarget{{Muscle: "glutes", Role: store.RolePrimary}})

	req := httptest.NewRequest("GET", "/api/exercise-muscles", nil)
	w := httptest.NewRecorder()
	h.ExerciseMusclesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var muscles map[string][]store.MuscleTarget
	json.NewDecoder(w.Body).Decode(&muscles)
	if len(muscles["Hip Thrust"]) != 1 {
		t.Errorf("expected Hip Thrust tags, got %+v", muscles["Hip Thrust"])
	}
	if len(muscles["Squat"]) == 0 {
		t.Error("expected default Squat tags")
	}
}
