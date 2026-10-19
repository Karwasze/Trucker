package store

import (
	"slices"
	"testing"
)

// insightsToday is a Tuesday; the Mondays before it in March 2026 are the
// 2nd, 9th, 16th, 23rd and 30th, and the Thursdays the 5th, 12th, 19th and
// 26th.
const insightsToday = "2026-03-31"

// sets returns n identical sets.
func sets(n int, weight float64, reps int) []Set {
	out := make([]Set, n)
	for i := range out {
		out[i] = Set{Weight: weight, Reps: reps}
	}
	return out
}

func getInsights(t *testing.T, s *Store) Insights {
	t.Helper()
	return getInsightsFor(t, s, insightsToday, "", 0)
}

func getInsightsFor(t *testing.T, s *Store, today, from string, planID int) Insights {
	t.Helper()
	insights, err := s.GetInsights(today, from, planID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return insights
}

// seedPlanWorkout inserts a workout logged from the plan.
func seedPlanWorkout(t *testing.T, s *Store, planID int, date string, exercises []Exercise) {
	t.Helper()
	if _, err := s.SaveWorkout(Workout{Date: date, PlanID: &planID, Exercises: exercises}); err != nil {
		t.Fatalf("failed to seed workout: %v", err)
	}
}

// mondayThursdayPlan schedules Squat 3x5 on Mondays and Bench Press 3x5 on
// Thursdays.
func mondayThursdayPlan(t *testing.T, s *Store) TrainingPlan {
	t.Helper()
	return mustCreatePlan(t, s, TrainingPlan{Name: "5x5", Days: []PlanDay{
		{Weekday: "monday", Exercises: []PlanExercise{{Name: "Squat", Sets: 3, Reps: 5}}},
		{Weekday: "thursday", Exercises: []PlanExercise{{Name: "Bench Press", Sets: 3, Reps: 5}}},
	}})
}

func muscleVolume(t *testing.T, insights Insights, muscle string) MuscleVolume {
	t.Helper()
	for _, m := range insights.Muscles {
		if m.Muscle == muscle {
			return m
		}
	}
	t.Fatalf("muscle %q missing from insights", muscle)
	return MuscleVolume{}
}

func TestGetInsights_InvalidDate(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.GetInsights("31/03/2026", "", 0); err == nil {
		t.Error("expected error for invalid date")
	}
	if _, err := s.GetInsights(insightsToday, "March", 0); err == nil {
		t.Error("expected error for invalid from date")
	}
}

func TestGetInsights_ListsEveryMuscle(t *testing.T) {
	s := newTestStore(t)

	insights := getInsights(t, s)
	if len(insights.Muscles) != len(Muscles) {
		t.Fatalf("expected %d muscles, got %d", len(Muscles), len(insights.Muscles))
	}
	for i, m := range insights.Muscles {
		if m.Muscle != Muscles[i] {
			t.Errorf("muscle %d: expected %s, got %s", i, Muscles[i], m.Muscle)
		}
		if m.Status != VolumeUntrained {
			t.Errorf("expected %s untrained, got %s", m.Muscle, m.Status)
		}
	}
}

func TestGetInsights_WeeklySetsWeighting(t *testing.T) {
	s := newTestStore(t)

	// Bench Press: chest primary, triceps and shoulders secondary.
	// 4 workouts x 5 sets = 20 sets over 4 weeks.
	for _, date := range []string{"2026-03-05", "2026-03-12", "2026-03-19", "2026-03-26"} {
		seedWorkout(t, s, date, []Exercise{{Name: "Bench Press", Sets: sets(5, 80, 5)}})
	}

	insights := getInsights(t, s)

	chest := muscleVolume(t, insights, "chest")
	if chest.WeeklySets != 5 {
		t.Errorf("expected chest 5 sets/week, got %v", chest.WeeklySets)
	}
	if chest.Status != VolumeLow {
		t.Errorf("expected chest low, got %s", chest.Status)
	}
	if chest.DaysPerWeek != 1 {
		t.Errorf("expected chest 1 day/week, got %v", chest.DaysPerWeek)
	}
	if chest.LastTrained != "2026-03-26" {
		t.Errorf("expected chest last trained 2026-03-26, got %q", chest.LastTrained)
	}
	if triceps := muscleVolume(t, insights, "triceps"); triceps.WeeklySets != 2.5 {
		t.Errorf("expected triceps 2.5 sets/week, got %v", triceps.WeeklySets)
	}
	if insights.SessionsPerWeek != 1 {
		t.Errorf("expected 1 session/week, got %v", insights.SessionsPerWeek)
	}
}

func TestGetInsights_VolumeStatusThresholds(t *testing.T) {
	s := newTestStore(t)

	// Chest Fly: chest only. 48 sets / 4 weeks = 12 (optimal).
	// Bicep Curl: biceps only. 88 sets / 4 weeks = 22 (high).
	for _, date := range []string{"2026-03-10", "2026-03-11", "2026-03-24", "2026-03-25"} {
		seedWorkout(t, s, date, []Exercise{
			{Name: "Chest Fly", Sets: sets(12, 20, 12)},
			{Name: "Bicep Curl", Sets: sets(22, 15, 10)},
		})
	}

	insights := getInsights(t, s)
	if chest := muscleVolume(t, insights, "chest"); chest.Status != VolumeOptimal || chest.WeeklySets != 12 {
		t.Errorf("expected chest optimal at 12, got %+v", chest)
	}
	if biceps := muscleVolume(t, insights, "biceps"); biceps.Status != VolumeHigh {
		t.Errorf("expected biceps high, got %+v", biceps)
	}
}

func TestGetInsights_IgnoresWorkoutsOutsideWindow(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-03", []Exercise{{Name: "Chest Fly", Sets: sets(10, 20, 12)}}) // 28 days before today
	seedWorkout(t, s, "2026-04-01", []Exercise{{Name: "Chest Fly", Sets: sets(10, 20, 12)}}) // future
	seedWorkout(t, s, "2026-03-04", []Exercise{{Name: "Chest Fly", Sets: sets(4, 20, 12)}})  // inside

	insights := getInsights(t, s)
	if chest := muscleVolume(t, insights, "chest"); chest.WeeklySets != 1 {
		t.Errorf("expected only the in-window workout counted (1 set/week), got %v", chest.WeeklySets)
	}
}

func TestGetInsights_Untagged(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-25", []Exercise{
		{Name: "Hip Thrust", Sets: sets(3, 100, 10)},
		{Name: "Squat", Sets: sets(3, 100, 5)},
	})

	insights := getInsights(t, s)
	if len(insights.Untagged) != 1 || insights.Untagged[0] != "Hip Thrust" {
		t.Errorf("expected Hip Thrust untagged, got %+v", insights.Untagged)
	}
}

