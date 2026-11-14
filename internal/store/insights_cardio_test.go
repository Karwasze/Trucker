package store

import (
	"testing"
)

func cardioInsights(t *testing.T, s *Store, today, from string) CardioInsights {
	t.Helper()
	insights, err := s.GetCardioInsights(today, from)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return insights
}

func withHR(w CardioWorkout, avg float64) CardioWorkout {
	w.AvgHeartRate = &avg
	return w
}

func TestCardioInsights_Empty(t *testing.T) {
	s := newTestStore(t)
	got := cardioInsights(t, s, insightsToday, "")
	if got.Efficiency == nil || got.Drift == nil {
		t.Errorf("expected empty lists rather than nil, got %+v", got)
	}
	if got.RunWeight != nil || got.Intensity != nil || got.Load != nil || got.Compliance != nil ||
		got.RestingHR != nil || got.Diet != nil {
		t.Errorf("expected nothing to say without data, got %+v", got)
	}
}

func TestCardioInsights_EfficiencyUsesDailyRestingHR(t *testing.T) {
	s := newTestStore(t)
	s.SaveRestingHeartRates([]RestingHeartRate{{"2026-03-01", 60}, {"2026-03-15", 55}, {"2026-03-29", 50}})
	// 3 m/s each time, at 150, 150 and 130 bpm against resting heart rates
	// of 60, 55 and 50: 2.0, 1.89 and 2.25 metres per beat above resting.
	seedCardio(t, s,
		withHR(cardio(ActivityRunning, "2026-03-01", 6000, 2000), 150),
		withHR(cardio(ActivityRunning, "2026-03-15", 6000, 2000), 150),
		withHR(cardio(ActivityRunning, "2026-03-29", 6000, 2000), 130),
		// Without a heart rate it doesn't count.
		cardio(ActivityRunning, "2026-03-30", 6000, 2000),
	)
	got := cardioInsights(t, s, insightsToday, "").Efficiency
	if len(got) != 1 || got[0].Activity != ActivityRunning || got[0].Sessions != 3 {
		t.Fatalf("expected a running trend from 3 sessions, got %+v", got)
	}
	if got[0].End <= got[0].Start {
		t.Errorf("expected efficiency to rise, got %+v", got[0])
	}
}

func TestCardioInsights_EfficiencyFallsBackToProfile(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.SetHeartRateProfile("2026-01-01", 190, 50); err != nil {
		t.Fatal(err)
	}
	for _, date := range []string{"2026-03-01", "2026-03-15", "2026-03-29"} {
		seedCardio(t, s, withHR(cardio(ActivityRunning, date, 6000, 2000), 150))
	}
	got := cardioInsights(t, s, insightsToday, "").Efficiency
	// 3 m/s × 60 over 100 beats above resting.
	if len(got) != 1 || got[0].Start != 1.8 || got[0].End != 1.8 {
		t.Errorf("expected 1.8 m/beat from the profile's resting heart rate, got %+v", got)
	}
}

func TestCardioInsights_RunPaceAgainstWeight(t *testing.T) {
	s := newTestStore(t)
	// 10% faster over a month while 2% lighter.
	seedCardio(t, s,
		cardio(ActivityRunning, "2026-03-01", 5000, 1650),
		cardio(ActivityRunning, "2026-03-15", 5000, 1571.43),
		cardio(ActivityRunning, "2026-03-29", 5000, 1500),
	)
	seedWeights(t, s, map[string]float64{"2026-03-01": 80, "2026-03-29": 78.4})
	r := cardioInsights(t, s, insightsToday, "").RunWeight
	if r == nil {
		t.Fatal("expected a split of the pace change")
	}
	if r.WeightChangeKg != -1.6 || r.WeightChangePct != -2 || r.WeightPct != 2 {
		t.Errorf("expected 2%% of the gain down to weight, got %+v", r)
	}
	if r.SpeedChangePct < 9.5 || r.SpeedChangePct > 10.5 || r.FitnessPct != round(r.SpeedChangePct-2, 1) {
		t.Errorf("expected about 10%% faster, 8%% of it fitness, got %+v", r)
	}
}

// longSession is an hour-long session with a sample a minute, holding
// speed while the heart rate goes from hr0 in the first half to hr1 in the
// second.
func longSession(date string, hr0, hr1 float64) CardioWorkout {
	w := cardio(ActivityRunning, date, 12000, 3600)
	for m := 0; m <= 60; m++ {
		hr := hr0
		if m >= 30 {
			hr = hr1
		}
		w.Samples = append(w.Samples, CardioSample{T: float64(m * 60), D: float64(m * 200), HR: &hr})
	}
	return w
}

