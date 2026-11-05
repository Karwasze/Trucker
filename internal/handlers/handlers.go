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
	api := func(pattern string, handler http.HandlerFunc) { mux.Handle(pattern, noStore(handler)) }
	api("/api/workouts", h.WorkoutsAPI)
	api("/api/exercises", h.ExercisesAPI)
	api("/api/plans", h.PlansAPI)
	api("/api/plans/today", h.PlanTodayAPI)
	api("/api/latest-exercise", h.LatestExercise)
	api("/api/statistics", h.StatisticsAPI)
	api("/api/exercise-muscles", h.ExerciseMusclesAPI)
	api("/api/bodyweight", h.BodyweightAPI)
	api("/api/insights", h.InsightsAPI)
	api("/api/insights/strength", h.StrengthInsightsAPI)
	api("/api/insights/cardio", h.CardioInsightsAPI)
	api("/api/insights/body", h.BodyInsightsAPI)
	api("/api/resting-heart-rates", h.RestingHeartRatesAPI)
	api("/api/cardio", h.CardioAPI)
	api("/api/triathlons", h.TriathlonsAPI)
	api("/api/history", h.HistoryAPI)
	api("/api/achievements", h.AchievementsAPI)
	api("/api/goals", h.GoalsAPI)
	api("/api/goals/sessions", h.GoalSessionsAPI)
	api("/api/goals/today", h.GoalTodayAPI)
	api("/api/goals/match", h.GoalMatchAPI)
	api("/api/heart-rate-zones", h.HeartRateZonesAPI)
	api("/api/diet", h.DietAPI)
	api("/api/diet/insights", h.DietInsightsAPI)
	api("/api/diet/target", h.DietTargetAPI)
	mux.HandleFunc("/healthz", h.Health)
	// Exact "/" only, for probes configured before /healthz existed.
	mux.HandleFunc("/{$}", h.Health)
}

// noStore keeps clients from caching API responses: they change whenever
// data is added, while their URLs (e.g. insights up to today) stay the same,
// and iOS would otherwise answer a repeated GET from its cache.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
