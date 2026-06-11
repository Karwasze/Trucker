package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestSkipGZCLPDay_POST(t *testing.T) {
	h, s := newTestHandlers(t)

	req := httptest.NewRequest("POST", "/gzclp/skip", nil)
	w := httptest.NewRecorder()
	h.SkipGZCLPDay(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	day, _ := s.GetGZCLPCurrentDay()
	if day != 2 {
		t.Errorf("expected day 2 after skip, got %d", day)
	}

	// Verify skipped_days incremented
	var skipped int
	s.DB().QueryRow("SELECT skipped_days FROM gzclp_settings WHERE id = 1").Scan(&skipped)
	if skipped != 1 {
		t.Errorf("expected skipped_days = 1, got %d", skipped)
	}
}

func TestSkipGZCLPDay_GET_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/gzclp/skip", nil)
	w := httptest.NewRecorder()
	h.SkipGZCLPDay(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestSkipGZCLPDay_CyclesThrough(t *testing.T) {
	h, s := newTestHandlers(t)

	// Skip 4 times, should cycle back to 1
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("POST", "/gzclp/skip", nil)
		w := httptest.NewRecorder()
		h.SkipGZCLPDay(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("skip %d failed with %d", i+1, w.Code)
		}
	}

	day, _ := s.GetGZCLPCurrentDay()
	if day != 1 {
		t.Errorf("expected day 1 after 4 skips, got %d", day)
	}
}

func TestGZCLPFormHandler(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultExercises()
	s.SeedDefaultGZCLPDayExercises()

	req := httptest.NewRequest("GET", "/gzclp", nil)
	w := httptest.NewRecorder()
	h.GZCLPForm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Squat") {
		t.Error("GZCLP form should contain exercise names")
	}
}

func TestGZCLPConfigAPI_GET(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SeedDefaultGZCLPDayExercises()

	req := httptest.NewRequest("GET", "/api/gzclp/config", nil)
	w := httptest.NewRecorder()
	h.GZCLPConfigAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var assignments []store.GZCLPDayExercise
	json.NewDecoder(w.Body).Decode(&assignments)
	if len(assignments) != 20 {
		t.Errorf("expected 20 assignments, got %d", len(assignments))
	}
}

func TestGZCLPConfigAPI_PUT(t *testing.T) {
	h, s := newTestHandlers(t)

	body := `[{"day":1,"slot":"T1","exercise_name":"Front Squat"}]`
	req := httptest.NewRequest("PUT", "/api/gzclp/config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.GZCLPConfigAPI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var name string
	s.DB().QueryRow("SELECT exercise_name FROM gzclp_day_exercises WHERE day = 1 AND slot = 'T1'").Scan(&name)
	if name != "Front Squat" {
		t.Errorf("expected Front Squat, got %q", name)
	}
}

func TestGZCLPConfigAPI_UnsupportedMethod(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/gzclp/config", nil)
	w := httptest.NewRecorder()
	h.GZCLPConfigAPI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
