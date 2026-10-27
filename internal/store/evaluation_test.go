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

// testZones are the zones of a max heart rate of 185 and a resting 55:
// zone 3 is 146–158 bpm and zone 4 159–171 bpm.
var testZones = &HeartRateZones{Date: "2026-10-01", MaxHR: 185, RestingHR: 55, Zones: computeHeartRateZones(185, 55)}

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
	if v := evaluateSession(s, nil, "2026-10-14", testZones); v.Status != VerdictPending {
		t.Errorf("expected today's session pending, got %s", v.Status)
	}
	if v := evaluateSession(s, nil, "2026-10-15", testZones); v.Status != VerdictMissed {
		t.Errorf("expected a past session missed, got %s", v.Status)
	}
}

func TestEvaluateSession_EasyRun(t *testing.T) {
	s := easyRun(8)

	onPace := synthetic(ActivityRunning, stretch{8 * 345, pace(345), 140})
	if v := evaluateSession(s, onPace, "2026-10-14", testZones); v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}

	// Easy sessions are run by the zone the watch shows, so they aren't
	// judged on it after.
	tooHard := synthetic(ActivityRunning, stretch{8 * 290, pace(290), 165})
	v := evaluateSession(s, tooHard, "2026-10-14", testZones)
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
	onlyDistance(t, v)

	short := synthetic(ActivityRunning, stretch{4.8 * 345, pace(345), 140})
	if v := evaluateSession(s, short, "2026-10-14", testZones); v.Status != VerdictMissed {
		t.Errorf("expected 60%% of the distance missed, got %+v", v)
	}

	nearly := synthetic(ActivityRunning, stretch{6.4 * 345, pace(345), 140})
	if v := evaluateSession(s, nearly, "2026-10-14", testZones); v.Status != VerdictPartial {
		t.Errorf("expected 80%% of the distance partial, got %+v", v)
	}
}

func TestEvaluateSession_EasyIgnoresStoredHeartRate(t *testing.T) {
	// Sessions planned before zones carry a bpm range from the highest heart
	// rate seen, which said nothing of the real zones: it isn't checked.
	s := PlannedSession{Activity: ActivityRunning, Kind: KindLong, TargetDistanceM: fp(6000), HRMin: fp(101), HRMax: fp(126)}
	w := synthetic(ActivityRunning, stretch{3096, 6013.2 / 3096, 144})
	v := evaluateSession(s, w, "2026-10-22", testZones)
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
	onlyDistance(t, v)
}

func tempoRun() PlannedSession {
	return PlannedSession{Date: "2026-10-14", Activity: ActivityRunning, Kind: KindTempo, TargetDistanceM: fp(8000)}
}

// tempoWorkout runs 10 easy minutes each side of 25 minutes at 5:00/km and
// a heart rate.
func tempoWorkout(hr float64) *CardioWorkout {
	return synthetic(ActivityRunning,
		stretch{600, pace(400), 130}, stretch{1500, pace(300), hr}, stretch{600, pace(400), 130})
}

func TestEvaluateSession_TempoByZoneLeavingOutWarmUp(t *testing.T) {
	// 3 + 5 + 3 = 7.75 km of 8 km.
	v := evaluateSession(tempoRun(), tempoWorkout(152), "2026-10-14", testZones)
	if c := check(t, v, "Tempo heart rate"); !c.OK || c.Actual != "152 bpm" || c.Target != "zone 3 (146–158 bpm)" || c.Warning != "" {
		t.Errorf("expected the tempo in zone 3 at 152 bpm, got %+v", c)
	}
	if v.Status != VerdictMet || v.TooEasy {
		t.Errorf("expected met, got %+v", v)
	}

	easy := evaluateSession(tempoRun(), tempoWorkout(138), "2026-10-14", testZones)
	if !easy.TooEasy || check(t, easy, "Tempo heart rate").OK || easy.Status != VerdictPartial {
		t.Errorf("expected a tempo run below zone 3 too easy, got %+v", easy)
	}

	// A few bpm off the zone still counts.
	if c := check(t, evaluateSession(tempoRun(), tempoWorkout(144), "2026-10-14", testZones), "Tempo heart rate"); !c.OK {
		t.Errorf("expected 2 bpm below the zone to count, got %+v", c)
	}

	// Above the zone counts, with a warning.
	if c := check(t, evaluateSession(tempoRun(), tempoWorkout(166), "2026-10-14", testZones), "Tempo heart rate"); !c.OK || c.Warning == "" {
		t.Errorf("expected a hard tempo run to count with a warning, got %+v", c)
	}
}

