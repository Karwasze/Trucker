package store

import (
	"fmt"
	"math"
	"strconv"
	"time"
)

// Outcomes of a logged session of a plan exercise.
const (
	ResultProgressed = "progressed"
	ResultMissed     = "missed"
	ResultDeloaded   = "deloaded"
)

const (
	// defaultWeightStep is used until an exercise's history shows a weight
	// increase to learn the step from.
	defaultWeightStep = 2.5
	// deloadAfterMisses consecutive misses at the same weight trigger a
	// deload of deloadFraction.
	deloadAfterMisses = 3
	deloadFraction    = 0.10
)

// nextTarget works out the next target sets for a plan exercise from its
// logged sessions (oldest first, one slice of sets per workout), along with
// the outcome of the most recent session ("" when there is none) and a short
// explanation of the target for the lifter.
//
// The working weight of a session is its heaviest set, and the session hit
// the scheme when at least scheme.Sets sets reached scheme.Reps at that
// weight. Progression is double progression on that scheme:
//
//   - hit: add the weight step, at the planned reps
//   - missed: same weight, one more rep on each set short of the planned reps
//   - missed deloadAfterMisses times in a row at the same weight: drop the
//     weight by deloadFraction, at the planned reps
//
// Bodyweight sessions (a working weight of 0) have no weight to add or drop:
// a hit adds a rep to each set of the last session instead (never below the
// planned reps), and misses never deload.
//
// The weight step is the most common increase between consecutive sessions'
// working weights, so it follows the plates the lifter actually adds.
// Without history the weight is left at 0 for the lifter to fill in.
func nextTarget(scheme PlanExercise, sessions [][]Set) ([]Set, string, string) {
	if len(sessions) == 0 {
		return uniformSets(scheme, 0), "", "No history yet: pick a starting weight."
	}

	last := sessions[len(sessions)-1]
	weight := workingWeight(last)
	planned := fmt.Sprintf("%d × %d", scheme.Sets, scheme.Reps)
	if weight > 0 {
		planned += " @ " + formatKg(weight)
	}
	if hitScheme(last, weight, scheme) {
		if weight == 0 {
			working := workSets(last, weight)
			target := make([]Set, scheme.Sets)
			for i := range target {
				target[i] = Set{Reps: max(working[i].Reps+1, scheme.Reps)}
			}
			return target, ResultProgressed,
				fmt.Sprintf("One more rep per set: you completed %s last time.", planned)
		}
		step := weightStep(sessions)
		return uniformSets(scheme, roundWeight(weight+step)), ResultProgressed,
			fmt.Sprintf("Weight up %s: you completed %s last time.", formatKg(step), planned)
	}

	misses := 0
	for i := len(sessions) - 1; i >= 0; i-- {
		session := sessions[i]
		if workingWeight(session) != weight || hitScheme(session, weight, scheme) {
			break
		}
		misses++
	}
	if misses >= deloadAfterMisses && weight > 0 {
		step := weightStep(sessions)
		deloaded := roundWeight(math.Round(weight*(1-deloadFraction)/step) * step)
		if deloaded >= weight {
			deloaded = roundWeight(weight - step)
		}
		return uniformSets(scheme, math.Max(deloaded, 0)), ResultDeloaded,
			fmt.Sprintf("Deloading: you missed %s %d sessions in a row.", planned, misses)
	}

	working := workSets(last, weight)
	target := make([]Set, scheme.Sets)
	for i := range target {
		previous := working[min(i, len(working)-1)]
		target[i] = Set{Reps: min(previous.Reps+1, scheme.Reps), Weight: weight}
	}
	reason := fmt.Sprintf("You didn't finish %s last time: same weight, one more rep on short sets.", planned)
	if weight == 0 {
		reason = fmt.Sprintf("You didn't finish %s last time: one more rep on short sets.", planned)
	} else if left := deloadAfterMisses - misses; left == 1 {
		reason += " One more miss deloads."
	} else {
		reason += fmt.Sprintf(" %d more misses deload.", left)
	}
	return target, ResultMissed, reason
}

// formatKg formats a weight without trailing zeros, e.g. "102.5 kg".
func formatKg(weight float64) string {
	return strconv.FormatFloat(weight, 'f', -1, 64) + " kg"
}

func uniformSets(scheme PlanExercise, weight float64) []Set {
	sets := make([]Set, scheme.Sets)
	for i := range sets {
		sets[i] = Set{Reps: scheme.Reps, Weight: weight}
	}
	return sets
}

func workingWeight(sets []Set) float64 {
	weight := 0.0
	for _, set := range sets {
		weight = math.Max(weight, set.Weight)
	}
	return weight
}

// workSets returns the sets done at the working weight, in logged order.
func workSets(sets []Set, weight float64) []Set {
	var working []Set
	for _, set := range sets {
		if set.Weight >= weight {
			working = append(working, set)
		}
	}
	return working
}

func hitScheme(sets []Set, weight float64, scheme PlanExercise) bool {
	hits := 0
	for _, set := range workSets(sets, weight) {
		if set.Reps >= scheme.Reps {
			hits++
		}
	}
	return hits >= scheme.Sets
}

