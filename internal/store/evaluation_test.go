package store

import (
	"testing"
)

// stretch is a part of a synthetic workout: seconds at a speed (m/s).
type stretch struct{ seconds, speed float64 }

// synthetic builds a workout from stretches, with a sample every 10 s.
func synthetic(activity string, stretches ...stretch) *CardioWorkout {
	samples := []CardioSample{{T: 0, D: 0}}
	t, d := 0.0, 0.0
	for _, s := range stretches {
		for elapsed := 0.0; elapsed < s.seconds; elapsed += 10 {
			step := min(10, s.seconds-elapsed)
			t += step
			d += step * s.speed
			samples = append(samples, CardioSample{T: t, D: d})
		}
	}
	return &CardioWorkout{Activity: activity, DurationSeconds: t, DistanceM: fp(d), Samples: samples}
}

// pace converts a time per km (seconds) to m/s.
func pace(secondsPerKm float64) float64 { return 1000 / secondsPerKm }

func easyRun(km float64) PlannedSession {
	// 5:30–6:00/km.
	return PlannedSession{
		Date: "2026-10-14", Activity: ActivityRunning, Kind: KindEasy, TargetDistanceM: fp(km * 1000),
		SpeedMin: fp(pace(360)), SpeedMax: fp(pace(330)),
	}
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

	onPace := synthetic(ActivityRunning, stretch{8 * 345, pace(345)})
	if v := evaluateSession(s, onPace, "2026-10-14"); v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	// 4:50/km is well under the 5:30/km top of the range.
	tooFast := synthetic(ActivityRunning, stretch{8 * 290, pace(290)})
	v := evaluateSession(s, tooFast, "2026-10-14")
	if c := check(t, v, "Pace"); v.Status != VerdictPartial || c.OK || c.Actual != "4:50/km" || c.Target != "5:30–6:00/km" {
		t.Errorf("expected partial for going too fast, got %+v", v)
	}

	short := synthetic(ActivityRunning, stretch{4.8 * 345, pace(345)})
	if v := evaluateSession(s, short, "2026-10-14"); v.Status != VerdictMissed {
		t.Errorf("expected 60%% of the distance missed, got %+v", v)
	}

	nearly := synthetic(ActivityRunning, stretch{6.4 * 345, pace(345)})
	if v := evaluateSession(s, nearly, "2026-10-14"); v.Status != VerdictPartial {
		t.Errorf("expected 80%% of the distance partial, got %+v", v)
	}
}

func TestEvaluateSession_EasyByHeartRate(t *testing.T) {
	s := PlannedSession{Activity: ActivityCycling, Kind: KindEasy, TargetDistanceM: fp(30000), HRMin: fp(114), HRMax: fp(143)}
	w := synthetic(ActivityCycling, stretch{3600, 30000.0 / 3600})
	w.AvgHeartRate = fp(155)
	if v := evaluateSession(s, w, "2026-10-14"); v.Status != VerdictPartial || check(t, v, "Heart rate").OK {
		t.Errorf("expected partial for a heart rate too high, got %+v", v)
	}
}

func TestEvaluateSession_TempoLeavesOutWarmUp(t *testing.T) {
	// 10 km with the middle at 4:55–5:05/km.
	s := PlannedSession{
		Activity: ActivityRunning, Kind: KindTempo, TargetDistanceM: fp(10000),
		SpeedMin: fp(pace(305)), SpeedMax: fp(pace(295)),
	}
	// 10 easy minutes each side of 25 minutes at 5:00/km.
	w := synthetic(ActivityRunning, stretch{600, pace(400)}, stretch{1500, pace(300)}, stretch{600, pace(400)})
	v := evaluateSession(s, w, "2026-10-14")
	if c := check(t, v, "Tempo pace"); !c.OK || c.Actual != "5:00/km" {
		t.Errorf("expected the tempo pace at 5:00/km, got %+v", c)
	}
	// 3 + 5 + 3 = 7.75 km of 10 km.
	if v.Status != VerdictPartial {
		t.Errorf("expected partial for the short distance, got %+v", v)
	}

	slow := synthetic(ActivityRunning, stretch{600, pace(400)}, stretch{1500, pace(330)}, stretch{600, pace(400)})
	if v := evaluateSession(s, slow, "2026-10-14"); !v.TooSlow || check(t, v, "Tempo pace").OK {
		t.Errorf("expected a tempo run too slow, got %+v", v)
	}
}

