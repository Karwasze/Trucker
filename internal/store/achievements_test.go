package store

import (
	"math"
	"testing"
)

// achievement finds an achievement by ID, failing the test without it.
func achievement(t *testing.T, list []Achievement, id string) Achievement {
	t.Helper()
	for _, a := range list {
		if a.ID == id {
			return a
		}
	}
	t.Fatalf("no achievement %q in %+v", id, list)
	return Achievement{}
}

func listAchievements(t *testing.T, s *Store) []Achievement {
	t.Helper()
	list, err := s.ListAchievements()
	if err != nil {
		t.Fatalf("ListAchievements: %v", err)
	}
	return list
}

// earned is the dates each tier was earned on, "" for tiers still to earn.
func earned(a Achievement) []string {
	dates := make([]string, len(a.Tiers))
	for i, tier := range a.Tiers {
		dates[i] = tier.EarnedOn
	}
	return dates
}

func equalDates(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestListAchievements_NothingLogged(t *testing.T) {
	s := newTestStore(t)
	list := listAchievements(t, s)
	if len(list) == 0 {
		t.Fatal("expected every achievement listed, still to earn")
	}
	for _, a := range list {
		if a.Best != nil {
			t.Errorf("%s: expected no best, got %v", a.ID, *a.Best)
		}
		for _, tier := range a.Tiers {
			if tier.EarnedOn != "" {
				t.Errorf("%s: expected nothing earned, got %+v", a.ID, tier)
			}
		}
	}
}

func TestBestSegment_FindsTheFastestStretchInsideALongerWorkout(t *testing.T) {
	// 10 km: the first and last 2.5 km at 6:00/km, the middle 5 km at 4:00/km.
	samples := []CardioSample{
		{T: 0, D: 0},
		{T: 900, D: 2500},
		{T: 2100, D: 7500},
		{T: 3000, D: 10000},
	}
	got, ok := bestSegment(samples, 5000)
	if !ok || math.Abs(got-1200) > 0.001 {
		t.Errorf("expected the middle 5 km in 1200 s, got %v (%v)", got, ok)
	}
	// A stretch starting between samples is interpolated: 6 km is the fast
	// 5 km plus 1 km at 6:00/km.
	if got, ok := bestSegment(samples, 6000); !ok || math.Abs(got-1560) > 0.001 {
		t.Errorf("expected 6 km in 1560 s, got %v (%v)", got, ok)
	}
	if _, ok := bestSegment(samples, 10001); ok {
		t.Error("expected no stretch longer than the workout")
	}
}

func TestListAchievements_PaceFromTheBestStretch(t *testing.T) {
	s := newTestStore(t)
	// A 10 km run with a 24-minute 5 km inside it.
	run := cardio(ActivityRunning, "2026-03-10", 10000, 3060)
	run.Samples = []CardioSample{{T: 0, D: 0}, {T: 900, D: 2500}, {T: 2340, D: 7500}, {T: 3060, D: 10000}}
	// Later, a 19:30 parkrun without samples counts as a whole.
	seedCardio(t, s, run, cardio(ActivityRunning, "2026-04-04", 5000, 1170))

	list := listAchievements(t, s)
	fiveK := achievement(t, list, "pace-running-5000")
	if want := []string{"2026-03-10", "2026-03-10", "2026-04-04"}; !equalDates(earned(fiveK), want) {
		t.Errorf("expected 5 km tiers earned on %v, got %v", want, earned(fiveK))
	}
	if fiveK.Best == nil || *fiveK.Best != 1170 {
		t.Errorf("expected a best 5 km of 1170 s, got %v", fiveK.Best)
	}
	if fiveK.Tiers[0].WorkoutID == 0 || fiveK.Tiers[2].WorkoutID == fiveK.Tiers[0].WorkoutID {
		t.Errorf("expected each tier to link the workout that earned it, got %+v", fiveK.Tiers)
	}

	// 10 km in 51 minutes earns only the first tier.
	tenK := achievement(t, list, "pace-running-10000")
	if want := []string{"2026-03-10", "", ""}; !equalDates(earned(tenK), want) {
		t.Errorf("expected 10 km tiers earned on %v, got %v", want, earned(tenK))
	}
	// Rides don't count towards running.
	if ride := achievement(t, list, "pace-cycling-20000"); ride.Best != nil {
		t.Errorf("expected no ride best, got %v", *ride.Best)
	}
}

func TestListAchievements_PaceScalesARunJustShortOfTheDistance(t *testing.T) {
	s := newTestStore(t)
	// GPS made a 5 km race 4.96 km: 19:50 there is 20:00 for 5 km.
	seedCardio(t, s, cardio(ActivityRunning, "2026-03-10", 4960, 1190))
	fiveK := achievement(t, listAchievements(t, s), "pace-running-5000")
	if fiveK.Best == nil || math.Abs(*fiveK.Best-1200) > 0.5 {
		t.Errorf("expected a best 5 km of 1200 s, got %v", fiveK.Best)
	}
	if want := []string{"2026-03-10", "2026-03-10", "2026-03-10"}; !equalDates(earned(fiveK), want) {
		t.Errorf("expected every tier earned, got %v", earned(fiveK))
	}

	// Further short doesn't count.
	s = newTestStore(t)
	seedCardio(t, s, cardio(ActivityRunning, "2026-03-10", 4800, 1000))
	if fiveK := achievement(t, listAchievements(t, s), "pace-running-5000"); fiveK.Best != nil {
		t.Errorf("expected no 5 km from 4.8 km, got %v", *fiveK.Best)
	}
}

func TestListAchievements_Distance(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s,
		cardio(ActivityRunning, "2026-03-01", 10000, 3600),
		// A half marathon a little short on GPS still counts.
		cardio(ActivityRunning, "2026-04-12", 20950, 7200),
		cardio(ActivityRunning, "2026-05-01", 8000, 2400),
		cardio(ActivitySwimming, "2026-03-02", 1500, 2400),
		// Walks don't count as runs.
		cardio(ActivityWalking, "2026-03-03", 45000, 36000),
	)
	list := listAchievements(t, s)

	run := achievement(t, list, "distance-running")
	if want := []string{"2026-03-01", "2026-03-01", "2026-04-12", ""}; !equalDates(earned(run), want) {
		t.Errorf("expected running distances earned on %v, got %v", want, earned(run))
	}
	if run.Best == nil || *run.Best != 20950 {
		t.Errorf("expected a longest run of 20950 m, got %v", run.Best)
	}
	swim := achievement(t, list, "distance-swimming")
	if want := []string{"2026-03-02", "2026-03-02", "", ""}; !equalDates(earned(swim), want) {
		t.Errorf("expected swimming distances earned on %v, got %v", want, earned(swim))
	}
}

