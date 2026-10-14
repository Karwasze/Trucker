package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trucker/internal/store"
)

func (h *Handlers) PlansAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		if r.URL.Query().Has("id") {
			h.getPlan(w, r)
		} else {
			h.listPlans(w)
		}

	case "POST":
		plan, ok := decodePlan(w, r)
		if !ok {
			return
		}
		created, err := h.store.CreatePlan(plan)
		if errors.Is(err, store.ErrDuplicatePlanName) {
			http.Error(w, "A plan with that name already exists", http.StatusConflict)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error creating plan: %v", err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	case "PUT":
		plan, ok := decodePlan(w, r)
		if !ok {
			return
		}
		if plan.ID == 0 {
			http.Error(w, "ID is required", http.StatusBadRequest)
			return
		}
		updated, err := h.store.UpdatePlan(plan)
		if errors.Is(err, store.ErrPlanNotFound) {
			http.Error(w, "Plan not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrDuplicatePlanName) {
			http.Error(w, "A plan with that name already exists", http.StatusConflict)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error updating plan: %v", err)
			return
		}
		json.NewEncoder(w).Encode(updated)

	case "DELETE":
		id, ok := planIDParam(w, r)
		if !ok {
			return
		}
		found, err := h.store.DeletePlan(id)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error deleting plan: %v", err)
			return
		}
		if !found {
			http.Error(w, "Plan not found", http.StatusNotFound)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handlers) listPlans(w http.ResponseWriter) {
	plans, err := h.store.GetPlans()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading plans: %v", err)
		return
	}
	json.NewEncoder(w).Encode(plans)
}

func (h *Handlers) getPlan(w http.ResponseWriter, r *http.Request) {
	id, ok := planIDParam(w, r)
	if !ok {
		return
	}
	plan, err := h.store.GetPlan(id)
	if errors.Is(err, store.ErrPlanNotFound) {
		http.Error(w, "Plan not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading plan: %v", err)
		return
	}
	json.NewEncoder(w).Encode(plan)
}

// PlanTodayAPI returns what a plan schedules for a date (today by default),
// with target weights worked out from logged workouts, and the workout
// already logged from the plan that day, if any.
func (h *Handlers) PlanTodayAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, ok := planIDParam(w, r)
	if !ok {
		return
	}

	date := time.Now()
	if dateStr := r.URL.Query().Get("date"); dateStr != "" {
		parsed, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			http.Error(w, "Date must be in YYYY-MM-DD format", http.StatusBadRequest)
			return
		}
		date = parsed
	}

	day, err := h.store.GetPlanDay(id, date)
	if errors.Is(err, store.ErrPlanNotFound) {
		http.Error(w, "Plan not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading plan day: %v", err)
		return
	}

	targets, err := h.store.ExerciseTargets(day.Exercises, date.Format("2006-01-02"))
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error working out plan targets: %v", err)
		return
	}

	logged, err := h.store.GetPlanWorkout(id, date.Format("2006-01-02"))
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading logged plan workout: %v", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		PlanID    int                    `json:"plan_id"`
		Date      string                 `json:"date"`
		Weekday   string                 `json:"weekday"`
		Exercises []store.ExerciseTarget `json:"exercises"`
		Workout   *store.Workout         `json:"workout,omitempty"`
	}{
		PlanID:    id,
		Date:      date.Format("2006-01-02"),
		Weekday:   day.Weekday,
		Exercises: targets,
		Workout:   logged,
	})
}

// planIDParam reads the required "id" query parameter, writing a 400
// response and returning false if it is missing or invalid.
func planIDParam(w http.ResponseWriter, r *http.Request) (int, bool) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "ID is required", http.StatusBadRequest)
		return 0, false
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

// decodePlan reads and validates a plan from the request body, writing a 400
// response and returning false if it is invalid. Weekday names are
// normalised to lowercase.
func decodePlan(w http.ResponseWriter, r *http.Request) (store.TrainingPlan, bool) {
	var plan store.TrainingPlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return plan, false
	}
	if err := validatePlan(&plan); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return plan, false
	}
	return plan, true
}

func validatePlan(plan *store.TrainingPlan) error {
	if strings.TrimSpace(plan.Name) == "" {
		return errors.New("Name is required")
	}

	seen := make(map[string]bool)
	for i := range plan.Days {
		day := &plan.Days[i]
		day.Weekday = strings.ToLower(day.Weekday)
		if !store.IsWeekday(day.Weekday) {
			return fmt.Errorf("Invalid weekday %q", day.Weekday)
		}
		if seen[day.Weekday] {
			return fmt.Errorf("Weekday %q appears more than once", day.Weekday)
		}
		seen[day.Weekday] = true

		for _, ex := range day.Exercises {
			if ex.Name == "" {
				return fmt.Errorf("Exercise name is required on %s", day.Weekday)
			}
			if ex.Sets <= 0 {
				return fmt.Errorf("%s on %s needs at least one set", ex.Name, day.Weekday)
			}
			if ex.Reps <= 0 {
				return fmt.Errorf("%s on %s: reps must be greater than 0", ex.Name, day.Weekday)
			}
		}
	}
	return nil
}
