package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func TestHeartRateZonesAPI_PUTAndGET(t *testing.T) {
	h, _ := newTestHandlers(t)

	req := httptest.NewRequest("GET", "/api/heart-rate-zones?date=2026-10-27", nil)
	w := httptest.NewRecorder()
	h.HeartRateZonesAPI(w, req)
	if body := strings.TrimSpace(w.Body.String()); w.Code != http.StatusOK || body != "null" {
		t.Fatalf("expected null before any zones, got %d %s", w.Code, body)
	}

	req = httptest.NewRequest("PUT", "/api/heart-rate-zones", strings.NewReader(`{"date":"2026-10-27","max_hr":185,"resting_hr":55}`))
	w = httptest.NewRecorder()
	h.HeartRateZonesAPI(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var put store.HeartRateZones
	json.NewDecoder(w.Body).Decode(&put)
	if len(put.Zones) != 5 || *put.Zones[2].Min != 146 || *put.Zones[2].Max != 158 {
		t.Errorf("expected zone 3 at 146–158 bpm, got %+v", put)
	}

	req = httptest.NewRequest("GET", "/api/heart-rate-zones?date=2026-10-28", nil)
	w = httptest.NewRecorder()
	h.HeartRateZonesAPI(w, req)
	var got store.HeartRateZones
	json.NewDecoder(w.Body).Decode(&got)
	if got.Date != "2026-10-27" || got.MaxHR != 185 || got.RestingHR != 55 || len(got.Zones) != 5 {
		t.Errorf("unexpected zones %+v", got)
	}
}

func TestHeartRateZonesAPI_Invalid(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, body := range []string{
		`not json`,
		`{"date":"27/10/2026","max_hr":185,"resting_hr":55}`,
		`{"date":"2026-10-27","max_hr":0,"resting_hr":55}`,
		`{"date":"2026-10-27","max_hr":185,"resting_hr":0}`,
		`{"date":"2026-10-27","max_hr":60,"resting_hr":70}`,
		`{"date":"2026-10-27","max_hr":300,"resting_hr":55}`,
	} {
		req := httptest.NewRequest("PUT", "/api/heart-rate-zones", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.HeartRateZonesAPI(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}

	req := httptest.NewRequest("GET", "/api/heart-rate-zones", nil)
	w := httptest.NewRecorder()
	h.HeartRateZonesAPI(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 without a date, got %d", w.Code)
	}
}
