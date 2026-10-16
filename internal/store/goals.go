package store

import (
	"database/sql"
	"errors"
	"slices"
	"time"
)

var (
	ErrGoalNotFound    = errors.New("goal not found")
	ErrSessionNotFound = errors.New("planned session not found")
)

const (
	// A finished week below this share of its planned distance, or with
	// this many missed sessions, holds the next week's volume.
	holdBelowShare   = 0.7
	holdAfterMissed  = 2
	easedThreshold   = 0.98
	qualitySlowInRow = 2
)

// CreateGoal saves a goal starting today (YYYY-MM-DD) as the active goal,
// deactivating any other, and generates its plan. It returns the goal and
// warnings about it.
func (s *Store) CreateGoal(g Goal, today string) (Goal, []string, error) {
	g.StartDate = today
	g.Active = true
	tx, err := s.db.Begin()
	if err != nil {
		return Goal{}, nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE goals SET active = 0"); err != nil {
		return Goal{}, nil, err
	}
	weekdays, longDay, err := goalDays(g)
	if err != nil {
		return Goal{}, nil, err
	}
	result, err := tx.Exec(`
		INSERT INTO goals (name, race_date, start_date, swim_m, bike_m, run_m, weekdays, long_day, active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
	`, g.Name, g.RaceDate, g.StartDate, g.SwimM, g.BikeM, g.RunM, weekdays, longDay)
	if err != nil {
		return Goal{}, nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Goal{}, nil, err
	}
	g.ID = int(id)

	warnings, err := s.regenerate(tx, g, today, today)
	if err != nil {
		return Goal{}, nil, err
	}
	return g, warnings, tx.Commit()
}

// UpdateGoal replaces a goal's race and training days, keeping its start
// and whether it's active, and regenerates its plan from today. Sessions
// already filled are kept.
func (s *Store) UpdateGoal(g Goal, today string) (Goal, []string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Goal{}, nil, err
	}
	defer tx.Rollback()

	existing, err := getGoal(tx, g.ID)
	if err != nil {
		return Goal{}, nil, err
	}
	g.StartDate, g.Active = existing.StartDate, existing.Active
	weekdays, longDay, err := goalDays(g)
	if err != nil {
		return Goal{}, nil, err
	}
	if _, err := tx.Exec(`
		UPDATE goals SET name = ?, race_date = ?, swim_m = ?, bike_m = ?, run_m = ?, weekdays = ?, long_day = ?
		WHERE id = ?
	`, g.Name, g.RaceDate, g.SwimM, g.BikeM, g.RunM, weekdays, longDay, g.ID); err != nil {
		return Goal{}, nil, err
	}
	warnings, err := s.regenerate(tx, g, today, today)
	if err != nil {
		return Goal{}, nil, err
	}
	return g, warnings, tx.Commit()
}

// DeleteGoal deletes a goal and its plan, reporting whether it existed.
// Imported workouts are kept.
func (s *Store) DeleteGoal(id int) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM planned_sessions WHERE goal_id = ?", id); err != nil {
		return false, err
	}
	result, err := tx.Exec("DELETE FROM goals WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, tx.Commit()
}