func TestGetInsights_StrengthLevels(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-01", 82)
	s.SaveBodyweight("2026-03-30", 80)
	// 1x1 so the estimated 1RM equals the weight: 130 / 80 = 1.625 BW.
	seedWorkout(t, s, "2026-03-20", []Exercise{{Name: "Squat", Sets: []Set{{Weight: 130, Reps: 1}}}})

	insights := getInsights(t, s)

	if insights.Bodyweight == nil || insights.Bodyweight.Weight != 80 {
		t.Fatalf("expected latest bodyweight 80, got %+v", insights.Bodyweight)
	}
	if insights.Bodyweight.Change == nil || *insights.Bodyweight.Change != -2 {
		t.Errorf("expected bodyweight change -2, got %+v", insights.Bodyweight.Change)
	}
	if insights.Bodyweight.ChangeSince != "2026-03-01" {
		t.Errorf("expected change since 2026-03-01, got %q", insights.Bodyweight.ChangeSince)
	}

	if len(insights.Strength) != 1 {
		t.Fatalf("expected 1 strength entry, got %+v", insights.Strength)
	}
	squat := insights.Strength[0]
	if squat.Exercise != "Squat" || squat.Best1RM != 130 {
		t.Errorf("unexpected squat entry %+v", squat)
	}
	if squat.Ratio != 1.63 {
		t.Errorf("expected ratio 1.63, got %v", squat.Ratio)
	}
	if squat.Level != "intermediate" || squat.NextLevel != "advanced" {
		t.Errorf("expected intermediate -> advanced, got %s -> %s", squat.Level, squat.NextLevel)
	}
	// Advanced is 2.25 x 80 = 180 kg.
	if squat.NextLevelKg != 50 {
		t.Errorf("expected 50 kg to next level, got %v", squat.NextLevelKg)
	}
}

