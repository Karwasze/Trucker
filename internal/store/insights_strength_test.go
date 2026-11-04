package store

import (
	"testing"
)

// seedLift logs a workout with one lift, a single set of weight × reps.
func seedLift(t *testing.T, s *Store, date, exercise string, sets ...Set) {
	t.Helper()
	if _, err := s.SaveWorkout(Workout{Date: date, Exercises: []Exercise{{Name: exercise, Sets: sets}}}); err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
}

func seedWeights(t *testing.T, s *Store, weights map[string]float64) {
	t.Helper()
	for date, w := range weights {
		if err := s.SaveBodyweight(date, w); err != nil {
			t.Fatalf("failed to seed bodyweight: %v", err)
		}
	}
}

func strengthInsights(t *testing.T, s *Store, today, from string, planID int) StrengthInsights {
	t.Helper()
	insights, err := s.GetStrengthInsights(today, from, planID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return insights
}

func one(weight float64) Set { return Set{Weight: weight, Reps: 1} }

func TestStrengthInsights_Empty(t *testing.T) {
	s := newTestStore(t)
	got := strengthInsights(t, s, insightsToday, "", 0)
	if got.Projections == nil || got.Plateaus == nil || got.Fatigue == nil ||
		got.Patterns.Weekdays == nil || got.Patterns.RestDays == nil {
		t.Errorf("expected empty lists rather than nil, got %+v", got)
	}
	if got.WeakLink != nil || got.Relative != nil || got.Interference != nil {
		t.Errorf("expected nothing to say without data, got %+v", got)
	}
}

func TestStrengthInsights_ProjectionSoonerOnACut(t *testing.T) {
	s := newTestStore(t)
	// 10 kg in 28 days, 10 kg short of intermediate (1.5 × 80).
	seedLift(t, s, "2026-03-03", "Squat", one(100))
	seedLift(t, s, "2026-03-17", "Squat", one(105))
	seedLift(t, s, "2026-03-31", "Squat", one(110))

	seedWeights(t, s, map[string]float64{"2026-03-31": 80})
	steady := strengthInsights(t, s, insightsToday, "", 0)
	if len(steady.Projections) != 1 {
		t.Fatalf("expected a squat projection, got %+v", steady.Projections)
	}
	p := steady.Projections[0]
	if p.Level != "novice" || p.NextLevel != "intermediate" || p.TargetKg != 120 || p.PerMonth != 10.9 {
		t.Errorf("unexpected projection %+v", p)
	}
	if p.DaysSteadyWeight == nil || *p.DaysSteadyWeight < 28 || *p.DaysSteadyWeight > 29 {
		t.Errorf("expected about 28 days at a steady weight, got %v", p.DaysSteadyWeight)
	}
	if p.WeightPerWeek != nil {
		t.Errorf("expected no weight trend from one weigh-in, got %v", *p.WeightPerWeek)
	}

	// Losing 1 kg a week brings the 1.5× target down 1.5 kg a week.
	seedWeights(t, s, map[string]float64{"2026-03-17": 82, "2026-03-24": 81})
	cut := strengthInsights(t, s, insightsToday, "", 0).Projections[0]
	if cut.WeightPerWeek == nil || *cut.WeightPerWeek != -1 {
		t.Fatalf("expected -1 kg a week, got %v", cut.WeightPerWeek)
	}
	// 10 kg at 10/28 kg a day plus 1.5/7 kg a day off the target.
	if cut.Days == nil || *cut.Days != 18 {
		t.Errorf("expected 18 days with the cut, got %v", cut.Days)
	}
}

func TestStrengthInsights_ProjectionNeedsATrend(t *testing.T) {
	s := newTestStore(t)
	seedWeights(t, s, map[string]float64{"2026-03-31": 80})
	seedLift(t, s, "2026-03-24", "Squat", one(100))
	seedLift(t, s, "2026-03-31", "Squat", one(105))
	if got := strengthInsights(t, s, insightsToday, "", 0).Projections; len(got) != 0 {
		t.Errorf("expected no projection from two sessions a week apart, got %+v", got)
	}
}

func TestStrengthInsights_ProjectionWhenNotRising(t *testing.T) {
	s := newTestStore(t)
	seedWeights(t, s, map[string]float64{"2026-03-31": 80})
	for _, date := range []string{"2026-03-03", "2026-03-17", "2026-03-31"} {
		seedLift(t, s, date, "Squat", one(110))
	}
	p := strengthInsights(t, s, insightsToday, "", 0).Projections[0]
	if p.Days != nil || p.DaysSteadyWeight != nil {
		t.Errorf("expected no date for a flat lift, got %+v", p)
	}
}

func TestStrengthInsights_PlateauWithDietContext(t *testing.T) {
	s := newTestStore(t)
	for _, date := range []string{"2026-03-03", "2026-03-10", "2026-03-17", "2026-03-24", "2026-03-31"} {
		seedLift(t, s, date, "Bench Press", one(80))
	}
	for i, date := range []string{"2026-03-03", "2026-03-17", "2026-03-31"} {
		seedLift(t, s, date, "Squat", one(100+float64(i)*5))
	}
	// Squat is rising, so only bench stalled.
	seedLift(t, s, "2026-03-10", "Squat", one(102))
	seedLift(t, s, "2026-03-24", "Squat", one(108))
	seedWeights(t, s, map[string]float64{"2026-03-03": 82.5, "2026-03-31": 80})
	protein := 160.0
	s.SaveDietDay(DietDay{Date: "2026-03-10", Adhered: true, ProteinG: &protein})
	s.SaveDietDay(DietDay{Date: "2026-03-11", Adhered: false})
	s.SaveDietDay(DietDay{Date: "2026-02-01", Adhered: false})

	got := strengthInsights(t, s, insightsToday, "", 0).Plateaus
	if len(got) != 1 {
		t.Fatalf("expected one plateau, got %+v", got)
	}
	p := got[0]
	if p.Exercise != "Bench Press" || p.Status != PlateauFlat || p.Weeks != 4 || p.Sessions != 5 || p.ChangePct != 0 {
		t.Errorf("unexpected plateau %+v", p)
	}
	if p.WeightChangeKg == nil || *p.WeightChangeKg != -2.5 {
		t.Errorf("expected -2.5 kg, got %v", p.WeightChangeKg)
	}
	if p.DietLogged != 2 || p.DietAdhered != 1 {
		t.Errorf("expected 1 of 2 diet days in the window, got %d of %d", p.DietAdhered, p.DietLogged)
	}
	// 160 g over an average of 81.25 kg.
	if p.ProteinPerKg == nil || *p.ProteinPerKg != 1.97 {
		t.Errorf("expected 1.97 g/kg, got %v", p.ProteinPerKg)
	}
}

func TestStrengthInsights_PlateauDecliningAndOld(t *testing.T) {
	s := newTestStore(t)
	for i, date := range []string{"2026-03-03", "2026-03-10", "2026-03-17", "2026-03-24", "2026-03-31"} {
		seedLift(t, s, date, "Deadlift", one(150-float64(i)*2))
	}
	// Flat, but not trained for over two weeks: dropped, not stalled.
	for _, date := range []string{"2026-02-10", "2026-02-17", "2026-02-24", "2026-03-10"} {
		seedLift(t, s, date, "Overhead Press", one(50))
	}
	got := strengthInsights(t, s, insightsToday, "", 0).Plateaus
	if len(got) != 1 || got[0].Exercise != "Deadlift" || got[0].Status != PlateauDeclining {
		t.Errorf("expected a declining deadlift only, got %+v", got)
	}
}

func TestStrengthInsights_WeakLink(t *testing.T) {
	s := newTestStore(t)
	seedLift(t, s, "2026-03-30", "Squat", one(100))
	seedLift(t, s, "2026-03-30", "Bench Press", one(75))
	seedLift(t, s, "2026-03-30", "Deadlift", one(120))
	seedLift(t, s, "2026-03-30", "Overhead Press", one(30))

	link := strengthInsights(t, s, insightsToday, "", 0).WeakLink
	if link == nil || len(link.Lifts) != 4 || link.Lagging != "Overhead Press" {
		t.Fatalf("expected overhead press lagging, got %+v", link)
	}
	for _, l := range link.Lifts {
		if l.Exercise == "Overhead Press" && l.Balance >= -0.1 {
			t.Errorf("expected overhead press well behind, got %+v", l)
		}
	}
}

func TestStrengthInsights_WeakLinkBalanced(t *testing.T) {
	s := newTestStore(t)
	seedLift(t, s, "2026-03-30", "Squat", one(100))
	seedLift(t, s, "2026-03-30", "Deadlift", one(118))
	link := strengthInsights(t, s, insightsToday, "", 0).WeakLink
	if link == nil || link.Lagging != "" {
		t.Errorf("expected balanced lifts, got %+v", link)
	}
}

func TestStrengthInsights_RelativeStrengthVerdicts(t *testing.T) {
	cases := []struct {
		name    string
		squat   []float64
		weights map[string]float64
		verdict string
	}{
		{"held on a cut", []float64{100, 100, 100}, map[string]float64{"2026-03-03": 82, "2026-03-31": 80}, MuscleKeeping},
		{"falling faster than weight", []float64{100, 95, 90}, map[string]float64{"2026-03-03": 82, "2026-03-31": 80}, MuscleTooAggressive},
		{"slipping a little", []float64{100, 99, 98}, map[string]float64{"2026-03-03": 82, "2026-03-31": 80}, MuscleMixed},
		{"not cutting", []float64{100, 100, 100}, map[string]float64{"2026-03-03": 80, "2026-03-31": 80.2}, MuscleNotCutting},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := newTestStore(t)
			for i, date := range []string{"2026-03-03", "2026-03-17", "2026-03-31"} {
				seedLift(t, s, date, "Squat", one(c.squat[i]))
			}
			seedWeights(t, s, c.weights)
			r := strengthInsights(t, s, insightsToday, "", 0).Relative
			if r == nil || r.Verdict != c.verdict {
				t.Fatalf("expected %s, got %+v", c.verdict, r)
			}
		})
	}

	s := newTestStore(t)
	for _, date := range []string{"2026-03-03", "2026-03-17", "2026-03-31"} {
		seedLift(t, s, date, "Squat", one(100))
	}
	seedWeights(t, s, map[string]float64{"2026-03-03": 82, "2026-03-31": 80})
	r := strengthInsights(t, s, insightsToday, "", 0).Relative
	// 100 kg at 82 kg to 100 kg at 80 kg: 2.5% more per kg.
	if r.WeightChangeKg != -2 || r.WeightChangePct != -2.4 || r.Lifts[0].PerKgChangePct != 2.5 {
		t.Errorf("unexpected relative strength %+v", r)
	}
}

