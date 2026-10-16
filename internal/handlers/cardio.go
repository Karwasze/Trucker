package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"trucker/internal/store"
)

// CardioAPI lists cardio workouts (GET, optionally ?activity=), returns one
// with its samples (GET ?id=), imports a batch of them (POST, skipping ones
// already imported, adapting the active goal as of ?date= when they fill
// planned sessions) and deletes one (DELETE ?id=).
func (h *Handlers) CardioAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		if r.URL.Query().Has("id") {
			id, err := strconv.Atoi(r.URL.Query().Get("id"))
			if err != nil {
				http.Error(w, "Invalid ID", http.StatusBadRequest)
				return
			}
			workout, err := h.store.GetCardioWorkout(id)
			if errors.Is(err, store.ErrCardioWorkoutNotFound) {
				http.Error(w, "Cardio workout not found", http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, "Database error", http.StatusInternalServerError)
				log.Printf("Error loading cardio workout: %v", err)
				return
			}
			json.NewEncoder(w).Encode(workout)
			return
		}

		activity := r.URL.Query().Get("activity")
		if activity != "" && !store.ValidCardioActivity(activity) {
			http.Error(w, "Unknown activity", http.StatusBadRequest)
			return
		}
		workouts, err := h.store.ListCardioWorkouts(activity)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading cardio workouts: %v", err)
			return
		}
		json.NewEncoder(w).Encode(workouts)

	case "POST":
		var workouts []store.CardioWorkout
		if err := json.NewDecoder(r.Body).Decode(&workouts); err != nil {
			http.Error(w, "Expected a JSON array of workouts", http.StatusBadRequest)
			return
		}
		for i, workout := range workouts {
			if err := validateCardioWorkout(workout); err != nil {
				http.Error(w, fmt.Sprintf("Workout %d: %v", i+1, err), http.StatusBadRequest)
				return
			}
		}
		today, ok := requestDate(w, r)
		if !ok {
			return
		}
		saved, err := h.store.SaveCardioWorkouts(workouts)
		if errors.Is(err, store.ErrSessionNotFound) {
			http.Error(w, "Planned session not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving cardio workouts: %v", err)
			return
		}
		// Workouts filling planned sessions adapt the rest of the plan.
		for _, workout := range saved {
			if workout.PlannedSessionID != nil {
				if err := h.store.AdaptActiveGoal(today); err != nil {
					log.Printf("Error adapting goal: %v", err)
				}
				break
			}
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(saved)

	case "DELETE":
		id, err := strconv.Atoi(r.URL.Query().Get("id"))
		if err != nil {
			http.Error(w, "Invalid ID", http.StatusBadRequest)
			return
		}
		found, err := h.store.DeleteCardioWorkout(id)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error deleting cardio workout: %v", err)
			return
		}
		if !found {
			http.Error(w, "Cardio workout not found", http.StatusNotFound)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func validateCardioWorkout(workout store.CardioWorkout) error {
	switch {
	case !validDate(workout.Date):
		return errors.New("date must be YYYY-MM-DD")
	case !validTimestamp(workout.StartedAt):
		return errors.New("started_at must be an RFC3339 timestamp")
	case !store.ValidCardioActivity(workout.Activity):
		return fmt.Errorf("unknown activity %q", workout.Activity)
	case workout.DurationSeconds <= 0:
		return errors.New("duration_seconds must be positive")
	case workout.DistanceM != nil && *workout.DistanceM < 0:
		return errors.New("distance_m can't be negative")
	}
	return nil
}

func validTimestamp(timestamp string) bool {
	_, err := time.Parse(time.RFC3339, timestamp)
	return err == nil
}
