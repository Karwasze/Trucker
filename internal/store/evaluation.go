package store

import (
	"fmt"
	"math"
	"slices"
)

const (
	// Share of the target volume that counts as done, and below which the
	// session counts as missed.
	volumeMet    = 0.9
	volumeMissed = 0.7
	// Interval reps are found by smoothing speed over this many seconds,
	// keeping stretches faster than the workout's average at least
	// repMinShare of a rep long. A distance rep is expected to take as long
	// as at repSpeedOverAverage times the average speed.
	repSmoothingS       = 30
	repMinShare         = 0.6
	repSpeedOverAverage = 1.15
	// The median rep may be this far off the rep length.
	repLengthSlack = 0.15
)

// evaluateSession judges how a planned session went: pending until its day
// is over, missed when nothing was done by then, and otherwise met, partly
// met or missed from these checks against workout:
//
//   - volume: distance (or duration) of at least volumeMet of the target;
//     below volumeMissed misses the session
//   - intervals: at least Reps - 1 reps, found from laps when the workout
//     has them, else from fast stretches of its samples, of a median length
//     close to the rep length
//
// Heart rate zones are a suggestion of how hard to go, which the watch
// shows during the workout: they aren't judged after.
func evaluateSession(s PlannedSession, w *CardioWorkout, today string) Verdict {
	if w == nil {
		if s.Date < today {
			return Verdict{Status: VerdictMissed, Checks: []Check{}}
		}
		return Verdict{Status: VerdictPending, Checks: []Check{}}
	}

	v := Verdict{Checks: []Check{}}
	missed := false
	switch {
	case s.TargetDistanceM != nil && w.DistanceM != nil:
		share := *w.DistanceM / *s.TargetDistanceM
		missed = share < volumeMissed
		v.Checks = append(v.Checks, Check{
			Name:   "Distance",
			Actual: formatMetres(s.Activity, *w.DistanceM),
			Target: formatMetres(s.Activity, *s.TargetDistanceM),
			OK:     share >= volumeMet,
		})
	case s.TargetDurationS != nil:
		share := w.DurationSeconds / *s.TargetDurationS
		missed = share < volumeMissed
		v.Checks = append(v.Checks, Check{
			Name:   "Time",
			Actual: formatClock(w.DurationSeconds),
			Target: formatClock(*s.TargetDurationS),
			OK:     share >= volumeMet,
		})
	}
	if s.Kind == KindIntervals {
		v.Checks = append(v.Checks, intervalChecks(s, w)...)
	}

	v.Status = VerdictMet
	for _, c := range v.Checks {
		if !c.OK {
			v.Status = VerdictPartial
		}
	}
	if missed {
		v.Status = VerdictMissed
	}
	return v
}

// averageSpeed is a workout's distance over its duration, or 0 without a
// distance.
func averageSpeed(w *CardioWorkout) float64 {
	if w.DistanceM == nil || w.DurationSeconds <= 0 {
		return 0
	}
	return *w.DistanceM / w.DurationSeconds
}

// rep is one fast stretch of an interval session.
type rep struct {
	duration, distance float64
}

// intervalChecks checks the reps of an interval session.
func intervalChecks(s PlannedSession, w *CardioWorkout) []Check {
	if s.Reps == nil {
		return nil
	}
	reps := lapReps(s, w)
	if reps == nil {
		reps = sampleReps(s, w)
	}
	if reps == nil {
		return nil
	}

	checks := []Check{{
		Name:   "Reps",
		Actual: fmt.Sprint(len(reps)),
		Target: fmt.Sprint(*s.Reps),
		OK:     len(reps) >= *s.Reps-1,
	}}
	if target := repLength(s); target > 0 && len(reps) > 0 {
		lengths := make([]float64, len(reps))
		for i, r := range reps {
			lengths[i] = r.distance
			if s.RepDurationS != nil {
				lengths[i] = r.duration
			}
		}
		length := median(lengths)
		actual, want := formatMetres(s.Activity, length), formatMetres(s.Activity, target)
		if s.RepDurationS != nil {
			actual, want = formatClock(length), formatClock(target)
		} else if s.Activity != ActivitySwimming {
			actual, want = fmt.Sprintf("%.0f m", length), fmt.Sprintf("%.0f m", target)
		}
		checks = append(checks, Check{
			Name:   "Median rep length",
			Actual: actual,
			Target: want,
			OK:     math.Abs(length-target) <= target*repLengthSlack,
		})
	}
	return checks
}