func TestListAchievements_TriathlonEarnsItsClassAndShorterOnes(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s, quarter("2026-06-07", 1500, 5400, 3600)...)
	tri := achievement(t, listAchievements(t, s), "triathlon")
	if want := []string{"2026-06-07", "2026-06-07", "", ""}; !equalDates(earned(tri), want) {
		t.Errorf("expected sprint and quarter earned, got %v", earned(tri))
	}
	if tri.Tiers[1].Name != "Quarter Ironman" {
		t.Errorf("expected the quarter tier named, got %+v", tri.Tiers[1])
	}
}

func TestListAchievements_StrengthAgainstBodyweightAtTheTime(t *testing.T) {
	s := newTestStore(t)
	for _, e := range []BodyweightEntry{{"2026-01-01", 100}, {"2026-03-01", 80}} {
		if err := s.SaveBodyweight(e.Date, e.Weight); err != nil {
			t.Fatal(err)
		}
	}
	// 125 kg is 1.25x at 100 kg: novice.
	seedWorkout(t, s, "2026-02-01", []Exercise{{Name: "Squat", Sets: sets(1, 125, 1)}})
	// 100 kg × 5 is an estimated 112.5 kg, 1.41x at 80 kg: still novice.
	seedWorkout(t, s, "2026-03-05", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	// 120 kg is 1.5x at 80 kg: intermediate.
	id := seedWorkout(t, s, "2026-04-01", []Exercise{{Name: "Squat", Sets: sets(1, 120, 1)}})

	squat := achievement(t, listAchievements(t, s), "strength-squat")
	if want := []string{"2026-02-01", "2026-04-01", "", ""}; !equalDates(earned(squat), want) {
		t.Errorf("expected squat levels earned on %v, got %v", want, earned(squat))
	}
	if squat.Tiers[1].Name != "Intermediate" || squat.Tiers[1].WorkoutID != id {
		t.Errorf("expected intermediate earned by workout %d, got %+v", id, squat.Tiers[1])
	}
	if squat.Best == nil || *squat.Best != 1.5 {
		t.Errorf("expected a best ratio of 1.5, got %v", squat.Best)
	}
}

func TestListAchievements_StrengthBeforeTheFirstBodyweightUsesIt(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-01-10", []Exercise{{Name: "Bench Press", Sets: sets(1, 80, 1)}})
	bench := achievement(t, listAchievements(t, s), "strength-bench-press")
	if bench.Best != nil {
		t.Errorf("expected no ratio without a bodyweight, got %v", *bench.Best)
	}

	if err := s.SaveBodyweight("2026-02-01", 80); err != nil {
		t.Fatal(err)
	}
	bench = achievement(t, listAchievements(t, s), "strength-bench-press")
	if want := []string{"2026-01-10", "", "", ""}; !equalDates(earned(bench), want) {
		t.Errorf("expected novice earned on 2026-01-10, got %v", earned(bench))
	}
}