func TestStrengthInsights_RestDays(t *testing.T) {
	s := newTestStore(t)
	// Up after 2 rest days, down after 1.
	seedLift(t, s, "2026-03-02", "Squat", one(100))
	seedLift(t, s, "2026-03-05", "Squat", one(110))
	seedLift(t, s, "2026-03-07", "Squat", one(99))
	seedLift(t, s, "2026-03-12", "Squat", one(103))

	got := strengthInsights(t, s, insightsToday, "", 0).Patterns.RestDays
	want := map[string]float64{"2": 10, "0–1": -5.7, "3+": 0}
	if len(got) != 3 {
		t.Fatalf("expected three buckets, got %+v", got)
	}
	for _, r := range got {
		if r.Sessions != 1 || r.AvgChangePct != want[r.Rest] {
			t.Errorf("expected %v%% after %s rest days, got %+v", want[r.Rest], r.Rest, r)
		}
	}
}

func TestStrengthInsights_SkippedWeekdays(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)
	// Every Monday done, Thursdays only once.
	for _, date := range []string{"2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"} {
		seedPlanWorkout(t, s, plan.ID, date, []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	}
	seedPlanWorkout(t, s, plan.ID, "2026-03-05", []Exercise{{Name: "Bench Press", Sets: sets(3, 60, 5)}})

	got := strengthInsights(t, s, insightsToday, "", plan.ID).Patterns.Weekdays
	if len(got) != 2 {
		t.Fatalf("expected Mondays and Thursdays, got %+v", got)
	}
	if got[0] != (WeekdaySkips{"monday", 5, 0}) || got[1] != (WeekdaySkips{"thursday", 4, 3}) {
		t.Errorf("unexpected skips %+v", got)
	}
}

