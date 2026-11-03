package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"trucker/internal/store"
)

// maxProteinG is more protein than anyone eats in a day, to catch bad input.
const maxProteinG = 1000

// validProtein reports whether g, if set, is a plausible amount of protein.
func validProtein(g *float64) bool {
	return g == nil || (*g > 0 && *g <= maxProteinG)
}

// DietAPI lists the days logged (GET, optionally ?from= and &to=), records
// whether a day's diet was kept to (PUT {date, adhered, protein_g?}) and
// removes a day's record (DELETE ?date=).
func (h *Handlers) DietAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		from, to, ok := dateRange(w, r)
		if !ok {
			return
		}
		days, err := h.store.ListDietDays(from, to)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading diet days: %v", err)
			return
		}
		json.NewEncoder(w).Encode(days)

	case "PUT":
		var day store.DietDay
		if err := json.NewDecoder(r.Body).Decode(&day); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if !validDate(day.Date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if !validProtein(day.ProteinG) {
			http.Error(w, fmt.Sprintf("Protein must be between 0 and %d g", maxProteinG), http.StatusBadRequest)
			return
		}
		if err := h.store.SaveDietDay(day); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving diet day: %v", err)
			return
		}
		json.NewEncoder(w).Encode(day)

	case "DELETE":
		date := r.URL.Query().Get("date")
		if !validDate(date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if err := h.store.DeleteDietDay(date); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error deleting diet day: %v", err)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// DietSettingsAPI returns (GET) and replaces (PUT) the daily protein
// target; a null target clears it.
func (h *Handlers) DietSettingsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
	case "PUT":
		var settings store.DietSettings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if !validProtein(settings.ProteinTargetG) {
			http.Error(w, fmt.Sprintf("Protein target must be between 0 and %d g", maxProteinG), http.StatusBadRequest)
			return
		}
		if err := h.store.SaveDietSettings(settings); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving diet settings: %v", err)
			return
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	settings, err := h.store.DietSettings()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading diet settings: %v", err)
		return
	}
	json.NewEncoder(w).Encode(settings)
}

// DietInsightsAPI sums up the diet up to ?date=, the client's today.
func (h *Handlers) DietInsightsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	today, ok := requestDate(w, r)
	if !ok {
		return
	}
	insights, err := h.store.DietInsights(today)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading diet insights: %v", err)
		return
	}
	json.NewEncoder(w).Encode(insights)
}