func TestGetInsights_StrengthNeedsBodyweight(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-20", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})

	insights := getInsights(t, s)
	if insights.Bodyweight != nil {
		t.Errorf("expected no bodyweight, got %+v", insights.Bodyweight)
	}
	if len(insights.Strength) != 0 {
		t.Errorf("expected no strength levels without bodyweight, got %+v", insights.Strength)
	}
}

func TestGetInsights_StrengthBelowBeginnerAndElite(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-30", 100)
	seedWorkout(t, s, "2026-03-20", []Exercise{
		{Name: "Bench Press", Sets: []Set{{Weight: 40, Reps: 1}}}, // 0.4 BW
		{Name: "Deadlift", Sets: []Set{{Weight: 310, Reps: 1}}},   // 3.1 BW
	})

	insights := getInsights(t, s)
	levels := map[string]StrengthLevel{}
	for _, l := range insights.Strength {
		levels[l.Exercise] = l
	}
	if bench := levels["Bench Press"]; bench.Level != "" || bench.NextLevel != "beginner" || bench.NextLevelKg != 10 {
		t.Errorf("unexpected bench level %+v", bench)
	}
	if dl := levels["Deadlift"]; dl.Level != "elite" || dl.NextLevel != "" || dl.NextLevelKg != 0 {
		t.Errorf("unexpected deadlift level %+v", dl)
	}
}

func TestGetInsights_StrengthRomanianDeadlift(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-30", 80)
	seedWorkout(t, s, "2026-03-20", []Exercise{
		{Name: "Romanian Deadlift", Sets: []Set{{Weight: 100, Reps: 1}}}, // 1.25 BW
	})

	strength := getInsights(t, s).Strength
	if len(strength) != 1 {
		t.Fatalf("expected only a Romanian Deadlift entry, got %+v", strength)
	}
	rdl := strength[0]
	if rdl.Exercise != "Romanian Deadlift" || rdl.Best1RM != 100 || rdl.Ratio != 1.25 {
		t.Errorf("unexpected Romanian Deadlift entry %+v", rdl)
	}
	// Intermediate is 1.5 x 80 = 120 kg.
	if rdl.Level != "novice" || rdl.NextLevel != "intermediate" || rdl.NextLevelKg != 20 {
		t.Errorf("expected novice -> intermediate in 20 kg, got %+v", rdl)
	}
}

func TestGetInsights_StrengthCoversTimespan(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-30", 80)
	seedWorkout(t, s, "2026-03-01", []Exercise{{Name: "Squat", Sets: []Set{{Weight: 150, Reps: 1}}}})
	seedWorkout(t, s, "2026-03-20", []Exercise{{Name: "Squat", Sets: []Set{{Weight: 130, Reps: 1}}}})

	if strength := getInsights(t, s).Strength; len(strength) != 1 || strength[0].Best1RM != 150 {
		t.Errorf("expected all-time best 150, got %+v", strength)
	}
	if strength := getInsightsFor(t, s, insightsToday, "2026-03-10", 0).Strength; len(strength) != 1 || strength[0].Best1RM != 130 {
		t.Errorf("expected best 130 since Mar 10, got %+v", strength)
	}
}

