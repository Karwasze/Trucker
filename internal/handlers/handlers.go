package handlers

import (
	"net/http"
	"path/filepath"

	"trucker/internal/store"
)

// Handlers holds the dependencies shared by all HTTP handlers.
type Handlers struct {
	store        *store.Store
	templatesDir string
}

// New creates a Handlers instance backed by the given store. templatesDir is
// the directory containing the application's HTML templates (e.g.
// "templates" in production, "../../templates" from package tests).
func New(s *store.Store, templatesDir string) *Handlers {
	return &Handlers{store: s, templatesDir: templatesDir}
}

// tmplPath resolves a template filename relative to the configured
// templates directory.
func (h *Handlers) tmplPath(name string) string {
	return filepath.Join(h.templatesDir, name)
}

// RegisterRoutes wires up all application routes on the given mux.
func (h *Handlers) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/", h.Home)
	mux.HandleFunc("/workout/new", h.NewWorkoutForm)
	mux.HandleFunc("/workout/create", h.CreateWorkout)
	mux.HandleFunc("/workouts", h.ListWorkouts)
	mux.HandleFunc("/gzclp", h.GZCLPForm)
	mux.HandleFunc("/gzclp/skip", h.SkipGZCLPDay)
	mux.HandleFunc("/workout/delete", h.DeleteWorkout)
	mux.HandleFunc("/statistics", h.StatisticsPage)
	mux.HandleFunc("/exercises", h.ExercisesPage)
	mux.HandleFunc("/api/exercises", h.ExercisesAPI)
	mux.HandleFunc("/api/gzclp/config", h.GZCLPConfigAPI)
	mux.HandleFunc("/api/latest-exercise", h.LatestExercise)
	mux.HandleFunc("/api/statistics", h.StatisticsAPI)
}