// repLength is how long a rep should be: its distance, or its duration for
// timed reps.
func repLength(s PlannedSession) float64 {
	if s.RepDurationS != nil {
		return *s.RepDurationS
	}
	return deref(s.RepDistanceM)
}

// repDuration is about how long a rep should take, in seconds: a distance
// rep at repSpeedOverAverage times the average speed.
func repDuration(s PlannedSession, average float64) float64 {
	if s.RepDurationS != nil {
		return *s.RepDurationS
	}
	return deref(s.RepDistanceM) / (average * repSpeedOverAverage)
}

// lapReps returns the reps marked as laps (swims mark every length, so not
// those), or nil without at least two laps. Laps slower than the workout's
// average are recoveries, which pull the average down.
func lapReps(s PlannedSession, w *CardioWorkout) []rep {
	if s.Activity == ActivitySwimming || len(w.Laps) < 2 {
		return nil
	}
	threshold := averageSpeed(w)
	reps := []rep{}
	for _, lap := range w.Laps {
		if lap.Duration <= 0 {
			continue
		}
		if threshold == 0 || lap.D/lap.Duration >= threshold {
			reps = append(reps, rep{duration: lap.Duration, distance: lap.D})
		}
	}
	return reps
}

// sampleReps finds reps as stretches where the speed, smoothed over
// repSmoothingS, stays above the samples' average for at least repMinShare
// of a rep. It returns nil when the workout has no samples or samples
// without distance.
func sampleReps(s PlannedSession, w *CardioWorkout) []rep {
	n := len(w.Samples)
	if n < 3 || w.Samples[n-1].D <= 0 || w.Samples[n-1].T <= 0 {
		return nil
	}
	threshold := w.Samples[n-1].D / w.Samples[n-1].T
	expected := repDuration(s, threshold)
	if expected == 0 {
		return nil
	}

	reps := []rep{}
	start := -1
	closeRep := func(end int) {
		duration := w.Samples[end].T - w.Samples[start].T
		if duration >= expected*repMinShare {
			reps = append(reps, rep{duration: duration, distance: w.Samples[end].D - w.Samples[start].D})
		}
		start = -1
	}
	for i := 1; i < len(w.Samples); i++ {
		t := w.Samples[i].T
		from := math.Max(t-repSmoothingS/2, 0)
		to := math.Min(t+repSmoothingS/2, w.Samples[len(w.Samples)-1].T)
		fast := to > from &&
			(sampleDistanceAt(w.Samples, to)-sampleDistanceAt(w.Samples, from))/(to-from) >= threshold
		switch {
		case fast && start == -1:
			start = i - 1
		case !fast && start != -1:
			closeRep(i - 1)
		}
	}
	if start != -1 {
		closeRep(len(w.Samples) - 1)
	}
	return reps
}

// sampleDistanceAt is the distance covered t seconds in, interpolated
// between samples.
func sampleDistanceAt(samples []CardioSample, t float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	for i := 1; i < len(samples); i++ {
		a, b := samples[i-1], samples[i]
		if t <= b.T {
			if b.T == a.T {
				return b.D
			}
			return a.D + (b.D-a.D)*math.Max(0, t-a.T)/(b.T-a.T)
		}
	}
	return samples[len(samples)-1].D
}

func median(values []float64) float64 {
	sorted := slices.Clone(values)
	slices.Sort(sorted)
	n := len(sorted)
	if n%2 == 1 {
		return sorted[n/2]
	}
	return (sorted[n/2-1] + sorted[n/2]) / 2
}
