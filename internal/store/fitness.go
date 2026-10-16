package store

import (
	"math"
	"time"
)

const (
	fitnessVolumeDays    = 28
	fitnessLongestDays   = 42
	fitnessThresholdDays = 56
	fitnessMaxHRDays     = 180
	// Riegel's exponent: how much slower a longer race is run.
	riegelExponent = 1.06
	// Runs shorter than this say little about longer races.
	minPredictingRunM = 3000
	// Rides and swims set the threshold when at least this long.
	minThresholdRideS = 20 * 60
	minThresholdSwimM = 400
)

// Fitness is where the lifter stands per discipline (running, cycling,
// swimming), worked out from cardio history: average weekly distance over
// the last 4 weeks and longest session over the last 6 (in metres),
// threshold speed (m/s, missing without suitable sessions) and the highest
// heart rate seen (0 when never measured).
type Fitness struct {
	Weekly    map[string]float64
	Longest   map[string]float64
	Threshold map[string]float64
	MaxHR     float64
}

// estimateFitness works out Fitness from cardio workouts up to today.
//
// The running threshold is the best 10 km speed predicted from a run of at
// least 3 km through Riegel's formula, T2 = T1 × (D2 / D1)^1.06, which is
// close to the pace that can be held for about an hour. For cycling it is
// the best average speed of a ride of at least 20 minutes, and for
// swimming of a swim of at least 400 m. Easy sessions underestimate it,
// so only the best counts.
func estimateFitness(workouts []CardioWorkout, today time.Time) Fitness {
	f := Fitness{
		Weekly:    map[string]float64{},
		Longest:   map[string]float64{},
		Threshold: map[string]float64{},
	}
	since := func(days int) string { return today.AddDate(0, 0, -days).Format(dateLayout) }
	end := today.Format(dateLayout)

	for _, w := range workouts {
		if w.Date > end {
			continue
		}
		if w.MaxHeartRate != nil && w.Date > since(fitnessMaxHRDays) {
			f.MaxHR = math.Max(f.MaxHR, *w.MaxHeartRate)
		}
		if w.DistanceM == nil || *w.DistanceM <= 0 || w.DurationSeconds <= 0 {
			continue
		}
		metres := *w.DistanceM
		if w.Date > since(fitnessVolumeDays) {
			f.Weekly[w.Activity] += metres / (fitnessVolumeDays / 7)
		}
		if w.Date > since(fitnessLongestDays) {
			f.Longest[w.Activity] = math.Max(f.Longest[w.Activity], metres)
		}
		if w.Date <= since(fitnessThresholdDays) {
			continue
		}
		speed := metres / w.DurationSeconds
		switch {
		case w.Activity == ActivityRunning && metres >= minPredictingRunM:
			tenK := w.DurationSeconds * math.Pow(10000/metres, riegelExponent)
			speed = 10000 / tenK
		case w.Activity == ActivityCycling && w.DurationSeconds >= minThresholdRideS:
		case w.Activity == ActivitySwimming && metres >= minThresholdSwimM:
		default:
			continue
		}
		f.Threshold[w.Activity] = math.Max(f.Threshold[w.Activity], speed)
	}
	for activity, weekly := range f.Weekly {
		f.Weekly[activity] = math.Round(weekly)
	}
	return f
}
