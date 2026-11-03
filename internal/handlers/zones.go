package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"trucker/internal/store"
)

// maxHeartRateLimit is above any real max heart rate, to catch bad input.
const maxHeartRateLimit = 250

// maxZoneStarts is more zones than Apple Watch has, to catch bad input.
const maxZoneStarts = 9

// HeartRateZonesAPI serves the heart rate zones sessions are judged by. GET
// returns the zones in effect on ?date= (null without any); PUT records, as
// of a date, either where zones 2 and up start as Apple Watch has them
// (zone_starts) or the max and resting heart rate to work them out from,
// which the app sends from Apple Health when they change, and returns the
// zones then.
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
			Date       string    `json:"date"`
			MaxHR      float64   `json:"max_hr"`
			RestingHR  float64   `json:"resting_hr"`
			ZoneStarts []float64 `json:"zone_starts"`
		}
		if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if !validDate(profile.Date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		var zones *store.HeartRateZones
		var err error
		if profile.ZoneStarts != nil {
			if !validZoneStarts(profile.ZoneStarts) {
				http.Error(w, "Zone starts must be ascending heart rates", http.StatusBadRequest)
				return
			}
			zones, err = h.store.SetHeartRateZones(profile.Date, profile.ZoneStarts)
		} else {
			if profile.RestingHR <= 0 || profile.MaxHR <= profile.RestingHR || profile.MaxHR > maxHeartRateLimit {
				http.Error(w, "Heart rates must be positive, with the max above resting", http.StatusBadRequest)
				return
			}
			zones, err = h.store.SetHeartRateProfile(profile.Date, profile.MaxHR, profile.RestingHR)
		}
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

// validZoneStarts reports whether starts are between 1 and maxZoneStarts
// heart rates, each above the last and up to maxHeartRateLimit.
func validZoneStarts(starts []float64) bool {
	if len(starts) == 0 || len(starts) > maxZoneStarts {
		return false
	}
	for i, start := range starts {
		if start <= 0 || start > maxHeartRateLimit || (i > 0 && start <= starts[i-1]) {
			return false
		}
	}
	return true
}
