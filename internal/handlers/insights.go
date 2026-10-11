package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// InsightsAPI analyses training up to the given date (the client's today).
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

	insights, err := h.store.GetInsights(date)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error computing insights: %v", err)
		return
	}
	if err := json.NewEncoder(w).Encode(insights); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
