package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

func serveDiet(h *Handlers, method, target, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	w := httptest.NewRecorder()
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	mux.ServeHTTP(w, req)
	return w
}

func TestDietAPI_PUTAndGETWithinRange(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, body := range []string{
		`{"date":"2026-10-12","adhered":true,"protein_g":150}`,
		`{"date":"2026-10-13","adhered":false}`,
		`{"date":"2026-10-20","adhered":true}`,
	} {
		if w := serveDiet(h, "PUT", "/api/diet", body); w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	}

	w := serveDiet(h, "GET", "/api/diet?from=2026-10-12&to=2026-10-18", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var days []store.DietDay
	json.NewDecoder(w.Body).Decode(&days)
	if len(days) != 2 || !days[0].Adhered || days[0].ProteinG == nil || *days[0].ProteinG != 150 || days[1].Adhered {
		t.Errorf("unexpected days %+v", days)
	}
}

func TestDietAPI_GET_EmptyReturnsEmptyArray(t *testing.T) {
	h, _ := newTestHandlers(t)
	w := serveDiet(h, "GET", "/api/diet", "")
	if body := strings.TrimSpace(w.Body.String()); body != "[]" {
		t.Errorf("expected empty JSON array, got %s", body)
	}
}

func TestDietAPI_Invalid(t *testing.T) {
	h, _ := newTestHandlers(t)

	for _, c := range []struct{ method, target, body string }{
		{"PUT", "/api/diet", `not json`},
		{"PUT", "/api/diet", `{"adhered":true}`},
		{"PUT", "/api/diet", `{"date":"12/10/2026","adhered":true}`},
		{"PUT", "/api/diet", `{"date":"2026-10-12","adhered":true,"protein_g":-5}`},
		{"PUT", "/api/diet", `{"date":"2026-10-12","adhered":true,"protein_g":5000}`},
		{"GET", "/api/diet?from=yesterday", ""},
		{"DELETE", "/api/diet", ""},
		{"GET", "/api/diet/insights?date=today", ""},
	} {
		if w := serveDiet(h, c.method, c.target, c.body); w.Code != http.StatusBadRequest {
			t.Errorf("%s %s %s: expected 400, got %d", c.method, c.target, c.body, w.Code)
		}
	}
}

func TestDietAPI_DELETE(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SaveDietDay(store.DietDay{Date: "2026-10-12", Adhered: true})

	if w := serveDiet(h, "DELETE", "/api/diet?date=2026-10-12", ""); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if days, _ := s.ListDietDays("", ""); len(days) != 0 {
		t.Errorf("expected the day deleted, got %+v", days)
	}
}

func TestDietSettingsAPI_Gone(t *testing.T) {
	h, _ := newTestHandlers(t)
	// The protein target was dropped, so its route is no longer served.
	if w := serveDiet(h, "GET", "/api/diet/settings", ""); w.Code == http.StatusOK {
		t.Errorf("expected no diet settings route, got %d %s", w.Code, w.Body.String())
	}
}

func TestDietInsightsAPI(t *testing.T) {
	h, s := newTestHandlers(t)
	s.SaveDietDay(store.DietDay{Date: "2026-10-19", Adhered: true})
	s.SaveDietDay(store.DietDay{Date: "2026-10-20", Adhered: true})

	w := serveDiet(h, "GET", "/api/diet/insights?date=2026-10-20", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var insights store.DietInsights
	json.NewDecoder(w.Body).Decode(&insights)
	if insights.CurrentStreak != 2 || insights.Recent.Logged != 2 {
		t.Errorf("unexpected insights %+v", insights)
	}
}

func TestDietTargetAPI(t *testing.T) {
	h, _ := newTestHandlers(t)
	if w := serveDiet(h, "GET", "/api/diet/target", ""); w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"target_weight_kg":null}` {
		t.Errorf("expected no target, got %d %s", w.Code, w.Body.String())
	}
	if w := serveDiet(h, "PUT", "/api/diet/target", `{"target_weight_kg":78}`); w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"target_weight_kg":78}` {
		t.Errorf("expected 78 kg saved, got %d %s", w.Code, w.Body.String())
	}
	if w := serveDiet(h, "PUT", "/api/diet/target", `{"target_weight_kg":null}`); strings.TrimSpace(w.Body.String()) != `{"target_weight_kg":null}` {
		t.Errorf("expected the target cleared, got %s", w.Body.String())
	}
	for _, body := range []string{`{"target_weight_kg":5}`, `nope`} {
		if w := serveDiet(h, "PUT", "/api/diet/target", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}
}