func TestGetInsights_Adherence(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)

	// Before the plan's first workout: not judged.
	seedWorkout(t, s, "2026-02-26", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	// Every Monday and Thursday from Mar 2 except Mar 9 and Mar 26.
	for _, date := range []string{"2026-03-02", "2026-03-05", "2026-03-12", "2026-03-16", "2026-03-19", "2026-03-23", "2026-03-30"} {
		seedPlanWorkout(t, s, plan.ID, date, []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	}
	// An extra Saturday session from the plan.
	seedPlanWorkout(t, s, plan.ID, "2026-03-14", []Exercise{{Name: "Deadlift", Sets: sets(1, 140, 5)}})

	a := getInsightsFor(t, s, insightsToday, "", plan.ID).Adherence
	if a == nil {
		t.Fatal("expected adherence")
	}
	if a.Plan != "5x5" || a.Since != "2026-03-02" {
		t.Errorf("expected 5x5 since 2026-03-02, got %q since %q", a.Plan, a.Since)
	}
	if a.Scheduled != 9 || a.Completed != 7 || a.Extra != 1 {
		t.Errorf("expected 7 of 9 and 1 extra, got %d of %d and %d extra", a.Completed, a.Scheduled, a.Extra)
	}
	if !slices.Equal(a.Missed, []string{"2026-03-26", "2026-03-09"}) {
		t.Errorf("expected Mar 26 and Mar 9 missed, got %v", a.Missed)
	}
	if a.Streak != 1 {
		t.Errorf("expected a streak of 1, got %d", a.Streak)
	}

	// The timespan limits the counts but not the streak.
	a = getInsightsFor(t, s, insightsToday, "2026-03-16", plan.ID).Adherence
	if a.Since != "2026-03-16" || a.Scheduled != 5 || a.Completed != 4 || a.Extra != 0 || a.Streak != 1 {
		t.Errorf("unexpected adherence since Mar 16: %+v", a)
	}
}

func TestGetInsights_AdherenceTodayNotMissedYet(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)

	for _, date := range []string{"2026-03-19", "2026-03-23", "2026-03-26"} {
		seedPlanWorkout(t, s, plan.ID, date, []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	}

	// Monday Mar 30 is today and has nothing logged yet.
	a := getInsightsFor(t, s, "2026-03-30", "", plan.ID).Adherence
	if a.Scheduled != 3 || a.Completed != 3 || len(a.Missed) != 0 || a.Streak != 3 {
		t.Errorf("expected 3 of 3 and a streak of 3, got %+v", a)
	}
}

func TestGetInsights_AdherenceWithoutPlanWorkouts(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)
	seedWorkout(t, s, "2026-03-23", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})

	a := getInsightsFor(t, s, insightsToday, "", plan.ID).Adherence
	if a == nil || a.Plan != "5x5" || a.Since != "" || a.Scheduled != 0 || a.Missed == nil {
		t.Errorf("expected empty adherence for 5x5, got %+v", a)
	}
}

func TestGetInsights_NoPlan(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-03-23", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})

	for _, planID := range []int{0, 99} {
		insights := getInsightsFor(t, s, insightsToday, "", planID)
		if insights.Adherence != nil {
			t.Errorf("plan %d: expected no adherence, got %+v", planID, insights.Adherence)
		}
		if insights.Stalls == nil || len(insights.Stalls) != 0 {
			t.Errorf("plan %d: expected empty stalls, got %+v", planID, insights.Stalls)
		}
	}
}

