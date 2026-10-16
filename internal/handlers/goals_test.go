package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"trucker/internal/store"
)

const tenKJSON = `{"name":"10k","race_date":"2027-01-10","run_m":10000,
	"weekdays":["monday","wednesday","friday","sunday"],"long_day":"sunday"}`

func serve(t *testing.T, handler http.HandlerFunc, method, url, body string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest(method, url, strings.NewReader(body)))
	return w
}

func createGoal(t *testing.T, h *Handlers) store.Goal {
	t.Helper()
	w := serve(t, h.GoalsAPI, "POST", "/api/goals?date=2026-10-19", tenKJSON)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var res struct {
		Goal     store.Goal `json:"goal"`
		Warnings []string   `json:"warnings"`
	}
	json.NewDecoder(w.Body).Decode(&res)
	if res.Goal.ID == 0 || res.Goal.StartDate != "2026-10-19" || res.Warnings == nil {
		t.Fatalf("unexpected response %+v", res)
	}
	return res.Goal
}

func TestGoalsAPI_CRUD(t *testing.T) {
	h, _ := newTestHandlers(t)
	goal := createGoal(t, h)

	w := serve(t, h.GoalsAPI, "GET", "/api/goals", "")
	var goals []store.Goal
	json.NewDecoder(w.Body).Decode(&goals)
	if len(goals) != 1 || !goals[0].Active {
		t.Errorf("expected the active goal listed, got %+v", goals)
	}

	update := strings.Replace(tenKJSON, `"name":"10k"`, fmt.Sprintf(`"id":%d,"name":"Spring 10k"`, goal.ID), 1)
	if w := serve(t, h.GoalsAPI, "PUT", "/api/goals?date=2026-10-20", update); w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	missing := strings.Replace(tenKJSON, `"name":"10k"`, `"id":999,"name":"10k"`, 1)
	if w := serve(t, h.GoalsAPI, "PUT", "/api/goals?date=2026-10-20", missing); w.Code != http.StatusNotFound {
		t.Errorf("expected 404 updating a missing goal, got %d", w.Code)
	}

	if w := serve(t, h.GoalsAPI, "DELETE", fmt.Sprintf("/api/goals?id=%d", goal.ID), ""); w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if w := serve(t, h.GoalsAPI, "DELETE", fmt.Sprintf("/api/goals?id=%d", goal.ID), ""); w.Code != http.StatusNotFound {
		t.Errorf("expected 404 deleting again, got %d", w.Code)
	}
}

func TestGoalsAPI_RejectsInvalidGoals(t *testing.T) {
	h, _ := newTestHandlers(t)
	for _, body := range []string{
		"not json",
		strings.Replace(tenKJSON, `"race_date":"2027-01-10"`, `"race_date":"2026-10-01"`, 1),
		strings.Replace(tenKJSON, `"long_day":"sunday"`, `"long_day":"saturday"`, 1),
		strings.Replace(tenKJSON, `"run_m":10000,`, ``, 1),
	} {
		if w := serve(t, h.GoalsAPI, "POST", "/api/goals?date=2026-10-19", body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", body, w.Code)
		}
	}
	if w := serve(t, h.GoalsAPI, "POST", "/api/goals?date=19/10/2026", tenKJSON); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a bad date, got %d", w.Code)
	}
}

type todayResponse struct {
	Goal     *store.Goal            `json:"goal"`
	Sessions []store.PlannedSession `json:"sessions"`
}

func goalToday(t *testing.T, h *Handlers, date string) todayResponse {
	t.Helper()
	w := serve(t, h.GoalTodayAPI, "GET", "/api/goals/today?date="+date, "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var res todayResponse
	json.NewDecoder(w.Body).Decode(&res)
	return res
}

func TestGoalTodayAPI_ImportFillsSession(t *testing.T) {
	h, _ := newTestHandlers(t)
	if res := goalToday(t, h, "2026-10-19"); res.Goal != nil || res.Sessions == nil || len(res.Sessions) != 0 {
		t.Errorf("expected no goal and no sessions, got %+v", res)
	}
	createGoal(t, h)

	today := goalToday(t, h, "2026-10-19")
	if today.Goal == nil || len(today.Sessions) != 1 || today.Sessions[0].Verdict.Status != store.VerdictPending {
		t.Fatalf("expected one pending session today, got %+v", today)
	}
	session := today.Sessions[0]

	run := fmt.Sprintf(`[{"date":"2026-10-19","started_at":"2026-10-19T07:00:00+02:00","activity":"running",
		"duration_seconds":1800,"distance_m":%v,"source_uuid":"run-1","planned_session_id":%d}]`,
		*session.TargetDistanceM, session.ID)
	if w := serve(t, h.CardioAPI, "POST", "/api/cardio?date=2026-10-19", run); w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	filled := goalToday(t, h, "2026-10-19").Sessions[0]
	if filled.Workout == nil || filled.Verdict.Status != store.VerdictMet {
		t.Errorf("expected the session met by the run, got %+v", filled)
	}

	unknown := strings.Replace(strings.Replace(run, "run-1", "run-2", 1),
		fmt.Sprintf(`"planned_session_id":%d`, session.ID), `"planned_session_id":999`, 1)
	if w := serve(t, h.CardioAPI, "POST", "/api/cardio?date=2026-10-19", unknown); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an unknown session, got %d", w.Code)
	}
}

func TestGoalSessionsAndMatchAPI(t *testing.T) {
	h, s := newTestHandlers(t)
	goal := createGoal(t, h)

	w := serve(t, h.GoalSessionsAPI, "GET",
		fmt.Sprintf("/api/goals/sessions?id=%d&from=2026-10-19&to=2026-10-25&date=2026-10-21", goal.ID), "")
	var week []store.PlannedSession
	json.NewDecoder(w.Body).Decode(&week)
	if w.Code != http.StatusOK || len(week) != 4 || week[0].Verdict.Status != store.VerdictMissed {
		t.Fatalf("expected a week of 4 sessions, Monday missed, got %d %+v", w.Code, week)
	}
	if w := serve(t, h.GoalSessionsAPI, "GET", "/api/goals/sessions?id=999", ""); w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for a missing goal, got %d", w.Code)
	}

	saved, err := s.SaveCardioWorkouts([]store.CardioWorkout{{
		Date: "2026-10-19", StartedAt: "2026-10-19T18:00:00Z", Activity: store.ActivityRunning,
		DurationSeconds: 1500, DistanceM: week[0].TargetDistanceM,
	}})
	if err != nil {
		t.Fatal(err)
	}
	match := fmt.Sprintf(`{"session_id":%d,"cardio_id":%d}`, week[0].ID, saved[0].ID)
	if w := serve(t, h.GoalMatchAPI, "PUT", "/api/goals/match?date=2026-10-21", match); w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	sessions, _ := s.GoalSessions(goal.ID, "2026-10-19", "2026-10-19", "2026-10-21")
	if sessions[0].Verdict.Status != store.VerdictMet {
		t.Errorf("expected Monday met after matching, got %+v", sessions[0].Verdict)
	}

	for body, want := range map[string]int{
		`{"session_id":999,"cardio_id":null}`:                        http.StatusNotFound,
		fmt.Sprintf(`{"session_id":%d,"cardio_id":999}`, week[0].ID): http.StatusNotFound,
		`nope`: http.StatusBadRequest,
	} {
		if w := serve(t, h.GoalMatchAPI, "PUT", "/api/goals/match", body); w.Code != want {
			t.Errorf("%s: expected %d, got %d", body, want, w.Code)
		}
	}
}
