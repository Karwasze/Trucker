package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// maxHeartRateLimit is above any real max heart rate, to catch bad input.
const maxHeartRateLimit = 250

// HeartRateZonesAPI serves the heart rate zones sessions are judged by. GET
// returns the zones in effect on ?date= (null without any); PUT records the
// max and resting heart rate as of a date, which the app sends from Apple
// Health when they change, and returns the zones then.
func (h *Handlers) HeartRateZonesAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		date := r.URL.Query().Get("date")
		if !validDate(date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		zones, err := h.store.HeartRateZones(date)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading heart rate zones: %v", err)
			return
		}
		json.NewEncoder(w).Encode(zones)

	case "PUT":
		var profile struct {
			Date      string  `json:"date"`
			MaxHR     float64 `json:"max_hr"`
			RestingHR float64 `json:"resting_hr"`
		}
		if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if !validDate(profile.Date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if profile.RestingHR <= 0 || profile.MaxHR <= profile.RestingHR || profile.MaxHR > maxHeartRateLimit {
			http.Error(w, "Heart rates must be positive, with the max above resting", http.StatusBadRequest)
			return
		}
		zones, err := h.store.SetHeartRateProfile(profile.Date, profile.MaxHR, profile.RestingHR)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving heart rate profile: %v", err)
			return
		}
		json.NewEncoder(w).Encode(zones)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
