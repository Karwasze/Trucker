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

	onPace := synthetic(ActivityRunning, stretch{8 * 345, pace(345)})
	if v := evaluateSession(s, onPace, "2026-10-14"); v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	// Easy sessions are run by heart rate zone, which the watch shows, so
	// 4:50/km against a 5:30/km top of the range isn't flagged.
	tooFast := synthetic(ActivityRunning, stretch{8 * 290, pace(290)})
	v := evaluateSession(s, tooFast, "2026-10-14")
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
	onlyDistance(t, v)

	short := synthetic(ActivityRunning, stretch{4.8 * 345, pace(345)})
	if v := evaluateSession(s, short, "2026-10-14"); v.Status != VerdictMissed {
		t.Errorf("expected 60%% of the distance missed, got %+v", v)
	}

	nearly := synthetic(ActivityRunning, stretch{6.4 * 345, pace(345)})
	if v := evaluateSession(s, nearly, "2026-10-14"); v.Status != VerdictPartial {
		t.Errorf("expected 80%% of the distance partial, got %+v", v)
	}
}

func TestEvaluateSession_EasyIgnoresStoredHeartRate(t *testing.T) {
	// Sessions planned before zones carry a bpm range from the highest heart
	// rate seen, which said nothing of the real zones: it isn't checked.
	s := PlannedSession{Activity: ActivityRunning, Kind: KindLong, TargetDistanceM: fp(6000), HRMin: fp(101), HRMax: fp(126)}
	w := synthetic(ActivityRunning, stretch{3096, 6013.2 / 3096})
	w.AvgHeartRate = fp(144)
	v := evaluateSession(s, w, "2026-10-22")
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
	onlyDistance(t, v)
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

	// 4:30/km counts, with a warning.
	fast := synthetic(ActivityRunning, stretch{600, pace(400)}, stretch{1500, pace(270)}, stretch{600, pace(400)})
	if c := check(t, evaluateSession(s, fast, "2026-10-14"), "Tempo pace"); !c.OK || c.Warning == "" {
		t.Errorf("expected a fast tempo run to count with a warning, got %+v", c)
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
		{"reps too fast", intervalRun(6, 250), VerdictMet, "6", false},
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
	if c := check(t, v, "Median rep pace"); c.Warning != "" {
		t.Errorf("expected no warning on pace, got %+v", c)
	}
	if c := check(t, evaluateSession(s, intervalRun(6, 250), "2026-10-14"), "Median rep pace"); !c.OK || c.Warning == "" {
		t.Errorf("expected fast reps to count with a warning, got %+v", c)
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

// withHeartRate sets each sample's heart rate to hr at its time.
func withHeartRate(w *CardioWorkout, hr func(t float64) float64) *CardioWorkout {
	for i := range w.Samples {
		w.Samples[i].HR = fp(hr(w.Samples[i].T))
	}
	return w
}

// longRideWithTempo is a 60 km long ride at 101–126 bpm with 20 km at
// 134–148 bpm in the middle, planned without a speed range.
func longRideWithTempo() PlannedSession {
	return PlannedSession{
		Date: "2026-10-14", Activity: ActivityCycling, Kind: KindLong, TargetDistanceM: fp(60000),
		HRMin: fp(101), HRMax: fp(126),
		TempoBlock: &TempoBlock{DistanceM: 20000, HRMin: fp(134), HRMax: fp(148)},
	}
}

// thirds rides 60 km at 30 km/h, in three 20 km stretches of 40 minutes,
// at a heart rate for the outer and the middle ones.
func thirds(outer, middle float64) *CardioWorkout {
	w := synthetic(ActivityCycling, stretch{2400, 30 / 3.6}, stretch{2400, 30 / 3.6}, stretch{2400, 30 / 3.6})
	return withHeartRate(w, func(t float64) float64 {
		if t > 2400 && t <= 4800 {
			return middle
		}
		return outer
	})
}

func TestEvaluateSession_TempoBlockByHeartRate(t *testing.T) {
	w := thirds(120, 141)
	// The whole ride averages above the long ride's range, as the block
	// pulls it up; only the rest of it is held to that range.
	w.AvgHeartRate = fp(127)
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14")
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "141 bpm" || c.Target != "134–148 bpm" {
		t.Errorf("expected the block at 141 bpm, got %+v", c)
	}
	if len(v.Checks) != 2 {
		t.Errorf("expected distance and block checks only, got %+v", v.Checks)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockTooEasy(t *testing.T) {
	v := evaluateSession(longRideWithTempo(), thirds(120, 122), "2026-10-14")
	if c := check(t, v, "Tempo block heart rate"); c.OK {
		t.Errorf("expected the block too easy, got %+v", c)
	}
	if v.Status != VerdictPartial {
		t.Errorf("expected partial, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockTooHardCountsWithAWarning(t *testing.T) {
	v := evaluateSession(longRideWithTempo(), thirds(120, 160), "2026-10-14")
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "160 bpm" || c.Warning == "" {
		t.Errorf("expected the hard block to count with a warning, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
	// On target, there's nothing to warn about.
	if c := check(t, evaluateSession(longRideWithTempo(), thirds(120, 141), "2026-10-14"), "Tempo block heart rate"); c.Warning != "" {
		t.Errorf("expected no warning on target, got %+v", c)
	}
}

func TestEvaluateSession_TempoBlockRestNotChecked(t *testing.T) {
	// Around the block the session is easy, run by zone.
	v := evaluateSession(longRideWithTempo(), thirds(135, 141), "2026-10-14")
	if len(v.Checks) != 2 || v.Status != VerdictMet {
		t.Errorf("expected met on distance and block alone, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockNotQuiteInTheMiddle(t *testing.T) {
	// The block started 2 km late and its heart rate took a minute to rise.
	w := synthetic(ActivityCycling, stretch{7200, 30 / 3.6})
	withHeartRate(w, func(t float64) float64 {
		if t > 2640+60 && t <= 5040 {
			return 141
		}
		return 120
	})
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14")
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "141 bpm" {
		t.Errorf("expected the block's heart rate found, got %+v", c)
	}
}

func TestEvaluateSession_TempoBlockByPace(t *testing.T) {
	// A 15 km long run at 5:30–6:00/km with 5 km at 4:55–5:05/km in the middle.
	s := PlannedSession{
		Date: "2026-10-14", Activity: ActivityRunning, Kind: KindLong, TargetDistanceM: fp(15000),
		SpeedMin: fp(pace(360)), SpeedMax: fp(pace(330)),
		TempoBlock: &TempoBlock{DistanceM: 5000, SpeedMin: fp(pace(305)), SpeedMax: fp(pace(295))},
	}
	onPlan := synthetic(ActivityRunning, stretch{5 * 345, pace(345)}, stretch{5 * 300, pace(300)}, stretch{5 * 345, pace(345)})
	v := evaluateSession(s, onPlan, "2026-10-14")
	if c := check(t, v, "Tempo block pace"); !c.OK || c.Actual != "5:00/km" {
		t.Errorf("expected the block at 5:00/km, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	// A block run at 4:30/km counts, with a warning.
	tooFast := synthetic(ActivityRunning, stretch{5 * 345, pace(345)}, stretch{5 * 270, pace(270)}, stretch{5 * 345, pace(345)})
	v = evaluateSession(s, tooFast, "2026-10-14")
	if c := check(t, v, "Tempo block pace"); !c.OK || c.Actual != "4:30/km" || c.Warning == "" {
		t.Errorf("expected the fast block to count with a warning, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	// The rest run at 5:00/km isn't flagged: it's run by zone.
	hardRest := synthetic(ActivityRunning, stretch{5 * 300, pace(300)}, stretch{5 * 300, pace(300)}, stretch{5 * 300, pace(300)})
	v = evaluateSession(s, hardRest, "2026-10-14")
	if c := check(t, v, "Tempo block pace"); !c.OK || c.Warning != "" || len(v.Checks) != 2 || v.Status != VerdictMet {
		t.Errorf("expected met on the block alone, got %+v", v)
	}

	allEasy := synthetic(ActivityRunning, stretch{15 * 345, pace(345)})
	if v := evaluateSession(s, allEasy, "2026-10-14"); v.Status != VerdictPartial || check(t, v, "Tempo block pace").OK {
		t.Errorf("expected partial without the block, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockIndoorsByTime(t *testing.T) {
	// An indoor ride's samples have heart rate but no distance, so the block
	// is the middle third of the time.
	w := thirds(120, 141)
	for i := range w.Samples {
		w.Samples[i].D = 0
	}
	w.ManualDistance = true
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14")
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "141 bpm" {
		t.Errorf("expected the block at 141 bpm, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockWithoutSamples(t *testing.T) {
	// Without samples the block can't be told from the rest, so only the
	// distance is checked, rather than the whole ride's heart rate against
	// the long ride's range.
	w := &CardioWorkout{Activity: ActivityCycling, DurationSeconds: 7200, DistanceM: fp(60000), AvgHeartRate: fp(127)}
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14")
	if v.Status != VerdictMet || len(v.Checks) != 1 {
		t.Errorf("expected met on distance alone, got %+v", v)
	}
}
