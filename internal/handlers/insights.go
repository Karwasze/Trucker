package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
)

// insightsParams reads the client's today (?date=), the optional start of
// the timespan (?from=) and plan (?plan_id=, 0 when left out), answering
// with an error and reporting false when one is invalid.
func insightsParams(w http.ResponseWriter, r *http.Request) (date, from string, planID int, ok bool) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return "", "", 0, false
	}
	w.Header().Set("Content-Type", "application/json")

	date = r.URL.Query().Get("date")
	if !validDate(date) {
		http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
		return "", "", 0, false
	}
	from = r.URL.Query().Get("from")
	if from != "" && !validDate(from) {
		http.Error(w, "From must be YYYY-MM-DD", http.StatusBadRequest)
		return "", "", 0, false
	}
	if idStr := r.URL.Query().Get("plan_id"); idStr != "" {
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			http.Error(w, "Invalid plan ID", http.StatusBadRequest)
			return "", "", 0, false
		}
		planID = id
	}
	return date, from, planID, true
}

// writeInsights answers with insights, or a database error for err.
func writeInsights(w http.ResponseWriter, insights any, err error) {
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error computing insights: %v", err)
		return
	}
	if err := json.NewEncoder(w).Encode(insights); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// InsightsAPI analyses training up to the given date (the client's today),
// over the timespan starting on the optional from date, judging adherence
// and stalls against the optional plan_id.
func (h *Handlers) InsightsAPI(w http.ResponseWriter, r *http.Request) {
	date, from, planID, ok := insightsParams(w, r)
	if !ok {
		return
	}
	insights, err := h.store.GetInsights(date, from, planID)
	insights.CalculatedAt = time.Now().UTC()
	writeInsights(w, insights, err)
}

// StrengthInsightsAPI gives deeper lifting insights, with the same
// parameters as InsightsAPI.
func (h *Handlers) StrengthInsightsAPI(w http.ResponseWriter, r *http.Request) {
	date, from, planID, ok := insightsParams(w, r)
	if !ok {
		return
	}
	insights, err := h.store.GetStrengthInsights(date, from, planID)
	writeInsights(w, insights, err)
}

// CardioInsightsAPI gives deeper endurance insights up to ?date= over the
// timespan from the optional ?from=.
func (h *Handlers) CardioInsightsAPI(w http.ResponseWriter, r *http.Request) {
	date, from, _, ok := insightsParams(w, r)
	if !ok {
		return
	}
	insights, err := h.store.GetCardioInsights(date, from)
	writeInsights(w, insights, err)
}

// BodyInsightsAPI gives deeper bodyweight and diet insights up to ?date=,
// with the optional ?plan_id= for skipped training. It has no timespan:
// each insight covers its own stretch.
func (h *Handlers) BodyInsightsAPI(w http.ResponseWriter, r *http.Request) {
	date, _, planID, ok := insightsParams(w, r)
	if !ok {
		return
	}
	insights, err := h.store.GetBodyInsights(date, planID)
	writeInsights(w, insights, err)
}