func TestGetInsights_PlanStalls(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)

	squat := func(weight float64, reps ...int) []Exercise {
		var s []Set
		for _, r := range reps {
			s = append(s, Set{Weight: weight, Reps: r})
		}
		return []Exercise{{Name: "Squat", Sets: s}}
	}
	bench := func(weight float64, reps ...int) []Exercise {
		ex := squat(weight, reps...)
		ex[0].Name = "Bench Press"
		return ex
	}
	// Squat: two hits, then two misses at 105.
	seedPlanWorkout(t, s, plan.ID, "2026-03-02", squat(100, 5, 5, 5))
	seedPlanWorkout(t, s, plan.ID, "2026-03-09", squat(102.5, 5, 5, 5))
	seedPlanWorkout(t, s, plan.ID, "2026-03-16", squat(105, 5, 5, 3))
	seedPlanWorkout(t, s, plan.ID, "2026-03-23", squat(105, 5, 4, 4))
	// Bench Press: three misses at 80 trigger a deload, then a hit.
	seedPlanWorkout(t, s, plan.ID, "2026-03-05", bench(80, 5, 5, 3))
	seedPlanWorkout(t, s, plan.ID, "2026-03-12", bench(80, 5, 4, 3))
	seedPlanWorkout(t, s, plan.ID, "2026-03-19", bench(80, 5, 5, 4))
	seedPlanWorkout(t, s, plan.ID, "2026-03-26", bench(72.5, 5, 5, 5))
	// Not in the plan: never a stall.
	for _, date := range []string{"2026-03-03", "2026-03-10", "2026-03-17"} {
		seedWorkout(t, s, date, []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 140, Reps: 3}}}})
	}

	stalls := getInsightsFor(t, s, insightsToday, "", plan.ID).Stalls
	want := []PlanStall{
		{Exercise: "Squat", Status: StallMissing, Weight: 105, Misses: 2, Date: "2026-03-23"},
		{Exercise: "Bench Press", Status: StallDeloaded, Weight: 80, Misses: 3, Date: "2026-03-19"},
	}
	if !slices.Equal(stalls, want) {
		t.Errorf("expected %+v, got %+v", want, stalls)
	}

	// Deloads before the timespan are left out; current misses are not.
	stalls = getInsightsFor(t, s, insightsToday, "2026-03-20", plan.ID).Stalls
	if !slices.Equal(stalls, want[:1]) {
		t.Errorf("expected only the squat stall since Mar 20, got %+v", stalls)
	}

	// After two weeks off the plan eases back in instead, so the misses no
	// longer count.
	stalls = getInsightsFor(t, s, "2026-04-20", "", plan.ID).Stalls
	if !slices.Equal(stalls, want[1:]) {
		t.Errorf("expected only the bench deload after a layoff, got %+v", stalls)
	}

	// A third miss means the next session deloads.
	seedPlanWorkout(t, s, plan.ID, "2026-03-30", squat(105, 5, 5, 4))
	stalls = getInsightsFor(t, s, insightsToday, "", plan.ID).Stalls
	if len(stalls) == 0 || stalls[0].Misses != 3 || !stalls[0].DeloadNext {
		t.Errorf("expected squat to deload next after 3 misses, got %+v", stalls)
	}
}

func TestGetInsights_Progression(t *testing.T) {
	s := newTestStore(t)

	// 1x1 so the estimated 1RM equals the weight.
	for date, weight := range map[string]float64{
		"2026-02-01": 100, "2026-03-01": 90, "2026-03-10": 105, "2026-03-20": 110, "2026-03-31": 108,
	} {
		seedWorkout(t, s, date, []Exercise{{Name: "Squat", Sets: []Set{{Weight: weight, Reps: 1}}}})
	}
	seedWorkout(t, s, "2026-03-25", []Exercise{
		{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 1}}},
		{Name: "Plank", Sets: []Set{{Weight: 0, Reps: 60}}},
	})
	seedWorkout(t, s, "2026-03-30", []Exercise{{Name: "Bench Press", Sets: []Set{{Weight: 85, Reps: 1}}}})

	progress := progressionFor(t, s, "2026-03-01")
	if len(progress) != 2 {
		t.Fatalf("expected Squat and Bench Press (no bodyweight lifts), got %+v", progress)
	}
	// Fastest-improving first: squat is up 20%, bench 6.25%.
	squat, bench := progress[0], progress[1]
	if squat.Exercise != "Squat" || squat.Sessions != 4 || squat.First1RM != 90 || squat.FirstDate != "2026-03-01" ||
		squat.Best1RM != 110 || squat.BestDate != "2026-03-20" {
		t.Errorf("unexpected squat progress %+v", squat)
	}
	// 90 -> 108 kg over the 30 days from the first session to the latest.
	if squat.Latest1RM != 108 || squat.PerMonth == nil || *squat.PerMonth != 18.3 {
		t.Errorf("expected latest 108 and +18.3 kg a month, got %v and %v", squat.Latest1RM, squat.PerMonth)
	}
	// Bench Press: 5 days is too short for a monthly rate.
	if bench.Exercise != "Bench Press" || bench.PerMonth != nil {
		t.Errorf("unexpected bench progress %+v", bench)
	}

	// From the beginning, the first squat session counts.
	squat = progressionFor(t, s, "")[0]
	if squat.Sessions != 5 || squat.First1RM != 100 {
		t.Errorf("unexpected all-time squat progress %+v", squat)
	}
}