func TestStrengthInsights_CardioInterference(t *testing.T) {
	s := newTestStore(t)
	ride := 100 * 60.0
	seedCardio(t, s, CardioWorkout{Date: "2026-03-09", StartedAt: "2026-03-09T07:00:00Z", Activity: ActivityCycling, DurationSeconds: ride})
	// A long walk isn't hard.
	seedCardio(t, s, CardioWorkout{Date: "2026-03-19", StartedAt: "2026-03-19T07:00:00Z", Activity: ActivityWalking, DurationSeconds: 120 * 60})
	seedLift(t, s, "2026-03-03", "Squat", one(100))
	seedLift(t, s, "2026-03-06", "Squat", one(102))
	seedLift(t, s, "2026-03-10", "Squat", one(96)) // the day after the ride
	seedLift(t, s, "2026-03-20", "Squat", one(104))

	ci := strengthInsights(t, s, insightsToday, "", 0).Interference
	if ci == nil || ci.HardSessions != 1 {
		t.Fatalf("expected one hard session, got %+v", ci)
	}
	if ci.AfterHard.Sessions != 1 || ci.AfterHard.AvgChangePct != -5 {
		t.Errorf("expected squat 5%% down after the ride, got %+v", ci.AfterHard)
	}
	if ci.Fresh.Sessions != 2 {
		t.Errorf("expected two fresh sessions, got %+v", ci.Fresh)
	}
}