func TestCardioInsights_CardiacDrift(t *testing.T) {
	s := newTestStore(t)
	short := longSession("2026-03-20", 140, 150)
	short.DurationSeconds = 1800
	seedCardio(t, s, longSession("2026-03-10", 140, 154), longSession("2026-03-24", 140, 144), short)

	got := cardioInsights(t, s, insightsToday, "").Drift
	if len(got) != 2 {
		t.Fatalf("expected the two long sessions, got %+v", got)
	}
	// Newest first: 140 → 144 bpm at the same speed is a 2.8% drift.
	if got[0].Date != "2026-03-24" || got[0].DriftPct != 2.8 || got[1].DriftPct != 9.1 {
		t.Errorf("unexpected drift %+v", got)
	}
}

func TestCardioInsights_CardiacDriftAssumesEvenPaceWithoutSampledDistance(t *testing.T) {
	s := newTestStore(t)
	// An indoor ride: the watch records heart rate but no distance, which
	// was entered by hand.
	ride := longSession("2026-03-24", 140, 144)
	ride.Activity = ActivityCycling
	indoor := true
	ride.Indoor = &indoor
	ride.ManualDistance = true
	for i := range ride.Samples {
		ride.Samples[i].D = 0
	}
	seedCardio(t, s, ride)

	got := cardioInsights(t, s, insightsToday, "").Drift
	if len(got) != 1 {
		t.Fatalf("expected the indoor ride, got %+v", got)
	}
	// At an even pace, 140 → 144 bpm is the same 2.8% as with distance.
	if got[0].DriftPct != 2.8 || !got[0].EvenPace || !got[0].Indoor {
		t.Errorf("expected 2.8%% drift marked as even pace indoors, got %+v", got[0])
	}
}

func TestCardioInsights_CardiacDriftMeasuredIsNotMarkedEvenPace(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s, longSession("2026-03-24", 140, 144))
	got := cardioInsights(t, s, insightsToday, "").Drift
	if len(got) != 1 || got[0].EvenPace {
		t.Errorf("expected measured drift, got %+v", got)
	}
}

func TestCardioInsights_IntensityAndLoad(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.SetHeartRateProfile("2026-01-01", 190, 50); err != nil {
		t.Fatal(err)
	}
	// Zone 1 below 134 bpm, zone 4 from 162.
	seedCardio(t, s,
		withHR(cardio(ActivityRunning, "2026-03-05", 8000, 3600), 120),
		withHR(cardio(ActivityRunning, "2026-03-12", 8000, 3600), 120),
		withHR(cardio(ActivityRunning, "2026-03-26", 8000, 3600), 120),
		withHR(cardio(ActivityRunning, "2026-03-30", 5000, 1800), 165),
		cardio(ActivityCycling, "2026-03-29", 20000, 3600),
		// Before the last 4 weeks.
		withHR(cardio(ActivityRunning, "2026-02-01", 8000, 3600), 165),
	)
	seedWeights(t, s, map[string]float64{"2026-03-10": 81, "2026-03-20": 80, "2026-03-30": 79})

	got := cardioInsights(t, s, insightsToday, "")
	in := got.Intensity
	if in == nil || in.Sessions != 4 || in.Unmeasured != 1 {
		t.Fatalf("expected 4 sessions with a heart rate and 1 without, got %+v", in)
	}
	if in.ZoneSeconds[0] != 3*3600 || in.ZoneSeconds[3] != 1800 || in.EasyShare != 0.857 {
		t.Errorf("unexpected zones %+v", in)
	}

	// Last 7 days: 60 (zone 1) + 120 (cycling at zone 2) + 120 (30 min in
	// zone 4); last 28 adds two more easy hours.
	l := got.Load
	if l == nil || l.Acute != 300 || l.ChronicWeekly != 105 || l.Ratio != 2.86 || l.HistoryDays != 28 {
		t.Fatalf("unexpected load %+v", l)
	}
	if l.WeightPerWeekKg == nil || *l.WeightPerWeekKg != -0.7 {
		t.Errorf("expected -0.7 kg a week, got %v", l.WeightPerWeekKg)
	}
}

func TestCardioInsights_IntensityNeedsZones(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s, withHR(cardio(ActivityRunning, "2026-03-30", 5000, 1800), 165))
	if got := cardioInsights(t, s, insightsToday, "").Intensity; got != nil {
		t.Errorf("expected no distribution without zones, got %+v", got)
	}
}

