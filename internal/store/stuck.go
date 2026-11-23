package store

import (
	"fmt"
	"math"
)

// smallerSetsToComplete is how many sessions of the smaller scheme a stuck
// lift completes before going back to its plan scheme.
const smallerSetsToComplete = 2

// stuck is a lift that keeps missing at weight even after deloading from it
// (see findStuck).
type stuck struct {
	weight float64
	// best is the shape of the session with the most reps at weight before
	// the first deload.
	best PlanExercise
	// firstAtTop is the index of the first session at weight.
	firstAtTop int
	deloads    int
}

// findStuck reports whether a lift is stuck at its top working weight in
// sessions (oldest first): it was deloaded (dropped straight from that
// weight to a lighter one) at least once, and since the first deload it came
// back to the weight and fell short of the most reps it did there before,
// without ever beating them or going heavier. Reps are counted over the sets
// at the weight, so this needs no plan scheme.
//
// A block of smaller sets (see smallerScheme) that was followed by the usual
// scheme again ends the stall: only the sessions after it count.
func findStuck(sessions [][]Set) (stuck, bool) {
	top := 0.0
	for _, s := range sessions {
		top = math.Max(top, workingWeight(s))
	}
	repsAt := func(s []Set) int {
		if workingWeight(s) != top {
			return -1
		}
		total := 0
		for _, set := range workSets(s, top) {
			total += set.Reps
		}
		return total
	}

	firstAtTop, firstDeload, deloads := -1, -1, 0
	for i, s := range sessions {
		atTop := workingWeight(s) == top
		if atTop && firstAtTop < 0 {
			firstAtTop = i
		}
		if i > 0 && !atTop && workingWeight(sessions[i-1]) == top {
			deloads++
			if firstDeload < 0 {
				firstDeload = i
			}
		}
	}
	if deloads == 0 || top == 0 {
		return stuck{}, false
	}

	bestReps, best := -1, sessions[firstAtTop]
	for _, s := range sessions[firstAtTop:firstDeload] {
		if reps := repsAt(s); reps > bestReps {
			bestReps, best = reps, s
		}
	}
	missed := false
	for _, s := range sessions[firstDeload:] {
		reps := repsAt(s)
		if reps > bestReps {
			return stuck{}, false
		}
		if reps >= 0 && reps < bestReps {
			missed = true
		}
	}
	if !missed {
		return stuck{}, false
	}

	found := stuck{weight: top, best: sessionScheme(best), firstAtTop: firstAtTop, deloads: deloads}
	lastSmaller := -1
	for i := firstDeload; i < len(sessions); i++ {
		if smallerShaped(sessions[i], found.best) {
			lastSmaller = i
		}
	}
	if lastSmaller >= 0 && lastSmaller < len(sessions)-1 {
		after, ok := findStuck(sessions[lastSmaller+1:])
		after.firstAtTop += lastSmaller + 1
		return after, ok
	}
	return found, true
}

// smallerScheme is the scheme a stuck lift switches to: about the same reps
// in sets one rep shorter (4 × 3 becomes 6 × 2), or two more singles.
func smallerScheme(scheme PlanExercise) PlanExercise {
	if scheme.Reps <= 1 {
		return PlanExercise{Name: scheme.Name, Sets: scheme.Sets + 2, Reps: 1}
	}
	reps := scheme.Reps - 1
	return PlanExercise{Name: scheme.Name, Sets: (scheme.Sets*scheme.Reps + reps - 1) / reps, Reps: reps}
}

// smallerShaped reports whether a session was done in scheme's smaller sets
// rather than scheme itself: more sets than scheme, none past the smaller
// scheme's reps.
func smallerShaped(session []Set, scheme PlanExercise) bool {
	shape := sessionScheme(session)
	return shape.Sets > scheme.Sets && shape.Reps <= smallerScheme(scheme).Reps
}

// planTarget is nextTargetUpTo for a plan exercise, switching a stuck lift
// (see findStuck) to smaller sets: when the last session missed scheme at the
// weight it is stuck at, the target is the smallerScheme at that weight
// until it has been completed smallerSetsToComplete times, then scheme at
// that weight again. Layoffs ease back in as usual.
func planTarget(scheme PlanExercise, sessions [][]Set, daysOff int, maxWeight float64) ([]Set, string, string) {
	if len(sessions) == 0 || layoffFraction(daysOff) > 0 {
		return nextTargetUpTo(scheme, sessions, daysOff, maxWeight)
	}
	small := smallerScheme(scheme)
	planned := fmt.Sprintf("%d × %d", scheme.Sets, scheme.Reps)
	smaller := fmt.Sprintf("%d × %d", small.Sets, small.Reps)
	last := sessions[len(sessions)-1]

	block := 0
	for block < len(sessions) && smallerShaped(sessions[len(sessions)-1-block], scheme) {
		block++
	}
	if block > 0 {
		stalled, ok := findStuck(sessions[:len(sessions)-block])
		if !ok {
			return nextTargetUpTo(scheme, sessions, daysOff, maxWeight)
		}
		weight := stalled.weight
		completed := func(s []Set) bool {
			return workingWeight(s) >= weight && hitScheme(s, workingWeight(s), small)
		}
		done := 0
		for _, s := range sessions[len(sessions)-block:] {
			if completed(s) {
				done++
			}
		}
		result := ResultMissed
		if completed(last) {
			result = ResultProgressed
		}
		if done >= smallerSetsToComplete {
			return uniformSets(scheme, weight), result,
				fmt.Sprintf("You completed %s @ %s %s: back to %s.", smaller, formatKg(weight), times(done), planned)
		}
		return uniformSets(small, weight), result,
			fmt.Sprintf("Stuck at %s: %s until you complete it %s (%d done), then back to %s.",
				formatKg(weight), smaller, times(smallerSetsToComplete), done, planned)
	}

	if !hitScheme(last, workingWeight(last), scheme) {
		if stalled, ok := findStuck(sessions); ok && workingWeight(last) == stalled.weight {
			return uniformSets(small, stalled.weight), ResultMissed,
				fmt.Sprintf("Stuck at %s after deloading: %s for the same reps in smaller sets. Complete it %s to go back to %s.",
					formatKg(stalled.weight), smaller, times(smallerSetsToComplete), planned)
		}
	}
	return nextTargetUpTo(scheme, sessions, daysOff, maxWeight)
}

// times spells out a count of times, e.g. "twice" or "3 times".
func times(n int) string {
	switch n {
	case 1:
		return "once"
	case 2:
		return "twice"
	}
	return fmt.Sprintf("%d times", n)
}
