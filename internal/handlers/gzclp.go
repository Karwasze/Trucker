package handlers

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"

	"trucker/internal/store"
)

func (h *Handlers) GZCLPForm(w http.ResponseWriter, r *http.Request) {
	workoutDay, err := h.store.GetGZCLPCurrentDay()
	if err != nil {
		log.Printf("Error getting workout day: %v", err)
		workoutDay = 1
	}

	t1, t2, t3, additional1, additional2 := h.store.GetGZCLPExercises(workoutDay)

	exercises, _ := h.store.GetAllExercises()

	tmpl := template.Must(template.ParseFiles(h.tmplPath("gzclp_form.html")))
	data := struct {
		Today               string
		WorkoutDay          int
		T1Exercise          string
		T2Exercise          string
		T3Exercise          string
		Additional1Exercise string
		Additional2Exercise string
		Exercises           []store.ExerciseDB
	}{
		Today:               time.Now().Format("2006-01-02"),
		WorkoutDay:          workoutDay,
		T1Exercise:          t1,
		T2Exercise:          t2,
		T3Exercise:          t3,
		Additional1Exercise: additional1,
		Additional2Exercise: additional2,
		Exercises:           exercises,
	}
	tmpl.Execute(w, data)
}

func (h *Handlers) SkipGZCLPDay(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentDay, nextDay, err := h.store.SkipGZCLPDay()
	if err != nil {
		log.Printf("Error updating GZCLP settings: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	log.Printf("Skipped GZCLP workout day %d, advanced to day %d", currentDay, nextDay)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Day skipped successfully")
}

func (h *Handlers) GZCLPConfigAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		assignments, err := h.store.GetGZCLPAllDayExercises()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(assignments)

	case "PUT":
		var assignments []store.GZCLPDayExercise
		if err := json.NewDecoder(r.Body).Decode(&assignments); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := h.store.SetGZCLPDayExercises(assignments); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
