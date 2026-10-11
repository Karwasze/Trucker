package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestBodyweightAPI_POSTAndGET(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("POST", "/api/bodyweight", strings.NewReader(`{"date":"2026-03-10","weight":82.5}`))
	w := httptest.NewRecorder()
	h.BodyweightAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	req = httptest.NewRequest("GET", "/api/bodyweight", nil)
	w = httptest.NewRecorder()
	h.BodyweightAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var entries []store.BodyweightEntry
	json.NewDecoder(w.Body).Decode(&entries)
	if len(entries) != 1 || entries[0].Date != "2026-03-10" || entries[0].Weight != 82.5 {
		t.Errorf("unexpected entries %+v", entries)
	}
}

func TestBodyweightAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/bodyweight", nil)
	w := httptest.NewRecorder()
	h.BodyweightAPI(w, req)

	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected empty JSON array, got %s", body)
	}
}

func TestBodyweightAPI_POST_Invalid(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, body := range []string{
		`not json`,
		`{"date":"2026-03-10","weight":0}`,
		`{"date":"2026-03-10","weight":-80}`,
		`{"date":"10/03/2026","weight":80}`,
		`{"weight":80}`,
	} {
		req := httptest.NewRequest("POST", "/api/bodyweight", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.BodyweightAPI(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}
}

func TestBodyweightAPI_DELETE(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SaveBodyweight("2026-03-10", 82)

	req := httptest.NewRequest("DELETE", "/api/bodyweight?date=2026-03-10", nil)
	w := httptest.NewRecorder()
	h.BodyweightAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	entries, _ := s.ListBodyweight()
	if len(entries) != 0 {
		t.Errorf("expected entry deleted, got %+v", entries)
	}
}

func TestBodyweightAPI_DELETE_MissingDate(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("DELETE", "/api/bodyweight", nil)
	w := httptest.NewRecorder()
	h.BodyweightAPI(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestBodyweightAPI_MethodNotAllowed(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("PATCH", "/api/bodyweight", nil)
	w := httptest.NewRecorder()
	h.BodyweightAPI(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}