// intervals is 6×800 m at 4:30–4:40/km with 2 min jogs, 8 km in all.
func intervals() PlannedSession {
	return PlannedSession{
		Activity: ActivityRunning, Kind: KindIntervals, TargetDistanceM: fp(8000),
		SpeedMin: fp(pace(280)), SpeedMax: fp(pace(270)),
		Reps: ptrInt(6), RepDistanceM: fp(800), RecoveryS: fp(120),
	}
}

func ptrInt(n int) *int { return &n }

// intervalRun warms up, runs reps of 800 m at repPace (s/km) with 2 minute
// jogs and cools down to about 8 km.
func intervalRun(reps int, repPace float64) *CardioWorkout {
	stretches := []stretch{{900, pace(380)}}
	for range reps {
		stretches = append(stretches, stretch{0.8 * repPace, pace(repPace)}, stretch{120, pace(420)})
	}
	stretches = append(stretches, stretch{600, pace(380)})
	return synthetic(ActivityRunning, stretches...)
}

func TestEvaluateSession_Intervals(t *testing.T) {
	s := intervals()

	for _, tt := range []struct {
		name    string
		workout *CardioWorkout
		status  string
		reps    string
		slow    bool
	}{
		{"all reps", intervalRun(6, 275), VerdictMet, "6", false},
		{"one rep short", intervalRun(5, 275), VerdictMet, "5", false},
		{"two reps short", intervalRun(4, 275), VerdictPartial, "4", false},
		{"reps too slow", intervalRun(6, 300), VerdictPartial, "6", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			// Distance is judged too; only the rep checks matter here.
			tt.workout.DistanceM = fp(8000)
			v := evaluateSession(s, tt.workout, "2026-10-14")
			if v.Status != tt.status || v.TooSlow != tt.slow {
				t.Errorf("expected %s (too slow: %v), got %+v", tt.status, tt.slow, v)
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
	if c := check(t, v, "Median rep pace"); !c.OK || c.Actual != "4:35/km" {
		t.Errorf("expected reps at 4:35/km, got %+v", c)
	}
}

func TestEvaluateSession_RaceOnlyChecksDistance(t *testing.T) {
	s := PlannedSession{Activity: ActivitySwimming, Kind: KindRace, TargetDistanceM: fp(950)}
	w := &CardioWorkout{Activity: ActivitySwimming, DurationSeconds: 1500, DistanceM: fp(950)}
	if v := evaluateSession(s, w, "2026-10-14"); v.Status != VerdictMet || len(v.Checks) != 1 {
		t.Errorf("expected met on distance alone, got %+v", v)
	}
}

func TestEvaluateSession_TempoWithManualDistance(t *testing.T) {
	// 40 km at 30–33 km/h.
	s := PlannedSession{
		Activity: ActivityCycling, Kind: KindTempo, TargetDistanceM: fp(40000),
		SpeedMin: fp(30 / 3.6), SpeedMax: fp(33 / 3.6),
	}
	// An indoor ride's samples carry heart rate but no distance, so the
	// distance entered by hand gives the speed: 40 km in 75 minutes is 32 km/h.
	samples := []CardioSample{{T: 0, D: 0}}
	for t := 10.0; t <= 4500; t += 10 {
		samples = append(samples, CardioSample{T: t, D: 0, HR: fp(150)})
	}
	w := &CardioWorkout{
		Activity: ActivityCycling, DurationSeconds: 4500, DistanceM: fp(40000), ManualDistance: true, Samples: samples,
	}
	v := evaluateSession(s, w, "2026-10-14")
	if c := check(t, v, "Speed"); !c.OK || c.Actual != "32.0 km/h" {
		t.Errorf("expected the average speed of 32 km/h, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
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
