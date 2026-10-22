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
	// Tempo and interval speeds may be off the range by this much.
	qualitySpeedSlack = 0.03
	// Tempo sessions leave out this much warm-up and cool-down.
	tempoWarmUpS = 600
	// Interval reps are found by smoothing speed over this many seconds,
	// keeping fast stretches at least repMinShare of a rep long.
	repSmoothingS = 30
	repMinShare   = 0.6
	// The median rep may be this far off the rep length.
	repLengthSlack = 0.15
	// A tempo block is judged over this middle share of it, as it won't sit
	// exactly in the middle of the session and heart rate takes a while to
	// rise; its heart rate may be off the range by this many bpm.
	tempoBlockCore    = 0.6
	tempoBlockHRSlack = 3
)

// Warnings on checks done harder than planned, which still count.
const (
	tooHardWarning = "Harder than planned: ease off to keep fresh for the next sessions."
)

// evaluateSession judges how a planned session went: pending until its day
// is over, missed when nothing was done by then, and otherwise met, partly
// met or missed from these checks against workout:
//
//   - volume: distance (or duration) of at least volumeMet of the target;
//     below volumeMissed misses the session
//   - easy, long, recovery and technique sessions: nothing more, as they
//     go by the heart rate zone the watch shows
//   - long sessions with a tempo block: the middle of the samples at least
//     the block's speed range (or heart rate range)
//   - tempo: the speed between warm-up and cool-down at least the range
//   - intervals: at least Reps - 1 reps, found from laps when the workout
//     has them, else from fast stretches of its samples, at a median speed
//     of at least the range and a median length close to the rep length
//
// Going harder than a range never fails a check: it counts, with a warning.
//
// Race sessions only check volume.
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

	switch s.Kind {
	case KindEasy, KindLong, KindRecovery, KindTechnique:
		if s.TempoBlock != nil {
			v.Checks = append(v.Checks, tempoBlockChecks(s, w)...)
		}
	case KindTempo, KindBrick:
		if check, slow, ok := tempoCheck(s, w); ok {
			v.Checks = append(v.Checks, check)
			v.TooSlow = slow
		}
	case KindIntervals:
		checks, slow := intervalChecks(s, w)
		v.Checks = append(v.Checks, checks...)
		v.TooSlow = slow
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

// tempoBlockChecks checks a long session's tempo block, by speed when it has
// a speed range and the samples distance, else by their heart rate. The rest
// of the session is easy, run by heart rate zone, so it isn't checked. The
// block is the middle of the samples, by distance when they have it, else by
// time. Without samples the block can't be told from the rest, so it isn't
// checked.
func tempoBlockChecks(s PlannedSession, w *CardioWorkout) []Check {
	b := s.TempoBlock
	n := len(w.Samples)
	if n < 3 || w.Samples[n-1].T <= 0 || s.TargetDistanceM == nil || *s.TargetDistanceM <= 0 {
		return nil
	}
	last := w.Samples[n-1]
	share := math.Min(b.DistanceM / *s.TargetDistanceM, 1)
	// middle is the time span of the middle part of the session.
	middle := func(part float64) (float64, float64) {
		lo, hi := 0.5-part/2, 0.5+part/2
		if last.D > 0 {
			return sampleTimeAt(w.Samples, lo*last.D), sampleTimeAt(w.Samples, hi*last.D)
		}
		return lo * last.T, hi * last.T
	}
	from, to := middle(share * tempoBlockCore)

	var checks []Check
	if b.SpeedMin != nil && b.SpeedMax != nil && last.D > 0 && to > from {
		speed := (sampleDistanceAt(w.Samples, to) - sampleDistanceAt(w.Samples, from)) / (to - from)
		checks = append(checks, intensityCheck(Check{
			Name:   "Tempo block " + lowerFirst(speedName(s.Activity)),
			Actual: formatSpeed(s.Activity, speed),
			Target: formatSpeedRange(s.Activity, *b.SpeedMin, *b.SpeedMax),
		}, speed < *b.SpeedMin*(1-qualitySpeedSlack), speed > *b.SpeedMax*(1+qualitySpeedSlack), tooHardWarning))
	} else if b.HRMin != nil && b.HRMax != nil {
		if hr, ok := sampleHeartRate(w.Samples, func(t float64) bool { return t > from && t <= to }); ok {
			checks = append(checks, intensityCheck(Check{
				Name:   "Tempo block heart rate",
				Actual: fmt.Sprintf("%.0f bpm", hr),
				Target: fmt.Sprintf("%.0f–%.0f bpm", *b.HRMin, *b.HRMax),
			}, hr < *b.HRMin-tempoBlockHRSlack, hr > *b.HRMax+tempoBlockHRSlack, tooHardWarning))
		}
	}
	return checks
}

// intensityCheck judges c against its range: too easy fails it, while too
// hard still counts, with warning.
func intensityCheck(c Check, tooEasy, tooHard bool, warning string) Check {
	c.OK = !tooEasy
	if tooHard {
		c.Warning = warning
	}
	return c
}

// sampleHeartRate is the average heart rate of the samples at times keep
// holds for, and whether any of them had one.
func sampleHeartRate(samples []CardioSample, keep func(t float64) bool) (float64, bool) {
	sum, count := 0.0, 0
	for _, sample := range samples {
		if sample.HR != nil && keep(sample.T) {
			sum += *sample.HR
			count++
		}
	}
	if count == 0 {
		return 0, false
	}
	return sum / float64(count), true
}

// sampleTimeAt is when d metres were first covered, interpolated between
// samples.
func sampleTimeAt(samples []CardioSample, d float64) float64 {
	for i := 1; i < len(samples); i++ {
		a, b := samples[i-1], samples[i]
		if d <= b.D {
			if b.D == a.D {
				return a.T
			}
			return a.T + (b.T-a.T)*math.Max(0, d-a.D)/(b.D-a.D)
		}
	}
	return samples[len(samples)-1].T
}

// tempoCheck checks the speed of a tempo session without its warm-up and
// cool-down (the whole session when too short to have them), reporting
// whether it was too slow. ok is false without a speed range or distance.
func tempoCheck(s PlannedSession, w *CardioWorkout) (check Check, slow, ok bool) {
	if s.SpeedMin == nil || s.SpeedMax == nil {
		return Check{}, false, false
	}
	speed := averageSpeed(w)
	name := speedName(s.Activity)
	// Samples without distance (an indoor ride with its distance entered by
	// hand) leave only the average speed.
	if len(w.Samples) > 1 && w.Samples[len(w.Samples)-1].D > 0 && w.DurationSeconds > 3*tempoWarmUpS {
		from, to := float64(tempoWarmUpS), w.Samples[len(w.Samples)-1].T-tempoWarmUpS
		speed = (sampleDistanceAt(w.Samples, to) - sampleDistanceAt(w.Samples, from)) / (to - from)
		name = "Tempo " + lowerFirst(name)
	}
	if speed <= 0 {
		return Check{}, false, false
	}
	slow = speed < *s.SpeedMin*(1-qualitySpeedSlack)
	return intensityCheck(Check{
		Name:   name,
		Actual: formatSpeed(s.Activity, speed),
		Target: formatSpeedRange(s.Activity, *s.SpeedMin, *s.SpeedMax),
	}, slow, speed > *s.SpeedMax*(1+qualitySpeedSlack), tooHardWarning), slow, true
}

// rep is one fast stretch of an interval session.
type rep struct {
	duration, distance float64
}

// intervalChecks checks the reps of an interval session, reporting whether
// they were too slow. Without a speed range it can only count reps by laps.
func intervalChecks(s PlannedSession, w *CardioWorkout) ([]Check, bool) {
	if s.Reps == nil {
		return nil, false
	}
	reps := lapReps(s, w)
	if reps == nil {
		reps = sampleReps(s, w)
	}
	if reps == nil {
		return nil, false
	}

	checks := []Check{{
		Name:   "Reps",
		Actual: fmt.Sprint(len(reps)),
		Target: fmt.Sprint(*s.Reps),
		OK:     len(reps) >= *s.Reps-1,
	}}
	if len(reps) == 0 {
		return checks, false
	}

	speeds := make([]float64, len(reps))
	lengths := make([]float64, len(reps))
	for i, r := range reps {
		speeds[i] = r.distance / r.duration
		lengths[i] = r.distance
		if s.RepDurationS != nil {
			lengths[i] = r.duration
		}
	}
	slow := false
	if s.SpeedMin != nil && s.SpeedMax != nil {
		speed := median(speeds)
		slow = speed < *s.SpeedMin*(1-qualitySpeedSlack)
		checks = append(checks, intensityCheck(Check{
			Name:   "Median rep " + lowerFirst(speedName(s.Activity)),
			Actual: formatSpeed(s.Activity, speed),
			Target: formatSpeedRange(s.Activity, *s.SpeedMin, *s.SpeedMax),
		}, slow, speed > *s.SpeedMax*(1+qualitySpeedSlack), tooHardWarning))
	}
	if target := repLength(s); target > 0 {
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
	return checks, slow
}

// repLength is how long a rep should be: its distance, or its duration for
// timed reps.
func repLength(s PlannedSession) float64 {
	if s.RepDurationS != nil {
		return *s.RepDurationS
	}
	return deref(s.RepDistanceM)
}

// repDuration is how long a rep should take, in seconds.
func repDuration(s PlannedSession) float64 {
	if s.RepDurationS != nil {
		return *s.RepDurationS
	}
	if s.SpeedMin != nil && s.SpeedMax != nil {
		return deref(s.RepDistanceM) / ((*s.SpeedMin + *s.SpeedMax) / 2)
	}
	return 0
}

// fastThreshold is the speed between easy and rep pace that splits reps
// from recoveries: the midpoint of the session's slowest rep speed and the
// workout's average, which the recoveries pull down.
func fastThreshold(s PlannedSession, w *CardioWorkout) float64 {
	if s.SpeedMin == nil {
		return 0
	}
	return (*s.SpeedMin + averageSpeed(w)) / 2
}

// lapReps returns the reps marked as laps (swims mark every length, so not
// those), or nil without at least two laps. Laps slower than the fast
// threshold are recoveries.
func lapReps(s PlannedSession, w *CardioWorkout) []rep {
	if s.Activity == ActivitySwimming || len(w.Laps) < 2 {
		return nil
	}
	threshold := fastThreshold(s, w)
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
// repSmoothingS, stays above the fast threshold for at least repMinShare of
// a rep. It returns nil when the workout has no samples, samples without
// distance or the session no speed range.
func sampleReps(s PlannedSession, w *CardioWorkout) []rep {
	threshold := fastThreshold(s, w)
	expected := repDuration(s)
	if len(w.Samples) < 3 || w.Samples[len(w.Samples)-1].D <= 0 || threshold == 0 || expected == 0 {
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

func speedName(activity string) string {
	if activity == ActivityCycling {
		return "Speed"
	}
	return "Pace"
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]+'a'-'A') + s[1:]
}
