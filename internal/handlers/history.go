package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// dateRange reads the optional ?from= and ?to= dates (YYYY-MM-DD) bounding a
// list, "" for an open end. It writes a 400 and returns false when either is
// malformed.
func dateRange(w http.ResponseWriter, r *http.Request) (from, to string, ok bool) {
	from, to = r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if (from != "" && !validDate(from)) || (to != "" && !validDate(to)) {
		http.Error(w, "from and to must be in YYYY-MM-DD format", http.StatusBadRequest)
		return "", "", false
	}
	return from, to, true
}

// HistoryAPI returns how far back the workout history goes: the date of the
// oldest lifting or cardio workout, or null when none are logged.
func (h *Handlers) HistoryAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	oldest, err := h.store.OldestWorkoutDate()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading oldest workout date: %v", err)
		return
	}
	response := struct {
		Oldest *string `json:"oldest"`
	}{}
	if oldest != "" {
		response.Oldest = &oldest
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