// progressionFor is the progression of every lift since from, up to
// insightsToday; GetInsights only reports it for a plan's lifts.
func progressionFor(t *testing.T, s *Store, from string) []LiftProgress {
	t.Helper()
	sets, err := s.setsBetween("", insightsToday)
	if err != nil {
		t.Fatal(err)
	}
	return liftProgress(sets, from)
}

func TestGetInsights_ProgressionLimitedToPlan(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)

	seedWorkout(t, s, "2026-03-23", []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 1}}},
		{Name: "Deadlift", Sets: []Set{{Weight: 140, Reps: 1}}},
	})
	seedWorkout(t, s, "2026-03-26", []Exercise{{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 1}}}})

	exercises := func(progress []LiftProgress) []string {
		var names []string
		for _, p := range progress {
			names = append(names, p.Exercise)
		}
		return names
	}

	got := exercises(getInsightsFor(t, s, insightsToday, "", plan.ID).Progression)
	if want := []string{"Bench Press", "Squat"}; !slices.Equal(got, want) {
		t.Errorf("with a plan: expected %v, got %v", want, got)
	}
	// Without a plan, or with an unknown one, there is no progression.
	for _, planID := range []int{0, 99} {
		if got := getInsightsFor(t, s, insightsToday, "", planID).Progression; got == nil || len(got) != 0 {
			t.Errorf("plan %d: expected no progression, got %+v", planID, got)
		}
	}
}

func TestGetInsights_ProgressionSingleSession(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-03-31", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 140, Reps: 1}}}})

	dl := progressionFor(t, s, "")[0]
	if dl.Sessions != 1 || dl.Latest1RM != 140 || dl.Best1RM != 140 ||
		dl.Record1RM != 140 || dl.RecordDate != "2026-03-31" {
		t.Errorf("expected a single session to set a 140 kg record, got %+v", dl)
	}
}

func TestGetInsights_ProgressionRecordBeforeTimespan(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-02-01", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 160, Reps: 1}}}})
	seedWorkout(t, s, "2026-03-05", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 170, Reps: 1}}}})
	seedWorkout(t, s, "2026-03-31", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 140, Reps: 1}}}})

	// The record is all-time, even when set before the timespan.
	dl := progressionFor(t, s, "2026-03-20")[0]
	if dl.Best1RM != 140 || dl.Record1RM != 170 || dl.RecordDate != "2026-03-05" {
		t.Errorf("expected best 140 and a 170 kg record from Mar 5, got %+v", dl)
	}
}

