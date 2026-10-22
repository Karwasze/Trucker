package store

import (
	"math"
	"testing"
	"time"
)

func near(a, b, tolerance float64) bool { return math.Abs(a-b) <= tolerance }

func TestEstimateFitness_RunThresholdFromRiegel(t *testing.T) {
	today := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	f := estimateFitness([]CardioWorkout{
		// An easy 10k is slower than what the 5k predicts, so the 5k wins.
		cardio(ActivityRunning, "2026-10-01", 10000, 3600),
		cardio(ActivityRunning, "2026-10-08", 5000, 1500),
		// Too short to predict from.
		cardio(ActivityRunning, "2026-10-10", 1000, 200),
		// Too old.
		cardio(ActivityRunning, "2026-07-01", 5000, 1200),
	}, today)

	// 1500 s × 2^1.06 ≈ 3127.6 s for 10 km.
	if got := f.Threshold[ActivityRunning]; !near(got, 10000/3127.6, 0.01) {
		t.Errorf("expected a threshold of about 3.20 m/s, got %v", got)
	}
}

func TestEstimateFitness_VolumeAndLongest(t *testing.T) {
	today := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	f := estimateFitness([]CardioWorkout{
		cardio(ActivityRunning, "2026-09-25", 12000, 4200),
		cardio(ActivityRunning, "2026-10-10", 8000, 2800),
		cardio(ActivityCycling, "2026-10-12", 40000, 4800),
		// Outside the 4 weeks of volume, inside the 6 of longest.
		cardio(ActivityCycling, "2026-09-10", 60000, 7200),
	}, today)

	if got := f.Weekly[ActivityRunning]; got != 5000 {
		t.Errorf("expected 5 km a week of running, got %v", got)
	}
	if got := f.Weekly[ActivityCycling]; got != 10000 {
		t.Errorf("expected 10 km a week of cycling, got %v", got)
	}
	if got := f.Longest[ActivityCycling]; got != 60000 {
		t.Errorf("expected the longest ride to be 60 km, got %v", got)
	}
	// The best ride of at least 20 minutes sets the cycling threshold.
	if got := f.Threshold[ActivityCycling]; !near(got, 40000.0/4800, 0.001) {
		t.Errorf("expected a cycling threshold of 8.33 m/s, got %v", got)
	}
	if _, ok := f.Threshold[ActivitySwimming]; ok {
		t.Error("expected no swimming threshold without swims")
	}
}
