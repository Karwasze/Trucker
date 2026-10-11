package store

import (
	"math"
	"time"
)

// Outcomes of evaluating a logged exercise against its plan targets.
const (
	ResultProgressed = "progressed"
	ResultMissed     = "missed"
	ResultDeloaded   = "deloaded"
)

// evaluateExercise compares logged sets against a plan exercise's targets and
// returns the exercise with updated targets and miss counter, plus the
// outcome. Targets are hit when every target set is matched positionally by
// a logged set with at least as many reps at at least the same weight. The
// input is not modified.
func evaluateExercise(target PlanExercise, logged []Set) (PlanExercise, string) {
	next := target
	next.Sets = append([]Set(nil), target.Sets...)

	if hitTargets(target.Sets, logged) {
		for i := range next.Sets {
			// Round to 2 decimals so small increments don't accumulate
			// floating point drift.
			next.Sets[i].Weight = math.Round((next.Sets[i].Weight+target.WeightIncrement)*100) / 100
			next.Sets[i].Reps += target.RepsIncrement
		}
		next.ConsecutiveMisses = 0
		return next, ResultProgressed
	}

	next.ConsecutiveMisses++
	if target.DeloadAfter > 0 && next.ConsecutiveMisses >= target.DeloadAfter {
		for i := range next.Sets {
			next.Sets[i].Weight = math.Round(next.Sets[i].Weight*(1-target.DeloadPercent/100)*10) / 10
		}
		next.ConsecutiveMisses = 0
		return next, ResultDeloaded
	}
	return next, ResultMissed
}

func hitTargets(targets, logged []Set) bool {
	if len(logged) < len(targets) {
		return false
	}
	for i, target := range targets {
		if logged[i].Reps < target.Reps || logged[i].Weight < target.Weight {
			return false
		}
	}
	return true
}

// ApplyProgression evaluates the exercises of a workout logged on date
// against what the plan schedules for that weekday, and persists the
// resulting targets and miss counters. Plan exercises that were not logged,
// and logged exercises that are not in the plan, are left alone.
func (s *Store) ApplyProgression(planID int, date string, exercises []Exercise) ([]ProgressionResult, error) {
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, err
	}

	logged := make(map[string][]Set)
	for _, ex := range exercises {
		logged[ex.Name] = append(logged[ex.Name], ex.Sets...)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	type scheduled struct {
		id       int
		exercise PlanExercise
	}

	rows, err := tx.Query(`
		SELECT id, exercise_name, weight_increment, reps_increment, deload_after, deload_percent, consecutive_misses
		FROM training_plan_exercises
		WHERE plan_id = ? AND weekday = ?
		ORDER BY position
	`, planID, isoWeekday(day.Weekday()))
	if err != nil {
		return nil, err
	}
	var planned []scheduled
	for rows.Next() {
		var p scheduled
		if err := rows.Scan(&p.id, &p.exercise.Name, &p.exercise.WeightIncrement, &p.exercise.RepsIncrement,
			&p.exercise.DeloadAfter, &p.exercise.DeloadPercent, &p.exercise.ConsecutiveMisses); err != nil {
			rows.Close()
			return nil, err
		}
		planned = append(planned, p)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	results := []ProgressionResult{}
	for _, p := range planned {
		sets, ok := logged[p.exercise.Name]
		if !ok {
			continue
		}

		setIDs, err := loadTargetSets(tx, p.id, &p.exercise)
		if err != nil {
			return nil, err
		}

		updated, result := evaluateExercise(p.exercise, sets)

		if _, err := tx.Exec("UPDATE training_plan_exercises SET consecutive_misses = ? WHERE id = ?",
			updated.ConsecutiveMisses, p.id); err != nil {
			return nil, err
		}
		for i, set := range updated.Sets {
			if _, err := tx.Exec("UPDATE training_plan_sets SET reps = ?, weight = ? WHERE id = ?",
				set.Reps, set.Weight, setIDs[i]); err != nil {
				return nil, err
			}
		}

		results = append(results, ProgressionResult{Exercise: p.exercise.Name, Result: result})
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return results, nil
}

// loadTargetSets fills ex.Sets with the target sets of a plan exercise and
// returns their row IDs in the same order.
func loadTargetSets(q querier, planExerciseID int, ex *PlanExercise) ([]int, error) {
	rows, err := q.Query("SELECT id, reps, weight FROM training_plan_sets WHERE plan_exercise_id = ? ORDER BY position", planExerciseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	ex.Sets = []Set{}
	for rows.Next() {
		var id int
		var set Set
		if err := rows.Scan(&id, &set.Reps, &set.Weight); err != nil {
			return nil, err
		}
		ids = append(ids, id)
		ex.Sets = append(ex.Sets, set)
	}
	return ids, rows.Err()
}
