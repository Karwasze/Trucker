package handlers

import (
	"net/http"

	"trucker/internal/store"
)

// Handlers holds the dependencies shared by all HTTP handlers.
type Handlers struct {
	store *store.Store
}

// New creates a Handlers instance backed by the given store.
func New(s *store.Store) *Handlers {
	return &Handlers{store: s}
}

// RegisterRoutes wires up all API routes on the given mux.
func (h *Handlers) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/workouts", h.WorkoutsAPI)
	mux.HandleFunc("/api/exercises", h.ExercisesAPI)
	mux.HandleFunc("/api/plans", h.PlansAPI)
	mux.HandleFunc("/api/plans/today", h.PlanTodayAPI)
	mux.HandleFunc("/api/latest-exercise", h.LatestExercise)
	mux.HandleFunc("/api/statistics", h.StatisticsAPI)
	mux.HandleFunc("/api/exercise-muscles", h.ExerciseMusclesAPI)
	mux.HandleFunc("/api/bodyweight", h.BodyweightAPI)
	mux.HandleFunc("/api/insights", h.InsightsAPI)
	mux.HandleFunc("/healthz", h.Health)
	// Exact "/" only, for probes configured before /healthz existed.
	mux.HandleFunc("/{$}", h.Health)
}
