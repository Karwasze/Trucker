package store

import (
	"errors"
	"fmt"
	"testing"
)

func newGoal() Goal {
	return Goal{
		Name: "10k", RaceDate: "2027-01-10", RunM: fp(10000),
		Weekdays: []string{"monday", "wednesday", "friday", "sunday"}, LongDay: "sunday",
	}
}

func mustCreateGoal(t *testing.T, s *Store, g Goal, today string) Goal {
	t.Helper()
	created, _, err := s.CreateGoal(g, today)
	if err != nil {
		t.Fatalf("failed to create goal: %v", err)
	}
	return created
}

func sessionsOn(t *testing.T, s *Store, goalID int, from, to, today string) []PlannedSession {
	t.Helper()
	sessions, err := s.GoalSessions(goalID, from, to, today)
	if err != nil {
		t.Fatal(err)
	}
	return sessions
}

func TestCreateGoal_GeneratesPlanAndIsActive(t *testing.T) {
	s := newTestStore(t)
	first := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	second := mustCreateGoal(t, s, newGoal(), "2026-10-19")

	active, err := s.ActiveGoal()
	if err != nil || active == nil || active.ID != second.ID {
		t.Fatalf("expected the newest goal active, got %+v (%v)", active, err)
	}
	if got, _ := s.GetGoal(first.ID); got.Active {
		t.Error("expected the first goal deactivated")
	}
	if got, _ := s.GetGoal(second.ID); got.StartDate != "2026-10-19" || got.LongDay != "sunday" || len(got.Weekdays) != 4 {
		t.Errorf("unexpected goal %+v", got)
	}

	sessions := sessionsOn(t, s, second.ID, "", "", "2026-10-19")
	if len(sessions) == 0 || sessions[len(sessions)-1].Kind != KindRace {
		t.Fatalf("expected a plan ending in the race, got %d sessions", len(sessions))
	}
	if sessions[0].Verdict == nil || sessions[0].Verdict.Status != VerdictPending {
		t.Errorf("expected today's session pending, got %+v", sessions[0].Verdict)
	}
	if sessions[1].Verdict.Status != VerdictPending {
		t.Errorf("expected a future session pending, got %+v", sessions[1].Verdict)
	}
}

func TestImportFillsSessionAndAdaptsNextWeek(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	monday := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]

	run := cardioRun("a", "2026-10-19", deref(monday.TargetDistanceM)/1000)
	run.PlannedSessionID = &monday.ID
	if _, err := s.SaveCardioWorkouts([]CardioWorkout{run}); err != nil {
		t.Fatal(err)
	}
	if err := s.AdaptActiveGoal("2026-10-19"); err != nil {
		t.Fatal(err)
	}

	filled := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]
	if filled.ID != monday.ID || filled.Workout == nil || filled.Workout.Samples != nil {
		t.Fatalf("expected the session filled by the run, without samples, got %+v", filled)
	}
	if filled.Verdict.Status != VerdictMet {
		t.Errorf("expected met, got %+v", filled.Verdict)
	}

	// Sessions from next week on were regenerated, this week's kept.
	thisWeek := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-25", "2026-10-19")
	if len(thisWeek) != 4 {
		t.Errorf("expected this week's 4 sessions kept, got %d", len(thisWeek))
	}
	nextWeek := sessionsOn(t, s, g.ID, "2026-10-26", "2026-11-01", "2026-10-19")
	if len(nextWeek) != 4 {
		t.Errorf("expected next week's 4 sessions regenerated, got %d", len(nextWeek))
	}
}

func TestImportIntoUnknownSessionFails(t *testing.T) {
	s := newTestStore(t)
	run := cardioRun("a", "2026-10-19", 5)
	run.PlannedSessionID = ptrInt(999)
	if _, err := s.SaveCardioWorkouts([]CardioWorkout{run}); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("expected ErrSessionNotFound, got %v", err)
	}
	if all, _ := s.ListCardioWorkouts(""); len(all) != 0 {
		t.Errorf("expected nothing saved, got %+v", all)
	}
}

