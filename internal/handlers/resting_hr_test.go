package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"trucker/internal/store"
)

func TestRestingHeartRatesAPI(t *testing.T) {
	h, _ := newTestHandlers(t)
	if w := serveDiet(h, "PUT", "/api/resting-heart-rates", `[{"date":"2026-03-01","bpm":52},{"date":"2026-03-02","bpm":54}]`); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	w := serveDiet(h, "GET", "/api/resting-heart-rates?from=2026-03-02&to=2026-03-31", "")
	var got []store.RestingHeartRate
	json.NewDecoder(w.Body).Decode(&got)
	if len(got) != 1 || got[0].BPM != 54 {
		t.Errorf("expected Mar 2 only, got %+v", got)
	}
}

func TestRestingHeartRatesAPI_Invalid(t *testing.T) {
	h, _ := newTestHandlers(t)
	for _, body := range []string{`{}`, `[{"date":"March","bpm":52}]`, `[{"date":"2026-03-01","bpm":0}]`} {
		if w := serveDiet(h, "PUT", "/api/resting-heart-rates", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}
}