func TestCardioInsights_RestingHRTrend(t *testing.T) {
	s := newTestStore(t)
	var readings []RestingHeartRate
	// 30 days at 50 bpm, then a week at 56.
	for d := 37; d >= 1; d-- {
		date := mustDate(t, insightsToday).AddDate(0, 0, -d+1).Format(dateLayout)
		bpm := 50.0
		if d <= 7 {
			bpm = 56
		}
		readings = append(readings, RestingHeartRate{date, bpm})
	}
	s.SaveRestingHeartRates(readings)
	got := cardioInsights(t, s, insightsToday, "").RestingHR
	if got == nil || got.Current != 56 || got.CurrentDays != 7 || got.Baseline == nil || *got.Baseline != 50 ||
		got.BaselineDays != 30 || got.LatestDate != insightsToday {
		t.Errorf("unexpected trend %+v", got)
	}
}

func TestCardioInsights_RestingHRWithoutBaseline(t *testing.T) {
	s := newTestStore(t)
	s.SaveRestingHeartRates([]RestingHeartRate{{"2026-03-30", 52}})
	got := cardioInsights(t, s, insightsToday, "").RestingHR
	if got == nil || got.Current != 52 || got.Baseline != nil {
		t.Errorf("expected a reading without a baseline, got %+v", got)
	}
}

func TestCardioInsights_DietAfterBigSessions(t *testing.T) {
	s := newTestStore(t)
	kcal := 1200.0
	ride := cardio(ActivityCycling, "2026-03-07", 60000, 7200)
	short := cardio(ActivityRunning, "2026-03-14", 15000, 3000)
	short.EnergyKcal = &kcal
	seedCardio(t, s, ride, short, cardio(ActivityRunning, "2026-03-20", 5000, 1500))
	for date, adhered := range map[string]bool{
		"2026-03-08": false, "2026-03-15": false, "2026-03-21": true,
		"2026-03-22": true, "2026-03-23": false, "2026-03-24": true,
	} {
		s.SaveDietDay(DietDay{Date: date, Adhered: adhered})
	}
	got := cardioInsights(t, s, insightsToday, "").Diet
	if got == nil || got.BigSessions != 2 || got.AfterBig != (DietCount{2, 2}) || got.Other != (DietCount{4, 1}) {
		t.Errorf("unexpected diet after cardio %+v", got)
	}
}

func TestCardioInsights_ComplianceByKindActivityAndWeekday(t *testing.T) {
	s := newTestStore(t)
	sessions := []PlannedSession{
		{Date: "2026-03-04", Activity: ActivitySwimming, Kind: KindEasy},
		{Date: "2026-03-11", Activity: ActivitySwimming, Kind: KindEasy},
		{Date: "2026-03-08", Activity: ActivityRunning, Kind: KindLong},
	}
	goalID := seedGoalSessions(t, s, sessions)
	// Only the long run was done.
	seedCardio(t, s, cardio(ActivityRunning, "2026-03-08", 15000, 5400))
	workouts, _ := s.ListCardioWorkouts(ActivityRunning)
	planned, _ := s.GoalSessions(goalID, "", "", insightsToday)
	for _, p := range planned {
		if p.Activity == ActivityRunning {
			if err := s.MatchSession(p.ID, &workouts[0].ID, insightsToday); err != nil {
				t.Fatal(err)
			}
		}
	}

	c := cardioInsights(t, s, insightsToday, "").Compliance
	if c == nil {
		t.Fatal("expected compliance for the active goal")
	}
	swims := findGroup(c.ByActivity, ActivitySwimming)
	if swims == nil || swims.Missed != 2 || swims.Met != 0 {
		t.Errorf("expected both swims missed, got %+v", c.ByActivity)
	}
	if wed := findGroup(c.ByWeekday, "wednesday"); wed == nil || wed.Missed != 2 {
		t.Errorf("expected Wednesdays missed, got %+v", c.ByWeekday)
	}
	if long := findGroup(c.ByKind, KindLong); long == nil || long.Missed != 0 {
		t.Errorf("expected the long run not missed, got %+v", c.ByKind)
	}
}

func findGroup(groups []ComplianceGroup, key string) *ComplianceGroup {
	for i := range groups {
		if groups[i].Key == key {
			return &groups[i]
		}
	}
	return nil
}

// seedGoalSessions creates an active goal whose plan is only sessions, each
// with a 5 km target, and returns its ID.
func seedGoalSessions(t *testing.T, s *Store, sessions []PlannedSession) int {
	t.Helper()
	goal := mustCreateGoal(t, s, newGoal(), "2026-03-01")
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM planned_sessions WHERE goal_id = ?", goal.ID); err != nil {
		t.Fatal(err)
	}
	for _, p := range sessions {
		p.GoalID, p.Phase, p.TargetDistanceM = goal.ID, PhaseBase, fp(5000)
		if err := insertSession(tx, p); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return goal.ID
}
