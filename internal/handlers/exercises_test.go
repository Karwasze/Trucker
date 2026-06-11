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

func TestExercisesPageHandler(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/exercises", nil)
	w := httptest.NewRecorder()
	h.ExercisesPage(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

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
	if len(exercises) != 16 {
		t.Errorf("expected 16 exercises, got %d", len(exercises))
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

func TestExercisesAPI_PUT_UpdatesGZCLPReferences(t *testing.T) {
	h, s := newTestHandlers(t)

	// Insert custom exercise and assign to GZCLP
	s.DB().Exec("INSERT INTO exercise_library (name, is_default) VALUES ('Custom Lift', 0)")
	s.DB().Exec("INSERT INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (1, 'T1', 'Custom Lift')")

	var id int
	s.DB().QueryRow("SELECT id FROM exercise_library WHERE name = 'Custom Lift'").Scan(&id)

	body := fmt.Sprintf(`{"id": %d, "name": "Renamed Lift"}`, id)
	req := httptest.NewRequest("PUT", "/api/exercises", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ExercisesAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// Verify GZCLP reference updated
	var gzclpName string
	s.DB().QueryRow("SELECT exercise_name FROM gzclp_day_exercises WHERE day = 1 AND slot = 'T1'").Scan(&gzclpName)
	if gzclpName != "Renamed Lift" {
		t.Errorf("expected GZCLP reference to update to 'Renamed Lift', got %q", gzclpName)
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
