package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"trucker/internal/store"
)

// RestingHeartRatesAPI lists the daily resting heart rates (GET, optionally
// ?from= and &to=) and records them (PUT [{date, bpm}]), e.g. from Apple
// Health, keeping days not sent.
func (h *Handlers) RestingHeartRatesAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		from, to, ok := dateRange(w, r)
		if !ok {
			return
		}
		readings, err := h.store.ListRestingHeartRates(from, to)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading resting heart rates: %v", err)
			return
		}
		json.NewEncoder(w).Encode(readings)

	case "PUT":
		var readings []store.RestingHeartRate
		if err := json.NewDecoder(r.Body).Decode(&readings); err != nil {
			http.Error(w, "Invalid JSON: expected an array of readings", http.StatusBadRequest)
			return
		}
		for _, reading := range readings {
			if !validDate(reading.Date) {
				http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
				return
			}
			if reading.BPM < 20 || reading.BPM > 150 {
				http.Error(w, "Resting heart rate must be between 20 and 150 bpm", http.StatusBadRequest)
				return
			}
		}
		if err := h.store.SaveRestingHeartRates(readings); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving resting heart rates: %v", err)
			return
		}
		json.NewEncoder(w).Encode(map[string]int{"saved": len(readings)})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