func TestMatchSession(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	week := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-25", "2026-10-21")
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{cardioRun("a", "2026-10-21", 4)})
	if err != nil {
		t.Fatal(err)
	}
	id := saved[0].ID

	// Matched to Monday, then moved to Wednesday.
	if err := s.MatchSession(week[0].ID, &id, "2026-10-21"); err != nil {
		t.Fatal(err)
	}
	if err := s.MatchSession(week[1].ID, &id, "2026-10-21"); err != nil {
		t.Fatal(err)
	}
	week = sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-25", "2026-10-21")
	if week[0].CardioWorkoutID != nil || week[0].Verdict.Status != VerdictMissed {
		t.Errorf("expected Monday empty and missed, got %+v", week[0])
	}
	if week[1].CardioWorkoutID == nil || *week[1].CardioWorkoutID != id {
		t.Errorf("expected Wednesday filled, got %+v", week[1])
	}

	if err := s.MatchSession(week[1].ID, nil, "2026-10-21"); err != nil {
		t.Fatal(err)
	}
	if got := sessionsOn(t, s, g.ID, "2026-10-21", "2026-10-21", "2026-10-21")[0]; got.CardioWorkoutID != nil {
		t.Errorf("expected Wednesday emptied, got %+v", got)
	}

	if err := s.MatchSession(999, &id, "2026-10-21"); !errors.Is(err, ErrSessionNotFound) {
		t.Errorf("expected ErrSessionNotFound, got %v", err)
	}
	if err := s.MatchSession(week[1].ID, ptrInt(999), "2026-10-21"); !errors.Is(err, ErrCardioWorkoutNotFound) {
		t.Errorf("expected ErrCardioWorkoutNotFound, got %v", err)
	}
}

func TestDeleteCardioWorkout_EmptiesSession(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	monday := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]
	run := cardioRun("a", "2026-10-19", 4)
	run.PlannedSessionID = &monday.ID
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{run})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.DeleteCardioWorkout(saved[0].ID); err != nil {
		t.Fatal(err)
	}
	if got := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]; got.CardioWorkoutID != nil {
		t.Errorf("expected the session emptied, got %+v", got)
	}
}

// fillWeek fills a week's sessions with runs of share of their distance at
// the top of their pace range.
func fillWeek(t *testing.T, s *Store, goalID int, monday, sunday string, share float64) {
	t.Helper()
	for i, session := range sessionsOn(t, s, goalID, monday, sunday, sunday) {
		run := cardioRun(fmt.Sprint(monday, i), session.Date, deref(session.TargetDistanceM)*share/1000)
		run.PlannedSessionID = &session.ID
		if _, err := s.SaveCardioWorkouts([]CardioWorkout{run}); err != nil {
			t.Fatal(err)
		}
	}
}

func weekDistance(t *testing.T, s *Store, goalID int, monday, sunday string) float64 {
	t.Helper()
	total := 0.0
	for _, session := range sessionsOn(t, s, goalID, monday, sunday, monday) {
		total += deref(session.TargetDistanceM)
	}
	return total
}

func TestAdapt_HoldsVolumeAfterShortWeek(t *testing.T) {
	plan := func(share float64) float64 {
		s := newTestStore(t)
		// Started the Monday before, so week 2 (Oct 26) has a full week 1
		// before it.
		g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
		fillWeek(t, s, g.ID, "2026-10-19", "2026-10-25", share)
		// During week 2, adapting week 3 from week 2's level, judged on
		// week 1.
		if err := s.AdaptActiveGoal("2026-10-27"); err != nil {
			t.Fatal(err)
		}
		return weekDistance(t, s, g.ID, "2026-11-02", "2026-11-08") / weekDistance(t, s, g.ID, "2026-10-26", "2026-11-01")
	}

	if grown := plan(1); grown < 1.05 {
		t.Errorf("expected next week to grow after a full week, got ×%.2f", grown)
	}
	if held := plan(0.5); held > 1.05 {
		t.Errorf("expected next week held after a week at half the distance, got ×%.2f", held)
	}
}