func TestEvaluateSession_TempoWithoutZones(t *testing.T) {
	// Before the app has sent the zones, only the distance is judged.
	onlyDistance(t, evaluateSession(tempoRun(), tempoWorkout(138), "2026-10-14", nil))
}

func TestEvaluateSession_ShortBrickByAverageHeartRate(t *testing.T) {
	// Too short to leave out a warm-up, and without samples: the workout's
	// average heart rate is judged.
	s := PlannedSession{Activity: ActivityRunning, Kind: KindBrick, TargetDistanceM: fp(3000)}
	w := &CardioWorkout{Activity: ActivityRunning, DurationSeconds: 900, DistanceM: fp(3000), AvgHeartRate: fp(150)}
	if c := check(t, evaluateSession(s, w, "2026-10-14", testZones), "Heart rate"); !c.OK || c.Actual != "150 bpm" {
		t.Errorf("expected the brick in zone 3 at 150 bpm, got %+v", c)
	}
}

func TestEvaluateSession_TempoIndoorsByHeartRate(t *testing.T) {
	// An indoor ride's samples carry heart rate but no distance, which
	// doesn't matter to its zone.
	s := PlannedSession{Activity: ActivityCycling, Kind: KindTempo, TargetDistanceM: fp(40000)}
	w := synthetic(ActivityCycling, stretch{600, 0, 125}, stretch{3300, 0, 150}, stretch{600, 0, 125})
	w.DistanceM, w.ManualDistance = fp(40000), true
	v := evaluateSession(s, w, "2026-10-14", testZones)
	if c := check(t, v, "Tempo heart rate"); !c.OK || c.Actual != "150 bpm" {
		t.Errorf("expected the tempo at 150 bpm, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
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

// intervalRun warms up, runs reps of 800 m at repPace (s/km) and a heart
// rate with 2 minute jogs, and cools down. The heart rate is still rising
// over the first half of each rep.
func intervalRun(reps int, repPace, repHR float64) *CardioWorkout {
	stretches := []stretch{{900, pace(380), 130}}
	for range reps {
		half := 0.4 * repPace
		stretches = append(stretches,
			stretch{half, pace(repPace), 140}, stretch{half, pace(repPace), repHR}, stretch{120, pace(420), 135})
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
		easy    bool
	}{
		{"all reps", intervalRun(6, 275, 165), VerdictMet, "6", false},
		{"one rep short", intervalRun(5, 275, 165), VerdictMet, "5", false},
		{"two reps short", intervalRun(4, 275, 165), VerdictPartial, "4", false},
		{"reps too easy", intervalRun(6, 300, 148), VerdictPartial, "6", true},
		{"reps too hard", intervalRun(6, 250, 180), VerdictMet, "6", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			// Distance is judged too; only the rep checks matter here.
			tt.workout.DistanceM = fp(8000)
			v := evaluateSession(s, tt.workout, "2026-10-14", testZones)
			if v.Status != tt.status || v.TooEasy != tt.easy {
				t.Errorf("expected %s (too easy: %v), got %+v", tt.status, tt.easy, v)
			}
			if c := check(t, v, "Reps"); c.Actual != tt.reps {
				t.Errorf("expected %s reps found, got %+v", tt.reps, c)
			}
		})
	}

	v := evaluateSession(s, intervalRun(6, 275, 165), "2026-10-14", testZones)
	if c := check(t, v, "Median rep length"); !c.OK {
		t.Errorf("expected reps of about 800 m, got %+v", c)
	}
	// Only the second halves of the reps count, once the heart rate is up.
	if c := check(t, v, "Rep heart rate"); !c.OK || c.Target != "zone 4 (159–171 bpm)" || c.Warning != "" {
		t.Errorf("expected reps in zone 4, got %+v", c)
	}
	hard := evaluateSession(s, intervalRun(6, 250, 180), "2026-10-14", testZones)
	if c := check(t, hard, "Rep heart rate"); !c.OK || c.Warning == "" {
		t.Errorf("expected hard reps to count with a warning, got %+v", c)
	}
}

func TestEvaluateSession_IntervalsWithoutZones(t *testing.T) {
	v := evaluateSession(intervals(), intervalRun(6, 275, 165), "2026-10-14", nil)
	for _, c := range v.Checks {
		if c.Name == "Rep heart rate" {
			t.Fatalf("expected no heart rate check without zones, got %+v", c)
		}
	}
	if c := check(t, v, "Reps"); c.Actual != "6" {
		t.Errorf("expected reps still counted, got %+v", c)
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

	v := evaluateSession(s, w, "2026-10-14", testZones)
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
	if v := evaluateSession(s, w, "2026-10-14", testZones); v.Status != VerdictMet || len(v.Checks) != 1 {
		t.Errorf("expected met on distance alone, got %+v", v)
	}
}

func TestEvaluateSession_IntervalsWithoutSampleDistance(t *testing.T) {
	// A treadmill session with its distance entered by hand: the samples have
	// no distance to find reps in, so reps aren't checked rather than missed.
	w := intervalRun(6, 275, 165)
	for i := range w.Samples {
		w.Samples[i].D = 0
	}
	w.ManualDistance = true
	v := evaluateSession(intervals(), w, "2026-10-14", testZones)
	for _, c := range v.Checks {
		if c.Name == "Reps" {
			t.Fatalf("expected no reps check, got %+v", c)
		}
	}
	if c := check(t, v, "Distance"); !c.OK {
		t.Errorf("expected the distance met, got %+v", c)
	}
}

// longRideWithTempo is a 60 km long ride with 20 km in zone 3 in the middle.
func longRideWithTempo() PlannedSession {
	return PlannedSession{
		Date: "2026-10-14", Activity: ActivityCycling, Kind: KindLong, TargetDistanceM: fp(60000),
		TempoBlock: &TempoBlock{DistanceM: 20000},
	}
}

// thirds rides 60 km at 30 km/h, in three 20 km stretches of 40 minutes,
// at a heart rate for the outer and the middle ones.
func thirds(outer, middle float64) *CardioWorkout {
	return synthetic(ActivityCycling, stretch{2400, 30 / 3.6, outer}, stretch{2400, 30 / 3.6, middle}, stretch{2400, 30 / 3.6, outer})
}

func TestEvaluateSession_TempoBlockByZone(t *testing.T) {
	v := evaluateSession(longRideWithTempo(), thirds(125, 150), "2026-10-14", testZones)
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "150 bpm" || c.Target != "zone 3 (146–158 bpm)" {
		t.Errorf("expected the block at 150 bpm, got %+v", c)
	}
	if len(v.Checks) != 2 || v.Status != VerdictMet {
		t.Errorf("expected met on distance and block alone, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockTooEasy(t *testing.T) {
	v := evaluateSession(longRideWithTempo(), thirds(125, 130), "2026-10-14", testZones)
	if c := check(t, v, "Tempo block heart rate"); c.OK {
		t.Errorf("expected the block too easy, got %+v", c)
	}
	if v.Status != VerdictPartial {
		t.Errorf("expected partial, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockTooHardCountsWithAWarning(t *testing.T) {
	v := evaluateSession(longRideWithTempo(), thirds(125, 170), "2026-10-14", testZones)
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "170 bpm" || c.Warning == "" {
		t.Errorf("expected the hard block to count with a warning, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockRestNotChecked(t *testing.T) {
	// Around the block the session is easy, run by zone.
	v := evaluateSession(longRideWithTempo(), thirds(150, 150), "2026-10-14", testZones)
	if len(v.Checks) != 2 || v.Status != VerdictMet {
		t.Errorf("expected met on distance and block alone, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockNotQuiteInTheMiddle(t *testing.T) {
	// The block started 2 km late and its heart rate took a minute to rise.
	w := synthetic(ActivityCycling, stretch{2640 + 60, 30 / 3.6, 125}, stretch{2340, 30 / 3.6, 150}, stretch{2160, 30 / 3.6, 125})
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14", testZones)
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "150 bpm" {
		t.Errorf("expected the block's heart rate found, got %+v", c)
	}
}

func TestEvaluateSession_TempoBlockIndoorsByTime(t *testing.T) {
	// An indoor ride's samples have heart rate but no distance, so the block
	// is the middle third of the time.
	w := thirds(125, 150)
	for i := range w.Samples {
		w.Samples[i].D = 0
	}
	w.ManualDistance = true
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14", testZones)
	if c := check(t, v, "Tempo block heart rate"); !c.OK || c.Actual != "150 bpm" {
		t.Errorf("expected the block at 150 bpm, got %+v", c)
	}
	if v.Status != VerdictMet {
		t.Errorf("expected met, got %+v", v)
	}
}

func TestEvaluateSession_TempoBlockWithoutSamples(t *testing.T) {
	// Without samples the block can't be told from the rest, so only the
	// distance is checked.
	w := &CardioWorkout{Activity: ActivityCycling, DurationSeconds: 7200, DistanceM: fp(60000), AvgHeartRate: fp(127)}
	v := evaluateSession(longRideWithTempo(), w, "2026-10-14", testZones)
	if v.Status != VerdictMet || len(v.Checks) != 1 {
		t.Errorf("expected met on distance alone, got %+v", v)
	}
}
