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

// requestDate is the client's local date from ?date= (YYYY-MM-DD), or the
// server's today. It writes a 400 response and returns false when invalid.
func requestDate(w http.ResponseWriter, r *http.Request) (string, bool) {
	date := r.URL.Query().Get("date")
	if date == "" {
		return time.Now().Format("2006-01-02"), true
	}
	if !validDate(date) {
		http.Error(w, "Date must be in YYYY-MM-DD format", http.StatusBadRequest)
		return "", false
	}
	return date, true
}

// goalResponse is a saved goal with warnings about its plan.
type goalResponse struct {
	Goal     store.Goal `json:"goal"`
	Warnings []string   `json:"warnings"`
}

// GoalsAPI lists goals (GET), creates the active goal with its plan (POST),
// updates one and regenerates its plan (PUT) and deletes one (DELETE ?id=).
// POST and PUT plan from ?date=, the client's today.
func (h *Handlers) GoalsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		goals, err := h.store.ListGoals()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading goals: %v", err)
			return
		}
		json.NewEncoder(w).Encode(goals)

	case "POST", "PUT":
		today, ok := requestDate(w, r)
		if !ok {
			return
		}
		var goal store.Goal
		if err := json.NewDecoder(r.Body).Decode(&goal); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if err := store.ValidateGoal(goal, today); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		save, status := h.store.CreateGoal, http.StatusCreated
		if r.Method == "PUT" {
			save, status = h.store.UpdateGoal, http.StatusOK
		}
		saved, warnings, err := save(goal, today)
		if errors.Is(err, store.ErrGoalNotFound) {
			http.Error(w, "Goal not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error saving goal: %v", err)
			return
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(goalResponse{saved, warnings})

	case "DELETE":
		id, err := strconv.Atoi(r.URL.Query().Get("id"))
		if err != nil {
			http.Error(w, "Invalid ID", http.StatusBadRequest)
			return
		}
		found, err := h.store.DeleteGoal(id)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error deleting goal: %v", err)
			return
		}
		if !found {
			http.Error(w, "Goal not found", http.StatusNotFound)
			return
		}
		fmt.Fprintf(w, `{"success": true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GoalSessionsAPI returns a goal's sessions (GET ?id=, optionally &from=
// and &to=), judged as of ?date=.
func (h *Handlers) GoalSessionsAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id, err := strconv.Atoi(r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	today, ok := requestDate(w, r)
	if !ok {
		return
	}
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if (from != "" && !validDate(from)) || (to != "" && !validDate(to)) {
		http.Error(w, "from and to must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	if _, err := h.store.GetGoal(id); errors.Is(err, store.ErrGoalNotFound) {
		http.Error(w, "Goal not found", http.StatusNotFound)
		return
	}
	sessions, err := h.store.GoalSessions(id, from, to, today)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading goal sessions: %v", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// GoalTodayAPI returns the active goal, if any, and its sessions on ?date=.
func (h *Handlers) GoalTodayAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	today, ok := requestDate(w, r)
	if !ok {
		return
	}
	goal, err := h.store.ActiveGoal()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error loading active goal: %v", err)
		return
	}
	sessions := []store.PlannedSession{}
	if goal != nil {
		if sessions, err = h.store.GoalSessions(goal.ID, today, today, today); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			log.Printf("Error loading today's sessions: %v", err)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Goal     *store.Goal            `json:"goal"`
		Sessions []store.PlannedSession `json:"sessions"`
	}{goal, sessions})
}

// GoalMatchAPI makes a cardio workout fill a planned session, or empties the
// session for a null cardio_id (PUT), adapting the plan from next week.
func (h *Handlers) GoalMatchAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	today, ok := requestDate(w, r)
	if !ok {
		return
	}
	var match struct {
		SessionID int  `json:"session_id"`
		CardioID  *int `json:"cardio_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&match); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	err := h.store.MatchSession(match.SessionID, match.CardioID, today)
	switch {
	case errors.Is(err, store.ErrSessionNotFound):
		http.Error(w, "Planned session not found", http.StatusNotFound)
	case errors.Is(err, store.ErrCardioWorkoutNotFound):
		http.Error(w, "Cardio workout not found", http.StatusNotFound)
	case err != nil:
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error matching session: %v", err)
	default:
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"success": true}`)
	}
}
