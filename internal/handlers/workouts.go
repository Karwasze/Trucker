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

func (h *Handlers) WorkoutsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		h.listWorkouts(w)
	case "POST":
		h.createWorkout(w, r)
	case "DELETE":
		h.deleteWorkout(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handlers) listWorkouts(w http.ResponseWriter) {
	workouts, err := h.store.GetWorkouts()
	if err != nil {
		http.Error(w, "Failed to load workouts", http.StatusInternalServerError)
		log.Printf("Error loading workouts: %v", err)
		return
	}
	if workouts == nil {
		workouts = []store.Workout{}
	}
	json.NewEncoder(w).Encode(workouts)
}

func (h *Handlers) createWorkout(w http.ResponseWriter, r *http.Request) {
	var input store.Workout
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", input.Date); err != nil {
		http.Error(w, "Date is required in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	if input.PlanID != nil {
		_, err := h.store.GetPlan(*input.PlanID)
		if errors.Is(err, store.ErrPlanNotFound) {
			http.Error(w, "Unknown plan_id", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading plan: %v", err)
			return
		}
	}

	workout := store.Workout{
		Date:      input.Date,
		PlanID:    input.PlanID,
		Exercises: []store.Exercise{},
	}

	// Exercises without a name or without any sets are not worth storing.
	for _, exercise := range input.Exercises {
		if exercise.Name != "" && len(exercise.Sets) > 0 {
			workout.Exercises = append(workout.Exercises, exercise)
		}
	}

	id, err := h.store.SaveWorkout(workout)
	if err != nil {
		http.Error(w, "Failed to save workout", http.StatusInternalServerError)
		log.Printf("Error saving workout: %v", err)
		return
	}
	workout.ID = id

	response := struct {
		store.Workout
		Progression []store.ProgressionResult `json:"progression,omitempty"`
	}{Workout: workout}

	// The workout is already saved, so a progression failure is logged
	// rather than failing the request.
	if workout.PlanID != nil {
		progression, err := h.store.ApplyProgression(*workout.PlanID, workout.Date, workout.Exercises)
		if err != nil {
			log.Printf("Error applying plan progression: %v", err)
		} else {
			response.Progression = progression
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *Handlers) deleteWorkout(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "Workout ID required", http.StatusBadRequest)
		return
	}

	workoutID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid workout ID", http.StatusBadRequest)
		return
	}

	found, err := h.store.DeleteWorkout(workoutID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error deleting workout: %v", err)
		return
	}

	if !found {
		http.Error(w, "Workout not found", http.StatusNotFound)
		return
	}

	log.Printf("Successfully deleted workout ID: %d", workoutID)
	fmt.Fprintf(w, `{"success": true}`)
}

func (h *Handlers) LatestExercise(w http.ResponseWriter, r *http.Request) {
	exerciseName := r.URL.Query().Get("name")
	if exerciseName == "" {
		http.Error(w, "Exercise name required", http.StatusBadRequest)
		return
	}

	sets, err := h.store.GetLatestExerciseSets(exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if len(sets) == 0 {
		fmt.Fprintf(w, `{"sets": []}`)
		return
	}

	fmt.Fprintf(w, `{"sets": [`)
	for i, set := range sets {
		if i > 0 {
			fmt.Fprintf(w, `,`)
		}
		fmt.Fprintf(w, `{"reps": %d, "weight": %.1f}`, set.Reps, set.Weight)
	}
	fmt.Fprintf(w, `]}`)
}
