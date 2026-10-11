package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

func (h *Handlers) StatisticsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	exerciseName := r.URL.Query().Get("exercise")

	response, err := h.store.GetStatisticsResponse(exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error querying statistics: %v", err)
		return
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}
