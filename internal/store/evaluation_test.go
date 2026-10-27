package store

import (
	"testing"
)

// stretch is a part of a synthetic workout: seconds at a speed (m/s) and a
// heart rate (none when 0).
type stretch struct{ seconds, speed, hr float64 }

// synthetic builds a workout from stretches, with a sample every 10 s.
func synthetic(activity string, stretches ...stretch) *CardioWorkout {
	samples := []CardioSample{{T: 0, D: 0}}
	t, d := 0.0, 0.0
	for _, s := range stretches {
		for elapsed := 0.0; elapsed < s.seconds; elapsed += 10 {
			step := min(10, s.seconds-elapsed)
			t += step
			d += step * s.speed
			sample := CardioSample{T: t, D: d}
			if s.hr > 0 {
				sample.HR = fp(s.hr)
			}
			samples = append(samples, sample)
		}
	}
	return &CardioWorkout{Activity: activity, DurationSeconds: t, DistanceM: fp(d), Samples: samples}
}

// pace converts a time per km (seconds) to m/s.
func pace(secondsPerKm float64) float64 { return 1000 / secondsPerKm }

func easyRun(km float64) PlannedSession {
	return PlannedSession{Date: "2026-10-14", Activity: ActivityRunning, Kind: KindEasy, TargetDistanceM: fp(km * 1000)}
}

func check(t *testing.T, v Verdict, name string) Check {
	t.Helper()
	for _, c := range v.Checks {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("no %q check in %+v", name, v.Checks)
	return Check{}
}

// onlyDistance fails unless v checks nothing but the distance.
func onlyDistance(t *testing.T, v Verdict) {
	t.Helper()
	if len(v.Checks) != 1 || v.Checks[0].Name != "Distance" {
		t.Errorf("expected only a distance check, got %+v", v.Checks)
	}
}

func TestEvaluateSession_Pending(t *testing.T) {
	s := easyRun(8)
	if v := evaluateSession(s, nil, "2026-10-14"); v.Status != VerdictPending {
		t.Errorf("expected today's session pending, got %s", v.Status)
	}
	if v := evaluateSession(s, nil, "2026-10-15"); v.Status != VerdictMissed {
		t.Errorf("expected a past session missed, got %s", v.Status)
	}
}

func TestEvaluateSession_EasyRun(t *testing.T) {
	s := easyRun(8)

	onPace := synthetic(ActivityRunning, stretch{8 * 345, pace(345), 140})
	if v := evaluateSession(s, onPace, "2026-10-14"); v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	short := synthetic(ActivityRunning, stretch{4.8 * 345, pace(345), 140})
	if v := evaluateSession(s, short, "2026-10-14"); v.Status != VerdictMissed {
		t.Errorf("expected 60%% of the distance missed, got %+v", v)
	}

	nearly := synthetic(ActivityRunning, stretch{6.4 * 345, pace(345), 140})
	if v := evaluateSession(s, nearly, "2026-10-14"); v.Status != VerdictPartial {
		t.Errorf("expected 80%% of the distance partial, got %+v", v)
	}
}

func TestEvaluateSession_HeartRateIsNotJudged(t *testing.T) {
	// Zones suggest how hard to go; however hard or easy a session was, only
	// its distance is judged.
	for _, s := range []PlannedSession{
		{Activity: ActivityRunning, Kind: KindTempo, TargetDistanceM: fp(8000)},
		{Activity: ActivityRunning, Kind: KindBrick, Phase: PhasePeak, TargetDistanceM: fp(8000)},
		{Activity: ActivityRunning, Kind: KindLong, TargetDistanceM: fp(8000), TempoBlock: &TempoBlock{DistanceM: 3000, Position: BlockAtEnd}},
		{Activity: ActivityCycling, Kind: KindLong, TargetDistanceM: fp(8000), TempoBlock: &TempoBlock{DistanceM: 3000}},
		// Planned before zones, with a bpm range.
		{Activity: ActivityRunning, Kind: KindLong, TargetDistanceM: fp(8000), HRMin: fp(101), HRMax: fp(126)},
	} {
		for _, hr := range []float64{110, 185} {
			w := synthetic(s.Activity, stretch{2400, 8000.0 / 2400, hr})
			w.AvgHeartRate = fp(hr)
			v := evaluateSession(s, w, "2026-10-14")
			if v.Status != VerdictMet {
				t.Errorf("%s %s at %v bpm: expected met, got %+v", s.Activity, s.Kind, hr, v)
			}
			onlyDistance(t, v)
		}
	}
}

// intervals is 6×800 m with 2 min jogs, 8 km in all.
func intervals() PlannedSession {
	return PlannedSession{
		Activity: ActivityRunning, Kind: KindIntervals, TargetDistanceM: fp(8000),
		Reps: ptrInt(6), RepDistanceM: fp(800), RecoveryS: fp(120),
	}
}

func ptrInt(n int) *int { return &n }

// intervalRun warms up, runs reps of 800 m at repPace (s/km) with 2 minute
// jogs, and cools down.
func intervalRun(reps int, repPace float64) *CardioWorkout {
	stretches := []stretch{{900, pace(380), 130}}
	for range reps {
		stretches = append(stretches, stretch{0.8 * repPace, pace(repPace), 165}, stretch{120, pace(420), 135})
	}
	stretches = append(stretches, stretch{600, pace(380), 130})
	return synthetic(ActivityRunning, stretches...)
}

func TestEvaluateSession_Intervals(t *testing.T) {
	s := intervals()

	for _, tt := range []struct {
		name    string
		workout *CardioWorkout
		status  string
		reps    string
	}{
		{"all reps", intervalRun(6, 275), VerdictMet, "6"},
		{"one rep short", intervalRun(5, 275), VerdictMet, "5"},
		{"two reps short", intervalRun(4, 275), VerdictPartial, "4"},
		{"slower reps", intervalRun(6, 320), VerdictMet, "6"},
		{"faster reps", intervalRun(6, 250), VerdictMet, "6"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			// Distance is judged too; only the rep checks matter here.
			tt.workout.DistanceM = fp(8000)
			v := evaluateSession(s, tt.workout, "2026-10-14")
			if v.Status != tt.status {
				t.Errorf("expected %s, got %+v", tt.status, v)
			}
			if c := check(t, v, "Reps"); c.Actual != tt.reps {
				t.Errorf("expected %s reps found, got %+v", tt.reps, c)
			}
		})
	}

	v := evaluateSession(s, intervalRun(6, 275), "2026-10-14")
	if c := check(t, v, "Median rep length"); !c.OK {
		t.Errorf("expected reps of about 800 m, got %+v", c)
	}
	if len(v.Checks) != 3 {
		t.Errorf("expected distance, reps and rep length only, got %+v", v.Checks)
	}
}

