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
	// Heart rate may be off its zone by this many bpm.
	zoneHRSlack = 3
	// Tempo sessions leave out this much warm-up and cool-down.
	tempoWarmUpS = 600
	// Interval reps are found by smoothing speed over this many seconds,
	// keeping stretches faster than the workout's average at least
	// repMinShare of a rep long. A distance rep is expected to take as long
	// as at repSpeedOverAverage times the average speed.
	repSmoothingS       = 30
	repMinShare         = 0.6
	repSpeedOverAverage = 1.15
	// The median rep may be this far off the rep length.
	repLengthSlack = 0.15
	// A tempo block is judged over this middle share of it, as it won't sit
	// exactly in the middle of the session and heart rate takes a while to
	// rise.
	tempoBlockCore = 0.6
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
//   - long sessions with a tempo block: the heart rate of the middle of the
//     samples in zone 3
//   - tempo and brick: the heart rate between warm-up and cool-down in
//     zone 3
//   - intervals: at least Reps - 1 reps, found from laps when the workout
//     has them, else from fast stretches of its samples, of a median length
//     close to the rep length, with the heart rate of their second halves
//     in zone 4
//
// Heart rate is judged by zones, the lifter's on the session's day, and
// isn't without them. Going harder than a zone never fails a check: it
// counts, with a warning.
//
// Race sessions only check volume.
func evaluateSession(s PlannedSession, w *CardioWorkout, today string, zones *HeartRateZones) Verdict {
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
		if s.TempoBlock != nil && zones != nil {
			if check, ok := tempoBlockCheck(s, w, zones); ok {
				v.Checks = append(v.Checks, check)
			}
		}
	case KindTempo, KindBrick:
		if check, easy, ok := tempoCheck(s, w, zones); ok {
			v.Checks = append(v.Checks, check)
			v.TooEasy = easy
		}
	case KindIntervals:
		checks, easy := intervalChecks(s, w, zones)
		v.Checks = append(v.Checks, checks...)
		v.TooEasy = easy
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

// tempoBlockCheck checks a long session's tempo block by the heart rate of
// its part of the samples, the middle or the end, by distance when they
// have it, else by time. The rest of the session is easy, run by zone, so
// it isn't checked. Without samples the block can't be told from the rest,
// so ok is false.
func tempoBlockCheck(s PlannedSession, w *CardioWorkout, zones *HeartRateZones) (check Check, ok bool) {
	n := len(w.Samples)
	if n < 3 || w.Samples[n-1].T <= 0 || s.TargetDistanceM == nil || *s.TargetDistanceM <= 0 {
		return Check{}, false
	}
	last := w.Samples[n-1]
	share := math.Min(s.TempoBlock.DistanceM / *s.TargetDistanceM, 1)
	name, center := "Tempo block heart rate", 0.5
	if s.TempoBlock.Position == BlockAtEnd {
		name, center = "Finish heart rate", 1-share/2
	}
	part := share * tempoBlockCore
	lo, hi := center-part/2, center+part/2
	from, to := lo*last.T, hi*last.T
	if last.D > 0 {
		from, to = sampleTimeAt(w.Samples, lo*last.D), sampleTimeAt(w.Samples, hi*last.D)
	}
	hr, ok := sampleHeartRate(w.Samples, func(t float64) bool { return t > from && t <= to })
	if !ok {
		return Check{}, false
	}
	check, _ = zoneCheck(name, hr, zones.zone(heartRateZone(KindTempo)))
	return check, true
}

// zoneCheck judges a heart rate against a zone, reporting whether it was
// below it.
func zoneCheck(name string, hr float64, zone HeartRateZone) (check Check, tooEasy bool) {
	tooEasy = zone.Min != nil && hr < float64(*zone.Min)-zoneHRSlack
	tooHard := zone.Max != nil && hr > float64(*zone.Max)+zoneHRSlack
	return intensityCheck(Check{
		Name:   name,
		Actual: fmt.Sprintf("%.0f bpm", hr),
		Target: zone.describe(),
	}, tooEasy, tooHard, tooHardWarning), tooEasy
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

// tempoCheck checks the heart rate of a tempo (or brick) session without
// its warm-up and cool-down (the whole session when too short to have
// them), reporting whether it was too easy. ok is false without zones or
// heart rate.
func tempoCheck(s PlannedSession, w *CardioWorkout, zones *HeartRateZones) (check Check, easy, ok bool) {
	if zones == nil {
		return Check{}, false, false
	}
	name := "Heart rate"
	hr, ok := sampleHeartRate(w.Samples, func(float64) bool { return true })
	if n := len(w.Samples); n > 1 && w.Samples[n-1].T > 3*tempoWarmUpS {
		from, to := float64(tempoWarmUpS), w.Samples[n-1].T-tempoWarmUpS
		if middle, found := sampleHeartRate(w.Samples, func(t float64) bool { return t > from && t <= to }); found {
			hr, ok, name = middle, true, "Tempo heart rate"
		}
	}
	if !ok && w.AvgHeartRate != nil {
		hr, ok = *w.AvgHeartRate, true
	}
	if !ok {
		return Check{}, false, false
	}
	check, easy = zoneCheck(name, hr, zones.zone(heartRateZone(s.Kind)))
	return check, easy, true
}

// rep is one fast stretch of an interval session, starting start seconds in.
type rep struct {
	start, duration, distance float64
}

// intervalChecks checks the reps of an interval session, reporting whether
// they were too easy.
func intervalChecks(s PlannedSession, w *CardioWorkout, zones *HeartRateZones) ([]Check, bool) {
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

	if target := repLength(s); target > 0 {
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

	// Heart rate takes a while to rise, so only the second half of each rep
	// counts.
	easy := false
	if zones != nil {
		inRep := func(t float64) bool {
			for _, r := range reps {
				if t > r.start+r.duration/2 && t <= r.start+r.duration {
					return true
				}
			}
			return false
		}
		if hr, ok := sampleHeartRate(w.Samples, inRep); ok {
			var check Check
			check, easy = zoneCheck("Rep heart rate", hr, zones.zone(heartRateZone(KindIntervals)))
			checks = append(checks, check)
		}
	}
	return checks, easy
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
			reps = append(reps, rep{start: lap.T, duration: lap.Duration, distance: lap.D})
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
			reps = append(reps, rep{
				start: w.Samples[start].T, duration: duration, distance: w.Samples[end].D - w.Samples[start].D,
			})
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
