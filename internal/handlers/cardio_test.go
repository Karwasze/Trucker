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

const cardioRunJSON = `{"date":"2026-10-10","started_at":"2026-10-10T07:00:00+02:00","activity":"running",
	"duration_seconds":1500,"distance_m":5000,"samples":[{"t":0,"d":0},{"t":10,"d":32,"hr":131}],
	"source":"Apple Watch","source_uuid":"run-1"}`

func cardioRequest(t *testing.T, h *Handlers, method, url, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	w := httptest.NewRecorder()
	h.CardioAPI(w, req)
	return w
}

func TestCardioAPI_ImportListGetDelete(t *testing.T) {
	h, _ := newTestHandlers(t)

	w := cardioRequest(t, h, "POST", "/api/cardio", "["+cardioRunJSON+"]")
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var saved []store.CardioWorkout
	json.NewDecoder(w.Body).Decode(&saved)
	if len(saved) != 1 || saved[0].ID == 0 {
		t.Fatalf("expected one saved workout, got %+v", saved)
	}

	// Importing it again saves nothing.
	w = cardioRequest(t, h, "POST", "/api/cardio", "["+cardioRunJSON+"]")
	var again []store.CardioWorkout
	json.NewDecoder(w.Body).Decode(&again)
	if w.Code != http.StatusCreated || len(again) != 0 {
		t.Errorf("expected nothing saved again, got %d %+v", w.Code, again)
	}

	w = cardioRequest(t, h, "GET", "/api/cardio?activity=running", "")
	var list []store.CardioWorkout
	json.NewDecoder(w.Body).Decode(&list)
	if w.Code != http.StatusOK || len(list) != 1 || list[0].Samples != nil {
		t.Errorf("expected one run without samples, got %d %+v", w.Code, list)
	}

	w = cardioRequest(t, h, "GET", fmt.Sprintf("/api/cardio?id=%d", saved[0].ID), "")
	var one store.CardioWorkout
	json.NewDecoder(w.Body).Decode(&one)
	if w.Code != http.StatusOK || len(one.Samples) != 2 {
		t.Errorf("expected the run with its samples, got %d %+v", w.Code, one)
	}

	w = cardioRequest(t, h, "DELETE", fmt.Sprintf("/api/cardio?id=%d", saved[0].ID), "")
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	w = cardioRequest(t, h, "DELETE", fmt.Sprintf("/api/cardio?id=%d", saved[0].ID), "")
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 deleting again, got %d", w.Code)
	}
	w = cardioRequest(t, h, "GET", fmt.Sprintf("/api/cardio?id=%d", saved[0].ID), "")
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for a deleted workout, got %d", w.Code)
	}
}

func TestCardioAPI_GETEmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)

	w := cardioRequest(t, h, "GET", "/api/cardio", "")
	if body := strings.TrimSpace(w.Body.String()); w.Code != http.StatusOK || body != "[]" {
		t.Errorf("expected 200 [], got %d %s", w.Code, body)
	}
}

func TestCardioAPI_RejectsInvalidWorkouts(t *testing.T) {
	h, _ := newTestHandlers(t)

	valid := map[string]any{}
	if err := json.Unmarshal([]byte(cardioRunJSON), &valid); err != nil {
		t.Fatal(err)
	}
	for field, value := range map[string]any{
		"date":             "10/10/2026",
		"started_at":       "2026-10-10 07:00",
		"activity":         "rowing",
		"duration_seconds": 0,
		"distance_m":       -1,
	} {
		invalid := map[string]any{}
		for k, v := range valid {
			invalid[k] = v
		}
		invalid[field] = value
		body, _ := json.Marshal([]any{valid, invalid})

		w := cardioRequest(t, h, "POST", "/api/cardio", string(body))
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s=%v: expected 400, got %d", field, value, w.Code)
		}
	}

	// Nothing from a rejected batch is saved.
	w := cardioRequest(t, h, "GET", "/api/cardio", "")
	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected nothing saved, got %s", body)
	}

	for _, body := range []string{"not json", cardioRunJSON} {
		if w := cardioRequest(t, h, "POST", "/api/cardio", body); w.Code != http.StatusBadRequest {
			t.Errorf("%q: expected 400, got %d", body, w.Code)
		}
	}
	if w := cardioRequest(t, h, "GET", "/api/cardio?activity=rowing", ""); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an unknown activity, got %d", w.Code)
	}
	if w := cardioRequest(t, h, "DELETE", "/api/cardio?id=x", ""); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an invalid ID, got %d", w.Code)
	}
}