func TestEvaluateSession_IntervalsFromLaps(t *testing.T) {
	s := intervals()
	// No samples, but laps: a warm-up, three reps with jogs between, and a
	// cool-down.
	w := &CardioWorkout{Activity: ActivityRunning, DurationSeconds: 2400, DistanceM: fp(8000)}
	t0 := 0.0
	lap := func(duration, metres float64) {
		w.Laps = append(w.Laps, CardioLap{T: t0, Duration: duration, D: metres})
		t0 += duration
	}
	lap(900, 2400)
	for range 3 {
		lap(220, 800)
		lap(120, 290)
	}
	lap(600, 1600)

	v := evaluateSession(s, w, "2026-10-14")
	if c := check(t, v, "Reps"); c.Actual != "3" || c.OK {
		t.Errorf("expected 3 reps from laps, too few, got %+v", c)
	}
	if c := check(t, v, "Median rep length"); !c.OK || c.Actual != "800 m" {
		t.Errorf("expected reps of 800 m, got %+v", c)
	}
}

func TestEvaluateSession_RaceOnlyChecksDistance(t *testing.T) {
	s := PlannedSession{Activity: ActivitySwimming, Kind: KindRace, TargetDistanceM: fp(950)}
	w := &CardioWorkout{Activity: ActivitySwimming, DurationSeconds: 1500, DistanceM: fp(950), AvgHeartRate: fp(170)}
	if v := evaluateSession(s, w, "2026-10-14"); v.Status != VerdictMet || len(v.Checks) != 1 {
		t.Errorf("expected met on distance alone, got %+v", v)
	}
}

func TestEvaluateSession_IntervalsWithoutSampleDistance(t *testing.T) {
	// A treadmill session with its distance entered by hand: the samples have
	// no distance to find reps in, so reps aren't checked rather than missed.
	w := intervalRun(6, 275)
	for i := range w.Samples {
		w.Samples[i].D = 0
	}
	w.ManualDistance = true
	v := evaluateSession(intervals(), w, "2026-10-14")
	for _, c := range v.Checks {
		if c.Name == "Reps" {
			t.Fatalf("expected no reps check, got %+v", c)
		}
	}
	if c := check(t, v, "Distance"); !c.OK {
		t.Errorf("expected the distance met, got %+v", c)
	}
}
