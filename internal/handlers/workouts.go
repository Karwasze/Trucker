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
	case "PUT":
		h.updateWorkout(w, r)
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
		Exercises: storableExercises(input.Exercises),
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
		progression, err := h.store.EvaluateProgression(*workout.PlanID, workout)
		if err != nil {
			log.Printf("Error evaluating plan progression: %v", err)
		} else {
			response.Progression = progression
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// updateWorkout replaces a logged workout's date and exercises. The plan it
// was logged against is kept. Plan targets are worked out from history, so
// they follow the edit.
func (h *Handlers) updateWorkout(w http.ResponseWriter, r *http.Request) {
	var input store.Workout
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if input.ID <= 0 {
		http.Error(w, "Workout ID required", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", input.Date); err != nil {
		http.Error(w, "Date is required in YYYY-MM-DD format", http.StatusBadRequest)
		return
	}

	workout := store.Workout{
		ID:        input.ID,
		Date:      input.Date,
		Exercises: storableExercises(input.Exercises),
	}

	found, err := h.store.UpdateWorkout(workout)
	if err != nil {
		http.Error(w, "Failed to update workout", http.StatusInternalServerError)
		log.Printf("Error updating workout: %v", err)
		return
	}
	if !found {
		http.Error(w, "Workout not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(workout)
}

// storableExercises drops exercises without a name or without any sets,
// which are not worth storing.
func storableExercises(exercises []store.Exercise) []store.Exercise {
	kept := []store.Exercise{}
	for _, exercise := range exercises {
		if exercise.Name != "" && len(exercise.Sets) > 0 {
			kept = append(kept, exercise)
		}
	}
	return kept
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

// LatestExercise returns the sets of the most recent workout that logged an
// exercise, and the target for doing it again on date (today by default),
// in the scheme given by sets and reps, or the last session's without them.
func (h *Handlers) LatestExercise(w http.ResponseWriter, r *http.Request) {
	exerciseName := r.URL.Query().Get("name")
	if exerciseName == "" {
		http.Error(w, "Exercise name required", http.StatusBadRequest)
		return
	}

	date := time.Now().Format("2006-01-02")
	if dateStr := r.URL.Query().Get("date"); dateStr != "" {
		if _, err := time.Parse("2006-01-02", dateStr); err != nil {
			http.Error(w, "Date must be in YYYY-MM-DD format", http.StatusBadRequest)
			return
		}
		date = dateStr
	}

	var scheme store.PlanExercise
	if r.URL.Query().Has("sets") || r.URL.Query().Has("reps") {
		var errSets, errReps error
		scheme.Sets, errSets = strconv.Atoi(r.URL.Query().Get("sets"))
		scheme.Reps, errReps = strconv.Atoi(r.URL.Query().Get("reps"))
		if errSets != nil || errReps != nil || scheme.Sets < 1 || scheme.Reps < 1 {
			http.Error(w, "Sets and reps must both be positive numbers", http.StatusBadRequest)
			return
		}
	}

	sets, err := h.store.GetLatestExerciseSets(exerciseName)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	target, reason, err := h.store.FreeExerciseTarget(exerciseName, date, scheme)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error working out exercise target: %v", err)
		return
	}
	if sets == nil {
		sets = []store.Set{}
	}
	if target == nil {
		target = []store.Set{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Sets   []store.Set `json:"sets"`
		Target []store.Set `json:"target"`
		Reason string      `json:"reason,omitempty"`
	}{sets, target, reason})
}
