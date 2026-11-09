package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"trucker/internal/store"
)

// DietAPI lists the days logged (GET, optionally ?from= and &to=), records
// whether a day's diet was kept to (PUT {date, adhered}) and
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
	insights.CalculatedAt = time.Now().UTC()
	json.NewEncoder(w).Encode(insights)
}

// dietTarget is the body of DietTargetAPI.
type dietTarget struct {
	TargetWeightKg *float64 `json:"target_weight_kg"`
}

// DietTargetAPI returns (GET) and sets (PUT {target_weight_kg}, null to
// clear) the bodyweight the diet aims for.
func (h *Handlers) DietTargetAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case "GET":
	case "PUT":
		var body dietTarget
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if kg := body.TargetWeightKg; kg != nil && (*kg < 20 || *kg > 400) {
			http.Error(w, "Target weight must be between 20 and 400 kg", http.StatusBadRequest)
			return
		}
		if err := h.store.SetTargetWeight(body.TargetWeightKg); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving target weight: %v", err)
			return
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target, err := h.store.TargetWeight()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading target weight: %v", err)
		return
	}
	json.NewEncoder(w).Encode(dietTarget{TargetWeightKg: target})
}