// ListGoals returns every goal, the active one first, then by race date.
func (s *Store) ListGoals() ([]Goal, error) {
	rows, err := s.db.Query(`SELECT ` + goalColumns + ` FROM goals ORDER BY active DESC, race_date DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	goals := []Goal{}
	for rows.Next() {
		g, err := scanGoal(rows)
		if err != nil {
			return nil, err
		}
		goals = append(goals, g)
	}
	return goals, rows.Err()
}

// GetGoal returns a goal, or ErrGoalNotFound.
func (s *Store) GetGoal(id int) (Goal, error) {
	return getGoal(s.db, id)
}

// ActiveGoal returns the active goal, or nil when there is none.
func (s *Store) ActiveGoal() (*Goal, error) {
	g, err := scanGoal(s.db.QueryRow(`SELECT ` + goalColumns + ` FROM goals WHERE active = 1 ORDER BY id DESC LIMIT 1`))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// GoalSessions returns a goal's sessions from from to to (YYYY-MM-DD, ""
// for no bound), by date, each with the workout that filled it (without
// samples) and its verdict as of today.
func (s *Store) GoalSessions(goalID int, from, to, today string) ([]PlannedSession, error) {
	if to == "" {
		to = "9999-12-31"
	}
	sessions, err := querySessions(s.db, `goal_id = ? AND date >= ? AND date <= ?`, goalID, from, to)
	if err != nil {
		return nil, err
	}
	for i := range sessions {
		if err := judge(s.db, &sessions[i], today); err != nil {
			return nil, err
		}
	}
	return sessions, nil
}

// judge fills in a session's workout (without samples) and verdict.
func judge(q querier, session *PlannedSession, today string) error {
	var workout *CardioWorkout
	if session.CardioWorkoutID != nil {
		w, err := getCardioWorkout(q, *session.CardioWorkoutID)
		if err != nil && !errors.Is(err, ErrCardioWorkoutNotFound) {
			return err
		}
		if err == nil {
			workout = &w
		}
	}
	verdict := evaluateSession(*session, workout, today)
	session.Verdict = &verdict
	if workout != nil {
		summary := *workout
		summary.Samples, summary.Laps = nil, nil
		session.Workout = &summary
	}
	return nil
}

// MatchSession makes a cardio workout fill a planned session, taking it off
// any session it filled before, or empties the session for a nil cardioID.
// The goal's plan from next week is regenerated from what was done.
func (s *Store) MatchSession(sessionID int, cardioID *int, today string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var goalID int
	if err := tx.QueryRow("SELECT goal_id FROM planned_sessions WHERE id = ?", sessionID).Scan(&goalID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrSessionNotFound
		}
		return err
	}
	if cardioID != nil {
		var exists int
		if err := tx.QueryRow("SELECT COUNT(*) FROM cardio_workouts WHERE id = ?", *cardioID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return ErrCardioWorkoutNotFound
		}
		if _, err := tx.Exec("UPDATE planned_sessions SET cardio_workout_id = NULL WHERE cardio_workout_id = ?", *cardioID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("UPDATE planned_sessions SET cardio_workout_id = ? WHERE id = ?", cardioID, sessionID); err != nil {
		return err
	}
	if err := s.adapt(tx, goalID, today); err != nil {
		return err
	}
	return tx.Commit()
}

// AdaptActiveGoal regenerates the active goal's plan from next week, after
// workouts were imported into it.
func (s *Store) AdaptActiveGoal(today string) error {
	goal, err := s.ActiveGoal()
	if err != nil || goal == nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := s.adapt(tx, goal.ID, today); err != nil {
		return err
	}
	return tx.Commit()
}

// adapt regenerates a goal's plan from the Monday after today.
func (s *Store) adapt(tx *sql.Tx, goalID int, today string) error {
	g, err := getGoal(tx, goalID)
	if err != nil {
		return err
	}
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return err
	}
	from := mondayOf(now).AddDate(0, 0, 7).Format(dateLayout)
	if from > g.RaceDate {
		return nil
	}
	_, err = s.regenerate(tx, g, from, today)
	return err
}

// regenerate replaces the goal's sessions from from (YYYY-MM-DD) that
// weren't filled yet with a fresh plan, continuing from the volume of the
// last full week planned before it and adapting to how the last finished
// week and the last quality sessions went (see generatePlan).
func (s *Store) regenerate(tx *sql.Tx, g Goal, from, today string) ([]string, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return nil, err
	}
	start, err := time.Parse(dateLayout, from)
	if err != nil {
		return nil, err
	}
	cardio, err := cardioBetween(tx, "", today)
	if err != nil {
		return nil, err
	}
	fitness := estimateFitness(cardio, now)

	if _, err := tx.Exec(`DELETE FROM planned_sessions
		WHERE goal_id = ? AND date >= ? AND cardio_workout_id IS NULL`, g.ID, from); err != nil {
		return nil, err
	}
	past, err := querySessions(tx, "goal_id = ?", g.ID)
	if err != nil {
		return nil, err
	}

	in := generatorInput{Goal: g, From: start, Fitness: fitness}
	goalStart, _ := time.Parse(dateLayout, g.StartDate)
	race, _ := time.Parse(dateLayout, g.RaceDate)
	weeks := planWeeks(goalStart, race, taperWeeks(g, fitness))
	in.PrevLevel = previousLevel(past, weeks, start)

	// How the last finished week and quality sessions went, judged with
	// their workouts.
	lastWeek := mondayOf(now).AddDate(0, 0, -7).Format(dateLayout)
	thisWeek := mondayOf(now).Format(dateLayout)
	var planned, done float64
	missed := 0
	var quality []PlannedSession
	for i := range past {
		p := &past[i]
		if p.Date >= today || p.Kind == KindRace {
			continue
		}
		if err := judge(tx, p, today); err != nil {
			return nil, err
		}
		if p.Kind == KindTempo || p.Kind == KindIntervals {
			quality = append(quality, *p)
		}
		if p.Date < lastWeek || p.Date >= thisWeek {
			continue
		}
		planned += deref(p.TargetDistanceM)
		if p.Workout != nil {
			done += deref(p.Workout.DistanceM)
		}
		if p.Verdict.Status == VerdictMissed {
			missed++
		}
	}
	in.Hold = in.PrevLevel != nil && planned > 0 && (done < planned*holdBelowShare || missed >= holdAfterMissed)

	if len(quality) >= qualitySlowInRow {
		recent := quality[len(quality)-qualitySlowInRow:]
		slow := true
		for _, q := range recent {
			slow = slow && q.Verdict.TooSlow
		}
		if slow {
			in.EaseQuality = true
			for _, q := range recent {
				if threshold, ok := fitness.Threshold[q.Activity]; ok {
					fitness.Threshold[q.Activity] = threshold * easedThreshold
				}
			}
			in.Fitness = fitness
		}
	}

	sessions, warnings := generatePlan(in)
	// Filled sessions stay, so don't plan the same activity on their day
	// again.
	kept := make(map[string]bool)
	for _, p := range past {
		if p.Date >= from {
			kept[p.Date+p.Activity] = true
		}
	}
	for _, session := range sessions {
		if kept[session.Date+session.Activity] {
			continue
		}
		session.GoalID = g.ID
		if err := insertSession(tx, session); err != nil {
			return nil, err
		}
	}
	if warnings == nil {
		warnings = []string{}
	}
	return warnings, nil
}

// previousLevel is the weekly distance per activity of the last week before
// from that was a full training week (not a recovery week), or nil when
// none was planned.
func previousLevel(sessions []PlannedSession, weeks []planWeek, from time.Time) map[string]float64 {
	for i := weekIndex(weeks, from) - 1; i >= 0; i-- {
		w := weeks[i]
		if w.recovery || !isTraining(w.phase) {
			continue
		}
		start, end := w.monday.Format(dateLayout), w.monday.AddDate(0, 0, 7).Format(dateLayout)
		level := make(map[string]float64)
		for _, s := range sessions {
			if s.Date >= start && s.Date < end && s.Kind != KindBrick {
				level[s.Activity] += deref(s.TargetDistanceM)
			}
		}
		// The goal's first week may have started mid-week; it's no guide.
		if len(level) > 0 && i > 0 {
			return level
		}
		return nil
	}
	return nil
}

// goalDays encodes a goal's training days as a bitmask (bit 0 = Monday) and
// its long day as 1 (Monday) to 7.
func goalDays(g Goal) (int, int, error) {
	mask := 0
	for _, day := range g.Weekdays {
		n, err := weekdayNumber(day)
		if err != nil {
			return 0, 0, err
		}
		mask |= 1 << (n - 1)
	}
	longDay, err := weekdayNumber(g.LongDay)
	return mask, longDay, err
}

const goalColumns = `id, name, race_date, start_date, swim_m, bike_m, run_m, weekdays, long_day, active`

func getGoal(q querier, id int) (Goal, error) {
	g, err := scanGoal(q.QueryRow(`SELECT `+goalColumns+` FROM goals WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Goal{}, ErrGoalNotFound
	}
	return g, err
}

