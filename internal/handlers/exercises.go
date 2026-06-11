package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"strconv"

	"trucker/internal/store"
)

func (h *Handlers) ExercisesPage(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles(h.tmplPath("exercises.html"))
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		log.Printf("Error parsing exercises template: %v", err)
		return
	}
	tmpl.Execute(w, nil)
}

func (h *Handlers) ExercisesAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		exercises, err := h.store.GetAllExercises()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		if exercises == nil {
			exercises = []store.ExerciseDB{}
		}
		json.NewEncoder(w).Encode(exercises)

	case "POST":
		var exercise store.ExerciseDB
		if err := json.NewDecoder(r.Body).Decode(&exercise); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if exercise.Name == "" {
			http.Error(w, "Name is required", http.StatusBadRequest)
			return
		}
		created, err := h.store.CreateExercise(exercise.Name)
		if err != nil {
			http.Error(w, "Exercise already exists or database error", http.StatusConflict)
			return
		}
		json.NewEncoder(w).Encode(created)

	case "PUT":
		var exercise store.ExerciseDB
		if err := json.NewDecoder(r.Body).Decode(&exercise); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if exercise.ID == 0 || exercise.Name == "" {
			http.Error(w, "ID and name are required", http.StatusBadRequest)
			return
		}
		updated, err := h.store.UpdateExercise(exercise.ID, exercise.Name)
		if errors.Is(err, store.ErrDefaultExercise) {
			http.Error(w, "Cannot edit default exercises", http.StatusForbidden)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(updated)

	case "DELETE":
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "ID is required", http.StatusBadRequest)
			return
		}
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid ID", http.StatusBadRequest)
			return
		}
		err = h.store.DeleteExercise(id)
		if errors.Is(err, store.ErrDefaultExercise) {
			http.Error(w, "Cannot delete default exercises", http.StatusForbidden)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
