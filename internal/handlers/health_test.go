package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth_OK(t *testing.T) {
	h, _ := newTestHandlers(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// "/" is kept for probes configured before /healthz existed.
	for _, path := range []string{"/healthz", "/"} {
		req := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("%s: expected 200, got %d", path, w.Code)
		}
	}
}

func TestHealth_UnknownPathStillNotFound(t *testing.T) {
	h, _ := newTestHandlers(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest("GET", "/nope", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestHealth_DatabaseDown(t *testing.T) {
	h, s := newTestHandlers(t)
	s.Close()

	req := httptest.NewRequest("GET", "/healthz", nil)
	w := httptest.NewRecorder()
	h.Health(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", w.Code)
	}
}
