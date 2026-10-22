package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// AchievementsAPI lists every achievement with the tiers earned so far.
func (h *Handlers) AchievementsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	achievements, err := h.store.ListAchievements()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading achievements: %v", err)
		return
	}
	if err := json.NewEncoder(w).Encode(achievements); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
