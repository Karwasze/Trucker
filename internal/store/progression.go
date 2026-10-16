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
	ResultReturning  = "returning"
)

const (
	// defaultWeightStep is used until an exercise's history shows a weight
	// increase to learn the step from.
	defaultWeightStep = 2.5
	// deloadAfterMisses consecutive misses at the same weight trigger a
	// deload of deloadFraction.
	deloadAfterMisses = 3
	deloadFraction    = 0.10
	// A weight increase only counts towards the step if it is at most
	// maxStepFraction of the previous weight or maxStepKg, whichever is
	// larger; bigger jumps are a new starting weight, not a plate increment.
	maxStepFraction = 0.10
	maxStepKg       = 5
)

// layoffs are how much lighter to go after time away from an exercise,
// longest break first. Shorter breaks progress as usual.
var layoffs = []struct {
	days     int
	fraction float64
}{
	{56, 0.30},
	{28, 0.20},
	{14, 0.10},
}

// nextTarget works out the next target sets for a plan exercise from its
// logged sessions (oldest first, one slice of sets per workout), along with
// the outcome of the most recent session ("" when there is none) and a short
// explanation of the target for the lifter. daysOff is how long it has
// been since the last session.
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
// After a break of two weeks or more (see layoffs), the target eases back
// in instead: the last working weight drops by the layoff's fraction, at the
// planned reps, whether or not the last session hit.
//
// Bodyweight sessions (a working weight of 0) have no weight to add or drop:
// a hit adds a rep to each set of the last session instead (never below the
// planned reps), misses never deload, and breaks drop the reps of the last
// session by the layoff's fraction.
//
// The weight step is the most common increase between consecutive sessions'
// working weights, so it follows the plates the lifter actually adds.
// Without history the weight is left at 0 for the lifter to fill in.
func nextTarget(scheme PlanExercise, sessions [][]Set, daysOff int) ([]Set, string, string) {
	if len(sessions) == 0 {
		return uniformSets(scheme, 0), "", "No history yet: pick a starting weight."
	}

	last := sessions[len(sessions)-1]
	weight := workingWeight(last)
	if fraction := layoffFraction(daysOff); fraction > 0 {
		back := fmt.Sprintf("Back after %d weeks off: ", daysOff/7)
		if weight == 0 {
			working := workSets(last, weight)
			target := make([]Set, scheme.Sets)
			for i := range target {
				previous := working[min(i, len(working)-1)]
				target[i] = Set{Reps: max(int(math.Round(float64(previous.Reps)*(1-fraction))), 1)}
			}
			return target, ResultReturning,
				back + fmt.Sprintf("%.0f%% fewer reps to ease back in.", fraction*100)
		}
		return uniformSets(scheme, reduceWeight(weight, fraction, weightStep(sessions))), ResultReturning,
			back + fmt.Sprintf("weight down %.0f%% from %s to ease back in.", fraction*100, formatKg(weight))
	}

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

	misses := consecutiveMisses(scheme, sessions, weight)
	if misses >= deloadAfterMisses && weight > 0 {
		return uniformSets(scheme, reduceWeight(weight, deloadFraction, weightStep(sessions))), ResultDeloaded,
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

// consecutiveMisses counts the most recent sessions that missed scheme in a
// row at weight.
func consecutiveMisses(scheme PlanExercise, sessions [][]Set, weight float64) int {
	misses := 0
	for i := len(sessions) - 1; i >= 0; i-- {
		session := sessions[i]
		if workingWeight(session) != weight || hitScheme(session, weight, scheme) {
			break
		}
		misses++
	}
	return misses
}

// layoffFraction returns how much lighter to go after daysOff away from an
// exercise, or 0 when the break is too short to matter.
func layoffFraction(daysOff int) float64 {
	for _, layoff := range layoffs {
		if daysOff >= layoff.days {
			return layoff.fraction
		}
	}
	return 0
}

// reduceWeight drops weight by fraction, rounded to step but always at least
// one step lighter, and never below 0.
func reduceWeight(weight, fraction, step float64) float64 {
	reduced := roundWeight(math.Round(weight*(1-fraction)/step) * step)
	if reduced >= weight {
		reduced = roundWeight(weight - step)
	}
	return math.Max(reduced, 0)
}

// daysOff returns the whole days from the last session, logged on lastDate,
// to date (both YYYY-MM-DD), or 0 without a last session.
func daysOff(lastDate, date string) (int, error) {
	if lastDate == "" {
		return 0, nil
	}
	start, err := time.Parse("2006-01-02", lastDate)
	if err != nil {
		return 0, err
	}
	end, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0, err
	}
	return int(end.Sub(start).Hours() / 24), nil
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
// defaultWeightStep when the weight has never gone up. Jumps too big to be a
// plate increment (see maxStepFraction) are left out.
func weightStep(sessions [][]Set) float64 {
	counts := make(map[float64]int)
	for i := 1; i < len(sessions); i++ {
		previous := workingWeight(sessions[i-1])
		increase := roundWeight(workingWeight(sessions[i]) - previous)
		if increase > 0 && increase <= math.Max(previous*maxStepFraction, maxStepKg) {
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

// sessionsInScheme keeps the sessions that were done in scheme, out of the
// schemes a plan trains the exercise in (other exercises in schemes are
// ignored), so a lift trained heavy one day and light another progresses
// each day from its own sessions. With a single scheme for the exercise,
// every session is kept.
//
// Nothing records which scheme a session was aimed at, so each session goes
// to the scheme closest to its shape: the most reps of any set at its
// working weight closest to the scheme's reps, then its number of sets at
// that weight closest to the scheme's sets, preferring more sets on a tie
// since a miss leaves sets out rather than adding them.
func sessionsInScheme(sessions [][]Set, scheme PlanExercise, schemes []PlanExercise) [][]Set {
	candidates := []PlanExercise{scheme}
	for _, other := range schemes {
		if other.Name == scheme.Name && (other.Sets != scheme.Sets || other.Reps != scheme.Reps) {
			candidates = append(candidates, other)
		}
	}
	if len(candidates) == 1 {
		return sessions
	}

	var kept [][]Set
	for _, session := range sessions {
		working := workSets(session, workingWeight(session))
		reps := 0
		for _, set := range working {
			reps = max(reps, set.Reps)
		}
		closest := candidates[0]
		for _, candidate := range candidates[1:] {
			repsOff, closestRepsOff := absInt(candidate.Reps-reps), absInt(closest.Reps-reps)
			setsOff, closestSetsOff := absInt(candidate.Sets-len(working)), absInt(closest.Sets-len(working))
			if repsOff < closestRepsOff || (repsOff == closestRepsOff &&
				(setsOff < closestSetsOff || (setsOff == closestSetsOff && candidate.Sets > closest.Sets))) {
				closest = candidate
			}
		}
		if closest.Sets == scheme.Sets && closest.Reps == scheme.Reps {
			kept = append(kept, session)
		}
	}
	return kept
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// ExerciseTargets works out the target sets for each plan exercise from the
// exercise's logged workouts on or before date, whether or not they were
// logged against a plan. schemes are all the exercises of the plan, so an
// exercise the plan trains in more than one scheme progresses each scheme
// from its own sessions (see sessionsInScheme); breaks still count from the
// last session in any scheme.
func (s *Store) ExerciseTargets(exercises, schemes []PlanExercise, date string) ([]ExerciseTarget, error) {
	targets := []ExerciseTarget{}
	for _, ex := range exercises {
		all, lastDate, err := s.exerciseSessions(ex.Name, date, 0)
		if err != nil {
			return nil, err
		}
		off, err := daysOff(lastDate, date)
		if err != nil {
			return nil, err
		}
		sessions := sessionsInScheme(all, ex, schemes)
		sets, _, reason := nextTarget(ex, sessions, off)
		if len(sessions) == 0 && len(all) > 0 {
			reason = fmt.Sprintf("No %d × %d history yet: pick a starting weight.", ex.Sets, ex.Reps)
		}
		targets = append(targets, ExerciseTarget{Name: ex.Name, Sets: sets, Reason: reason})
	}
	return targets, nil
}

// freeExerciseTarget works out the next target sets for an exercise logged
// outside a plan and the reason for them, or nil without history, daysOff
// after the last session. The scheme is taken from the most
// recent session: as many sets as were done at its working weight, at the
// most reps any of them reached, progressed the same way as a plan exercise.
func freeExerciseTarget(sessions [][]Set, daysOff int) ([]Set, string) {
	if len(sessions) == 0 {
		return nil, ""
	}
	last := sessions[len(sessions)-1]
	working := workSets(last, workingWeight(last))
	scheme := PlanExercise{Sets: len(working)}
	for _, set := range working {
		scheme.Reps = max(scheme.Reps, set.Reps)
	}
	sets, _, reason := nextTarget(scheme, sessions, daysOff)
	return sets, reason
}

// FreeExerciseTarget works out the target sets for an exercise added outside
// a plan from its logged workouts on or before date, and the reason for
// them, or nil without history.
func (s *Store) FreeExerciseTarget(name, date string) ([]Set, string, error) {
	sessions, lastDate, err := s.exerciseSessions(name, date, 0)
	if err != nil {
		return nil, "", err
	}
	off, err := daysOff(lastDate, date)
	if err != nil {
		return nil, "", err
	}
	sets, reason := freeExerciseTarget(sessions, off)
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
	plan, err := s.GetPlan(planID)
	if err != nil {
		return nil, err
	}
	day := plan.Day(date)

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
		// same date don't change its outcome. The workout itself is the
		// last session, so no break applies. It is judged against the day's
		// scheme whatever its shape, and earlier sessions only when they
		// were done in that scheme.
		sessions, _, err := s.exerciseSessions(ex.Name, workout.Date, workout.ID)
		if err != nil {
			return nil, err
		}
		if n := len(sessions); n > 0 {
			sessions = append(sessionsInScheme(sessions[:n-1], ex, plan.Exercises()), sessions[n-1])
		}
		_, result, _ := nextTarget(ex, sessions, 0)
		results = append(results, ProgressionResult{Exercise: ex.Name, Result: result})
	}
	return results, nil
}

// exerciseSessions returns the sets logged for an exercise in each workout
// on or before date, oldest first, merging repeated entries of the exercise
// within a workout, and the date of the last of them ("" when there are
// none). A non-zero lastWorkoutID also leaves out workouts on
// date that were logged after it.
func (s *Store) exerciseSessions(name, date string, lastWorkoutID int) ([][]Set, string, error) {
	rows, err := s.db.Query(`
		SELECT w.id, w.date, s.reps, s.weight
		FROM workouts w
		JOIN exercises e ON e.workout_id = w.id
		JOIN sets s ON s.exercise_id = e.id
		WHERE e.name = ? AND (w.date < ? OR (w.date = ? AND (? = 0 OR w.id <= ?)))
		ORDER BY w.date, w.id, e.id, s.id
	`, name, date, date, lastWorkoutID, lastWorkoutID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var sessions [][]Set
	var lastDate string
	lastID := -1
	for rows.Next() {
		var workoutID int
		var set Set
		if err := rows.Scan(&workoutID, &lastDate, &set.Reps, &set.Weight); err != nil {
			return nil, "", err
		}
		if workoutID != lastID {
			sessions = append(sessions, nil)
			lastID = workoutID
		}
		sessions[len(sessions)-1] = append(sessions[len(sessions)-1], set)
	}
	return sessions, lastDate, rows.Err()
}
