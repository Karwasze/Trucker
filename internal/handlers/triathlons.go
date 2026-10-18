package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// TriathlonsAPI lists the days with a swim, ride and run, newest first.
func (h *Handlers) TriathlonsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	tris, err := h.store.ListTriathlons()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading triathlons: %v", err)
		return
	}
	if err := json.NewEncoder(w).Encode(tris); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
