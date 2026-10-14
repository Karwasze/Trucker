package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
)

// InsightsAPI analyses training up to the given date (the client's today),
// over the timespan starting on the optional from date, judging adherence
// and stalls against the optional plan_id.
func (h *Handlers) InsightsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	date := r.URL.Query().Get("date")
	if !validDate(date) {
		http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	from := r.URL.Query().Get("from")
	if from != "" && !validDate(from) {
		http.Error(w, "From must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	planID := 0
	if idStr := r.URL.Query().Get("plan_id"); idStr != "" {
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			http.Error(w, "Invalid plan ID", http.StatusBadRequest)
			return
		}
		planID = id
	}

	insights, err := h.store.GetInsights(date, from, planID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error computing insights: %v", err)
		return
	}
	if err := json.NewEncoder(w).Encode(insights); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