func TestCardioLoads_HardByZones(t *testing.T) {
	zones := []HeartRateZones{{Date: "2026-01-01", Zones: computeHeartRateZones(190, 50)}}
	hr := func(v float64) *float64 { return &v }
	// 25 minutes at 180 bpm, zone 5.
	tempo := CardioWorkout{Date: "2026-03-01", Activity: ActivityRunning, DurationSeconds: 1500,
		Samples: []CardioSample{{T: 0, HR: hr(180)}, {T: 600, HR: hr(180)}}}
	easy := CardioWorkout{Date: "2026-03-02", Activity: ActivityRunning, DurationSeconds: 1800, AvgHeartRate: hr(120)}
	unknown := CardioWorkout{Date: "2026-03-03", Activity: ActivityRunning, DurationSeconds: 1800}

	loads := cardioLoads([]CardioWorkout{tempo, easy, unknown}, zones)
	if !loads[0].hard || loads[0].zoneSeconds[4] != 1500 || loads[0].load != 125 {
		t.Errorf("expected 25 hard minutes in zone 5, got %+v", loads[0])
	}
	if loads[1].hard || loads[1].zoneSeconds[0] != 1800 || loads[1].load != 30 {
		t.Errorf("expected 30 easy minutes in zone 1, got %+v", loads[1])
	}
	if loads[2].hrKnown || loads[2].load != 60 || loads[2].hard {
		t.Errorf("expected an unknown session counted as zone 2, got %+v", loads[2])
	}
}

func TestStrengthInsights_GrowingFatigue(t *testing.T) {
	s := newTestStore(t)
	dates := []string{"2026-03-02", "2026-03-05", "2026-03-09", "2026-03-12", "2026-03-16", "2026-03-19"}
	for i, date := range dates {
		last := 5
		if i >= 3 {
			last = 3
		}
		seedLift(t, s, date, "Squat", Set{Weight: 100, Reps: 5}, Set{Weight: 100, Reps: 5}, Set{Weight: 100, Reps: last})
		// Steady sets of bench.
		seedLift(t, s, date, "Bench Press", Set{Weight: 60, Reps: 5}, Set{Weight: 60, Reps: 5})
	}
	got := strengthInsights(t, s, insightsToday, "", 0).Fatigue
	if len(got) != 2 {
		t.Fatalf("expected two lifts, got %+v", got)
	}
	if got[0].Exercise != "Squat" || !got[0].Growing || got[0].RecentDrop != 2 || got[0].EarlierDrop != 0 {
		t.Errorf("expected squat fatigue growing first, got %+v", got[0])
	}
	if got[1].Growing {
		t.Errorf("expected steady bench, got %+v", got[1])
	}
}

func TestRepDrop_IgnoresWarmups(t *testing.T) {
	drop, ok := repDrop([]Set{{Weight: 60, Reps: 10}, {Weight: 100, Reps: 6}, {Weight: 100, Reps: 4}})
	if !ok || drop != 2 {
		t.Errorf("expected a drop of 2 working reps, got %v %v", drop, ok)
	}
	if _, ok := repDrop([]Set{{Weight: 60, Reps: 10}, {Weight: 100, Reps: 6}}); ok {
		t.Error("expected no drop from a single working set")
	}
}

func TestWeightNear(t *testing.T) {
	entries := []BodyweightEntry{{Date: "2026-03-01", Weight: 80}, {Date: "2026-03-11", Weight: 79}}
	if w, ok := weightNear(entries, "2026-03-06"); !ok || w != 79.5 {
		t.Errorf("expected 79.5 between weigh-ins, got %v %v", w, ok)
	}
	if w, ok := weightNear(entries, "2026-03-20"); !ok || w != 79 {
		t.Errorf("expected the last weigh-in, got %v %v", w, ok)
	}
	if _, ok := weightNear(entries, "2026-04-30"); ok {
		t.Error("expected no weight far from any weigh-in")
	}
}