func TestGetInsights_ProgressionSortedByChange(t *testing.T) {
	s := newTestStore(t)

	for name, weights := range map[string][2]float64{
		"Deadlift":       {150, 140}, // -6.7%
		"Squat":          {100, 105}, // +5%
		"Overhead Press": {40, 44},   // +10%
		"Bench Press":    {80, 84},   // +5%, ties with Squat
	} {
		seedWorkout(t, s, "2026-03-01", []Exercise{{Name: name, Sets: []Set{{Weight: weights[0], Reps: 1}}}})
		seedWorkout(t, s, "2026-03-31", []Exercise{{Name: name, Sets: []Set{{Weight: weights[1], Reps: 1}}}})
	}

	var got []string
	for _, p := range progressionFor(t, s, "") {
		got = append(got, p.Exercise)
	}
	if want := []string{"Overhead Press", "Bench Press", "Squat", "Deadlift"}; !slices.Equal(got, want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestGetInsights_ProgressionRegression(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-01", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 160, Reps: 1}}}})
	seedWorkout(t, s, "2026-03-31", []Exercise{{Name: "Deadlift", Sets: []Set{{Weight: 130, Reps: 1}}}})

	dl := progressionFor(t, s, "")[0]
	if dl.Best1RM != 160 || dl.Latest1RM != 130 || dl.PerMonth == nil || *dl.PerMonth != -30.4 {
		t.Errorf("expected -30.4 kg a month from 160 to 130, got %+v (rate %v)", dl, dl.PerMonth)
	}
}

func TestGetInsights_Tonnage(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-10", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}}) // before the timespan
	seedWorkout(t, s, "2026-03-17", []Exercise{
		{Name: "Squat", Sets: sets(3, 100, 5)},      // 1500
		{Name: "Bench Press", Sets: sets(3, 80, 5)}, // 1200
	})
	seedWorkout(t, s, "2026-03-19", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	seedWorkout(t, s, "2026-03-31", []Exercise{{Name: "Bench Press", Sets: sets(3, 80, 5)}})

	tonnage := getInsightsFor(t, s, insightsToday, "2026-03-16", 0).Tonnage
	if tonnage.Total != 5400 {
		t.Errorf("expected 5400 kg, got %v", tonnage.Total)
	}
	wantWeeks := []WeeklyTonnage{{Week: "2026-03-16", Tonnage: 4200}, {Week: "2026-03-23", Tonnage: 0}, {Week: "2026-03-30", Tonnage: 1200}}
	if !slices.Equal(tonnage.Weekly, wantWeeks) {
		t.Errorf("expected weeks %+v, got %+v", wantWeeks, tonnage.Weekly)
	}
	wantExercises := []ExerciseTonnage{{Exercise: "Squat", Tonnage: 3000}, {Exercise: "Bench Press", Tonnage: 2400}}
	if !slices.Equal(tonnage.ByExercise, wantExercises) {
		t.Errorf("expected exercises %+v, got %+v", wantExercises, tonnage.ByExercise)
	}

	// From the beginning, weeks start at the first workout's week.
	if weeks := getInsights(t, s).Tonnage.Weekly; len(weeks) != 4 || weeks[0] != (WeeklyTonnage{Week: "2026-03-09", Tonnage: 1500}) {
		t.Errorf("unexpected all-time weeks %+v", weeks)
	}
}

func TestGetInsights_TonnageEmpty(t *testing.T) {
	s := newTestStore(t)

	tonnage := getInsights(t, s).Tonnage
	if tonnage.Total != 0 || tonnage.Weekly == nil || len(tonnage.Weekly) != 0 || tonnage.ByExercise == nil {
		t.Errorf("expected empty tonnage, got %+v", tonnage)
	}
}

func seedCardio(t *testing.T, s *Store, workouts ...CardioWorkout) {
	t.Helper()
	if _, err := s.SaveCardioWorkouts(workouts); err != nil {
		t.Fatalf("failed to seed cardio: %v", err)
	}
}

func cardio(activity, date string, metres, seconds float64) CardioWorkout {
	return CardioWorkout{
		Date: date, StartedAt: date + "T07:00:00Z", Activity: activity,
		DurationSeconds: seconds, DistanceM: &metres,
	}
}

func TestGetInsights_CardioCountsAsSessions(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-03-23", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	// A run on a lifting day doesn't add a session; a ride on its own does.
	seedCardio(t, s,
		cardio(ActivityRunning, "2026-03-23", 5000, 1500),
		cardio(ActivityCycling, "2026-03-25", 30000, 3600),
	)

	insights := getInsights(t, s)
	if insights.SessionsPerWeek != 0.5 {
		t.Errorf("expected 0.5 sessions/week from 2 days in 4 weeks, got %v", insights.SessionsPerWeek)
	}
}

func TestGetInsights_AdherenceOnlyCountsPlanWorkouts(t *testing.T) {
	s := newTestStore(t)
	plan := mondayThursdayPlan(t, s)
	other := mustCreatePlan(t, s, TrainingPlan{Name: "Other", Days: []PlanDay{
		{Weekday: "saturday", Exercises: []PlanExercise{{Name: "Deadlift", Sets: 1, Reps: 5}}},
	}})
	seedPlanWorkout(t, s, plan.ID, "2026-03-23", []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	// None of these complete Thursday or count as extra: a swim, a workout
	// without a plan and one from another plan.
	seedCardio(t, s,
		cardio(ActivitySwimming, "2026-03-26", 1500, 2400),
		cardio(ActivityWalking, "2026-03-28", 3000, 1800),
	)
	seedWorkout(t, s, "2026-03-26", []Exercise{{Name: "Bench Press", Sets: sets(3, 80, 5)}})
	seedPlanWorkout(t, s, other.ID, "2026-03-28", []Exercise{{Name: "Deadlift", Sets: sets(1, 140, 5)}})

	a := getInsightsFor(t, s, "2026-03-29", "", plan.ID).Adherence
	if a.Scheduled != 2 || a.Completed != 1 || a.Extra != 0 || a.Streak != 0 ||
		!slices.Equal(a.Missed, []string{"2026-03-26"}) {
		t.Errorf("expected 1 of 2, no extra, no streak and Mar 26 missed, got %+v", a)
	}
}

func TestGetInsights_CardioSummaries(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s,
		// Before the timespan.
		cardio(ActivityRunning, "2026-03-01", 20000, 7200),
		cardio(ActivityRunning, "2026-03-17", 5000, 1500),
		cardio(ActivityCycling, "2026-03-20", 40000, 4800),
		cardio(ActivityRunning, "2026-03-30", 10000, 3000),
	)

	// Mar 17 to Mar 30 is two weeks.
	got := getInsightsFor(t, s, "2026-03-30", "2026-03-17", 0).Cardio
	want := []CardioSummary{
		{Activity: ActivityRunning, Sessions: 2, DistanceM: 15000, DurationSeconds: 4500, WeeklyDistanceM: 7500},
		{Activity: ActivityCycling, Sessions: 1, DistanceM: 40000, DurationSeconds: 4800, WeeklyDistanceM: 20000},
	}
	if !slices.Equal(got, want) {
		t.Errorf("got %+v, want %+v", got, want)
	}

	// All time starts at the first cardio workout: Mar 1 to Mar 30 is 30
	// days.
	got = getInsightsFor(t, s, "2026-03-30", "", 0).Cardio
	if len(got) != 2 || got[0].Sessions != 3 || got[0].WeeklyDistanceM != 8167 {
		t.Errorf("unexpected all-time summaries %+v", got)
	}

	// A timespan starting before the first cardio workout ever counts weeks
	// from that workout: Mar 1 to Mar 14 is two weeks, not four.
	got = getInsightsFor(t, s, "2026-03-14", "2026-02-15", 0).Cardio
	if len(got) != 1 || got[0].DistanceM != 20000 || got[0].WeeklyDistanceM != 10000 {
		t.Errorf("unexpected summaries before the first workout %+v", got)
	}

	if empty := getInsightsFor(t, newTestStore(t), "2026-03-30", "", 0).Cardio; empty == nil || len(empty) != 0 {
		t.Errorf("expected empty, non-nil summaries, got %#v", empty)
	}
}

func TestGetInsights_GoalSummary(t *testing.T) {
	s := newTestStore(t)
	if got := getInsightsFor(t, s, "2026-10-21", "", 0).Goal; got != nil {
		t.Errorf("expected no goal summary without a goal, got %+v", got)
	}

	g := mustCreateGoal(t, s, newGoal(), "2026-10-19")
	monday, err := s.GoalSessions(g.ID, "2026-10-19", "2026-10-19", "2026-10-21")
	if err != nil {
		t.Fatal(err)
	}
	run := cardioRun("a", "2026-10-19", deref(monday[0].TargetDistanceM)/1000)
	run.PlannedSessionID = &monday[0].ID
	seedCardio(t, s, run)

	// Wednesday: Monday met, Wednesday to come, Friday and Sunday ahead.
	got := getInsightsFor(t, s, "2026-10-21", "", 0).Goal
	if got == nil || got.Goal.ID != g.ID || got.Phase != PhaseBase || got.WeeksToRace != 11 {
		t.Fatalf("unexpected summary %+v", got)
	}
	if got.Met != 1 || got.Pending != 3 || got.Missed != 0 {
		t.Errorf("expected 1 met and 3 to come, got %+v", got)
	}
	if got.DoneM[ActivityRunning] != deref(monday[0].TargetDistanceM) || got.PlannedM[ActivityRunning] <= got.DoneM[ActivityRunning] {
		t.Errorf("unexpected distances %+v / %+v", got.DoneM, got.PlannedM)
	}

	if after := getInsightsFor(t, s, "2027-01-11", "", 0).Goal; after != nil {
		t.Errorf("expected no summary after the race, got %+v", after)
	}
}