func TestUpdateGoal_KeepsFilledSessions(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	monday := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]
	run := cardioRun("a", "2026-10-19", 4)
	run.PlannedSessionID = &monday.ID
	if _, err := s.SaveCardioWorkouts([]CardioWorkout{run}); err != nil {
		t.Fatal(err)
	}

	g.Weekdays = []string{"monday", "tuesday", "thursday", "saturday"}
	g.LongDay = "saturday"
	if _, _, err := s.UpdateGoal(g, "2026-10-19"); err != nil {
		t.Fatal(err)
	}
	sessions := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-25", "2026-10-19")
	var dates []string
	for _, session := range sessions {
		dates = append(dates, session.Date)
	}
	if len(sessions) != 4 || sessions[0].ID != monday.ID || dates[3] != "2026-10-24" {
		t.Errorf("expected the filled Monday kept and the rest moved, got %v", dates)
	}
}

func TestDeleteGoal(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	if found, err := s.DeleteGoal(g.ID); err != nil || !found {
		t.Fatalf("expected the goal deleted, got %v %v", found, err)
	}
	if active, _ := s.ActiveGoal(); active != nil {
		t.Errorf("expected no active goal, got %+v", active)
	}
	if sessions := sessionsOn(t, s, g.ID, "", "", "2026-10-19"); len(sessions) != 0 {
		t.Errorf("expected the plan deleted, got %d sessions", len(sessions))
	}
}

func TestValidateGoal(t *testing.T) {
	valid := newGoal()
	if err := ValidateGoal(valid, "2026-10-19"); err != nil {
		t.Fatalf("expected valid, got %v", err)
	}
	for name, change := range map[string]func(*Goal){
		"no name":            func(g *Goal) { g.Name = "" },
		"race in the past":   func(g *Goal) { g.RaceDate = "2026-10-01" },
		"bad date":           func(g *Goal) { g.RaceDate = "Jan 10" },
		"no legs":            func(g *Goal) { g.RunM = nil },
		"negative leg":       func(g *Goal) { g.SwimM = fp(-1) },
		"no days":            func(g *Goal) { g.Weekdays = nil },
		"long day not a day": func(g *Goal) { g.LongDay = "saturday" },
		"unknown day":        func(g *Goal) { g.Weekdays = append(g.Weekdays, "funday") },
	} {
		g := newGoal()
		change(&g)
		if err := ValidateGoal(g, "2026-10-19"); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestSetCardioDistance_JudgesSessionByIt(t *testing.T) {
	s := newTestStore(t)
	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	monday := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-19")[0]

	// A treadmill run Health has no distance for, whose samples only carry
	// heart rate.
	run := cardioRun("a", "2026-10-19", deref(monday.TargetDistanceM)/1000)
	run.DistanceM = nil
	run.Samples = []CardioSample{{T: 0, D: 0}, {T: 10, D: 0, HR: float(120)}}
	run.PlannedSessionID = &monday.ID
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{run})
	if err != nil {
		t.Fatal(err)
	}
	before := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-20")[0]
	for _, c := range before.Verdict.Checks {
		if c.Name == "Distance" {
			t.Fatalf("expected no distance check without a distance, got %+v", c)
		}
	}

	// Half the target entered by hand misses the session.
	if _, err := s.SetCardioDistance(saved[0].ID, deref(monday.TargetDistanceM)/2); err != nil {
		t.Fatal(err)
	}
	after := sessionsOn(t, s, g.ID, "2026-10-19", "2026-10-19", "2026-10-20")[0]
	if after.Verdict.Status != VerdictMissed || len(after.Verdict.Checks) == 0 || after.Verdict.Checks[0].Name != "Distance" {
		t.Errorf("expected missed on distance, got %+v", after.Verdict)
	}
}