// weightStep returns the most common increase between consecutive sessions'
// working weights, preferring the smaller step on a tie, or
// defaultWeightStep when the weight has never gone up.
func weightStep(sessions [][]Set) float64 {
	counts := make(map[float64]int)
	for i := 1; i < len(sessions); i++ {
		if increase := roundWeight(workingWeight(sessions[i]) - workingWeight(sessions[i-1])); increase > 0 {
			counts[increase]++
		}
	}

	step, best := defaultWeightStep, 0
	for increase, count := range counts {
		if count > best || (count == best && increase < step) {
			step, best = increase, count
		}
	}
	return step
}

// roundWeight rounds to 2 decimals so repeated small steps don't accumulate
// floating point drift.
func roundWeight(weight float64) float64 {
	return math.Round(weight*100) / 100
}

// ExerciseTargets works out the target sets for each plan exercise from the
// exercise's logged workouts on or before date, whether or not they were
// logged against a plan.
func (s *Store) ExerciseTargets(exercises []PlanExercise, date string) ([]ExerciseTarget, error) {
	targets := []ExerciseTarget{}
	for _, ex := range exercises {
		sessions, err := s.exerciseSessions(ex.Name, date, 0)
		if err != nil {
			return nil, err
		}
		sets, _, reason := nextTarget(ex, sessions)
		targets = append(targets, ExerciseTarget{Name: ex.Name, Sets: sets, Reason: reason})
	}
	return targets, nil
}

// freeExerciseTarget works out the next target sets for an exercise logged
// outside a plan and the reason for them, or nil without history. The scheme is taken from the most
// recent session: as many sets as were done at its working weight, at the
// most reps any of them reached, progressed the same way as a plan exercise.
func freeExerciseTarget(sessions [][]Set) ([]Set, string) {
	if len(sessions) == 0 {
		return nil, ""
	}
	last := sessions[len(sessions)-1]
	working := workSets(last, workingWeight(last))
	scheme := PlanExercise{Sets: len(working)}
	for _, set := range working {
		scheme.Reps = max(scheme.Reps, set.Reps)
	}
	sets, _, reason := nextTarget(scheme, sessions)
	return sets, reason
}

// FreeExerciseTarget works out the target sets for an exercise added outside
// a plan from its logged workouts on or before date, and the reason for
// them, or nil without history.
func (s *Store) FreeExerciseTarget(name, date string) ([]Set, string, error) {
	sessions, err := s.exerciseSessions(name, date, 0)
	if err != nil {
		return nil, "", err
	}
	sets, reason := freeExerciseTarget(sessions)
	return sets, reason, nil
}

// EvaluateProgression reports how a logged workout went for each exercise
// the plan schedules on its weekday. Plan exercises that were not logged,
// and logged exercises that are not in the plan, are left out. Nothing is
// stored: the next targets follow from the workout itself.
func (s *Store) EvaluateProgression(planID int, workout Workout) ([]ProgressionResult, error) {
	date, err := time.Parse("2006-01-02", workout.Date)
	if err != nil {
		return nil, err
	}
	day, err := s.GetPlanDay(planID, date)
	if err != nil {
		return nil, err
	}

	logged := make(map[string]bool)
	for _, ex := range workout.Exercises {
		logged[ex.Name] = true
	}

	results := []ProgressionResult{}
	for _, ex := range day.Exercises {
		if !logged[ex.Name] {
			continue
		}
		// Only history up to this workout counts, so later workouts on the
		// same date don't change its outcome.
		sessions, err := s.exerciseSessions(ex.Name, workout.Date, workout.ID)
		if err != nil {
			return nil, err
		}
		_, result, _ := nextTarget(ex, sessions)
		results = append(results, ProgressionResult{Exercise: ex.Name, Result: result})
	}
	return results, nil
}

// exerciseSessions returns the sets logged for an exercise in each workout
// on or before date, oldest first, merging repeated entries of the exercise
// within a workout. A non-zero lastWorkoutID also leaves out workouts on
// date that were logged after it.
func (s *Store) exerciseSessions(name, date string, lastWorkoutID int) ([][]Set, error) {
	rows, err := s.db.Query(`
		SELECT w.id, s.reps, s.weight
		FROM workouts w
		JOIN exercises e ON e.workout_id = w.id
		JOIN sets s ON s.exercise_id = e.id
		WHERE e.name = ? AND (w.date < ? OR (w.date = ? AND (? = 0 OR w.id <= ?)))
		ORDER BY w.date, w.id, e.id, s.id
	`, name, date, date, lastWorkoutID, lastWorkoutID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions [][]Set
	lastID := -1
	for rows.Next() {
		var workoutID int
		var set Set
		if err := rows.Scan(&workoutID, &set.Reps, &set.Weight); err != nil {
			return nil, err
		}
		if workoutID != lastID {
			sessions = append(sessions, nil)
			lastID = workoutID
		}
		sessions[len(sessions)-1] = append(sessions[len(sessions)-1], set)
	}
	return sessions, rows.Err()
}
