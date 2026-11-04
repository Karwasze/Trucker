package store

import (
	"testing"
)

func bodyInsights(t *testing.T, s *Store, today string, planID int) BodyInsights {
	t.Helper()
	insights, err := s.GetBodyInsights(today, planID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return insights
}

func TestBodyInsights_Empty(t *testing.T) {
	s := newTestStore(t)
	got := bodyInsights(t, s, insightsToday, 0)
	if got.Rate != nil || got.Projection != nil || got.Slips != nil || got.Adherence == nil || len(got.Adherence) != 0 {
		t.Errorf("expected nothing to say without data, got %+v", got)
	}
}

func TestBodyInsights_RateFromSmoothedTrend(t *testing.T) {
	s := newTestStore(t)
	// Down 0.8 kg a week, with a heavy day in the middle that a single
	// weigh-in comparison would trip over.
	seedWeights(t, s, map[string]float64{
		"2026-03-10": 80.4, "2026-03-17": 79.6, "2026-03-20": 80.5, "2026-03-24": 78.8, "2026-03-31": 78,
	})
	r := bodyInsights(t, s, insightsToday, 0).Rate
	if r == nil || r.Weighins != 5 || r.From != "2026-03-10" || r.To != "2026-03-31" {
		t.Fatalf("unexpected rate %+v", r)
	}
	if r.PerWeekKg > -0.6 || r.PerWeekKg < -0.9 || r.PerWeekPct != round(r.PerWeekKg/r.Weight*100, 2) {
		t.Errorf("expected about -0.75 kg a week, got %+v", r)
	}
}

func TestBodyInsights_RateNeedsWeighinsOverTenDays(t *testing.T) {
	s := newTestStore(t)
	seedWeights(t, s, map[string]float64{"2026-03-25": 80, "2026-03-28": 79.8, "2026-03-31": 79.5})
	if r := bodyInsights(t, s, insightsToday, 0).Rate; r != nil {
		t.Errorf("expected no rate over 6 days, got %+v", r)
	}
}

func TestBodyInsights_ProjectionToTargetAndRace(t *testing.T) {
	s := newTestStore(t)
	seedWeights(t, s, map[string]float64{"2026-03-10": 83.5, "2026-03-17": 83, "2026-03-31": 82})
	target := 78.0
	s.SetTargetWeight(&target)
	g := newGoal()
	g.RaceDate = "2026-07-12"
	mustCreateGoal(t, s, g, insightsToday)

	p := bodyInsights(t, s, insightsToday, 0).Projection
	// 4 kg at 0.5 kg a week: 8 weeks from Mar 31.
	if p == nil || p.TargetKg != 78 || p.CurrentKg == nil || *p.CurrentKg != 82 || p.Date != "2026-05-26" {
		t.Fatalf("unexpected projection %+v", p)
	}
	if p.RaceName != "10k" || p.RaceDate != "2026-07-12" {
		t.Errorf("expected the race, got %+v", p)
	}
}

func TestBodyInsights_ProjectionHeadingAway(t *testing.T) {
	s := newTestStore(t)
	seedWeights(t, s, map[string]float64{"2026-03-10": 80.5, "2026-03-17": 81, "2026-03-31": 82})
	target := 78.0
	s.SetTargetWeight(&target)
	p := bodyInsights(t, s, insightsToday, 0).Projection
	if p == nil || p.Date != "" || p.Reached || p.PerWeekKg == nil || *p.PerWeekKg != 0.5 {
		t.Errorf("expected no date while gaining, got %+v", p)
	}

	target = 82.1
	s.SetTargetWeight(&target)
	if p := bodyInsights(t, s, insightsToday, 0).Projection; !p.Reached {
		t.Errorf("expected the target reached, got %+v", p)
	}
}

func TestBodyInsights_ProjectionWithoutTrend(t *testing.T) {
	s := newTestStore(t)
	target := 78.0
	s.SetTargetWeight(&target)
	p := bodyInsights(t, s, insightsToday, 0).Projection
	if p == nil || p.TargetKg != 78 || p.CurrentKg != nil {
		t.Errorf("expected the target without a trend, got %+v", p)
	}
}

func TestBodyInsights_WeightByAdherence(t *testing.T) {
	s := newTestStore(t)
	// Weeks from Mon Mar 2: strict, strict, loose, then this week.
	weights := map[string]float64{
		"2026-02-25": 82, // the week before
		"2026-03-04": 81.4, "2026-03-11": 80.8, "2026-03-18": 80.9,
	}
	seedWeights(t, s, weights)
	logWeek := func(monday string, adhered int) {
		start := mustDate(t, monday)
		for i := range 7 {
			s.SaveDietDay(DietDay{Date: start.AddDate(0, 0, i).Format(dateLayout), Adhered: i < adhered})
		}
	}
	logWeek("2026-03-02", 7)
	logWeek("2026-03-09", 6)
	logWeek("2026-03-16", 4)
	// This week isn't over, so it doesn't count.
	logWeek("2026-03-30", 0)

	got := bodyInsights(t, s, insightsToday, 0).Adherence
	if len(got) != 2 {
		t.Fatalf("expected two groups, got %+v", got)
	}
	if got[0] != (AdherenceWeeks{"6–7", 2, -0.6}) || got[1] != (AdherenceWeeks{"4–5", 1, 0.1}) {
		t.Errorf("unexpected groups %+v", got)
	}
}

func TestBodyInsights_HabitSlips(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)
	// Mondays done, Thursdays skipped from the 12th.
	for _, date := range []string{"2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"} {
		seedPlanWorkout(t, s, plan.ID, date, []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	}
	seedPlanWorkout(t, s, plan.ID, "2026-03-05", []Exercise{{Name: "Bench Press", Sets: sets(3, 60, 5)}})
	for date, adhered := range map[string]bool{
		"2026-03-12": false, "2026-03-19": false, "2026-03-26": true,
		"2026-03-09": true, "2026-03-10": true, "2026-03-11": false,
	} {
		s.SaveDietDay(DietDay{Date: date, Adhered: adhered})
	}

	got := bodyInsights(t, s, insightsToday, plan.ID).Slips
	if got == nil || got.SkippedDays != 3 || got.Skipped != (DietCount{3, 2}) || got.Other != (DietCount{3, 1}) {
		t.Errorf("unexpected slips %+v", got)
	}
	if got := bodyInsights(t, s, insightsToday, 0).Slips; got != nil {
		t.Errorf("expected nothing without a plan or goal, got %+v", got)
	}
}