func scanGoal(row interface{ Scan(...any) error }) (Goal, error) {
	var g Goal
	var mask, longDay int
	if err := row.Scan(&g.ID, &g.Name, &g.RaceDate, &g.StartDate, &g.SwimM, &g.BikeM, &g.RunM,
		&mask, &longDay, &g.Active); err != nil {
		return Goal{}, err
	}
	g.Weekdays = []string{}
	for i, name := range weekdayNames {
		if mask&(1<<i) != 0 {
			g.Weekdays = append(g.Weekdays, name)
		}
	}
	if longDay >= 1 && longDay <= 7 {
		g.LongDay = weekdayNames[longDay-1]
	}
	return g, nil
}

const sessionColumns = `id, goal_id, date, activity, kind, phase, target_distance_m, target_duration_s,
	intensity, description, speed_min, speed_max, hr_min, hr_max, reps, rep_distance_m, rep_duration_s,
	recovery_s, cardio_workout_id`

// querySessions returns the sessions matching where, by date then ID.
func querySessions(q querier, where string, args ...any) ([]PlannedSession, error) {
	rows, err := q.Query(`SELECT `+sessionColumns+` FROM planned_sessions WHERE `+where+` ORDER BY date, id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := []PlannedSession{}
	for rows.Next() {
		var p PlannedSession
		if err := rows.Scan(&p.ID, &p.GoalID, &p.Date, &p.Activity, &p.Kind, &p.Phase, &p.TargetDistanceM,
			&p.TargetDurationS, &p.Intensity, &p.Description, &p.SpeedMin, &p.SpeedMax, &p.HRMin, &p.HRMax,
			&p.Reps, &p.RepDistanceM, &p.RepDurationS, &p.RecoveryS, &p.CardioWorkoutID); err != nil {
			return nil, err
		}
		sessions = append(sessions, p)
	}
	return sessions, rows.Err()
}

func insertSession(tx *sql.Tx, p PlannedSession) error {
	_, err := tx.Exec(`
		INSERT INTO planned_sessions (goal_id, date, activity, kind, phase, target_distance_m,
			target_duration_s, intensity, description, speed_min, speed_max, hr_min, hr_max, reps,
			rep_distance_m, rep_duration_s, recovery_s, cardio_workout_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, p.GoalID, p.Date, p.Activity, p.Kind, p.Phase, p.TargetDistanceM, p.TargetDurationS, p.Intensity,
		p.Description, p.SpeedMin, p.SpeedMax, p.HRMin, p.HRMax, p.Reps, p.RepDistanceM, p.RepDurationS,
		p.RecoveryS, p.CardioWorkoutID)
	return err
}

// goalLegsValid reports whether a goal has at least one positive leg and
// none negative.
func goalLegsValid(g Goal) bool {
	positive := false
	for _, leg := range []*float64{g.SwimM, g.BikeM, g.RunM} {
		if leg == nil {
			continue
		}
		if *leg < 0 {
			return false
		}
		positive = positive || *leg > 0
	}
	return positive
}

// ValidateGoal checks a goal can be planned from today: a name, a race
// after today, at least one leg, known training days including the long
// day.
func ValidateGoal(g Goal, today string) error {
	switch {
	case g.Name == "":
		return errors.New("name is required")
	case !validDateString(g.RaceDate):
		return errors.New("race_date must be YYYY-MM-DD")
	case g.RaceDate <= today:
		return errors.New("race_date must be after today")
	case !goalLegsValid(g):
		return errors.New("set at least one of swim_m, bike_m and run_m")
	case len(g.Weekdays) == 0:
		return errors.New("pick at least one training day")
	case !slices.Contains(g.Weekdays, g.LongDay):
		return errors.New("long_day must be one of the training days")
	}
	for _, day := range g.Weekdays {
		if !IsWeekday(day) {
			return errors.New("unknown weekday " + day)
		}
	}
	return nil
}

func validDateString(date string) bool {
	_, err := time.Parse(dateLayout, date)
	return err == nil
}
