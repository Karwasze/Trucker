package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"trucker/internal/store"
)

// validDate reports whether date is in YYYY-MM-DD form.
func validDate(date string) bool {
	_, err := time.Parse("2006-01-02", date)
	return err == nil
}

func (h *Handlers) BodyweightAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		entries, err := h.store.ListBodyweight()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading bodyweight: %v", err)
			return
		}
		json.NewEncoder(w).Encode(entries)

	case "POST":
		var entry store.BodyweightEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if !validDate(entry.Date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if entry.Weight <= 0 {
			http.Error(w, "Weight must be positive", http.StatusBadRequest)
			return
		}
		if err := h.store.SaveBodyweight(entry.Date, entry.Weight); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving bodyweight: %v", err)
			return
		}
		json.NewEncoder(w).Encode(entry)

	case "PUT":
		// Replaces every entry, e.g. with the weigh-ins from Apple Health.
		var entries []store.BodyweightEntry
		if err := json.NewDecoder(r.Body).Decode(&entries); err != nil {
			http.Error(w, "Invalid JSON: expected an array of entries", http.StatusBadRequest)
			return
		}
		for _, e := range entries {
			if !validDate(e.Date) {
				http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
				return
			}
			if e.Weight <= 0 {
				http.Error(w, "Weight must be positive", http.StatusBadRequest)
				return
			}
		}
		if err := h.store.ReplaceBodyweight(entries); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error replacing bodyweight: %v", err)
			return
		}
		saved, err := h.store.ListBodyweight()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading bodyweight: %v", err)
			return
		}
		json.NewEncoder(w).Encode(saved)

	case "DELETE":
		date := r.URL.Query().Get("date")
		if !validDate(date) {
			http.Error(w, "Date must be YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		if err := h.store.DeleteBodyweight(date); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error deleting bodyweight: %v", err)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
