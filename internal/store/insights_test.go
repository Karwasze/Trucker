package store

import (
	"strings"
	"testing"
)

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
	insights, err := s.GetInsights(insightsToday)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return insights
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

func hasRecommendation(insights Insights, kind, substr string) bool {
	for _, r := range insights.Recommendations {
		if r.Kind == kind && strings.Contains(r.Text, substr) {
			return true
		}
	}
	return false
}

func TestGetInsights_InvalidDate(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.GetInsights("31/03/2026"); err == nil {
		t.Error("expected error for invalid date")
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
	if !hasRecommendation(insights, "warning", "No workouts") {
		t.Errorf("expected a no-workouts warning, got %+v", insights.Recommendations)
	}
}

func TestGetInsights_GroupsUntrainedMuscles(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-25", []Exercise{{Name: "Chest Fly", Sets: sets(3, 20, 12)}})

	insights := getInsights(t, s)
	count := 0
	for _, r := range insights.Recommendations {
		if strings.Contains(r.Text, "back") && strings.Contains(r.Text, "core") {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected untrained muscles in one recommendation, got %+v", insights.Recommendations)
	}
	if !hasRecommendation(insights, "warning", "Train chest more") {
		t.Errorf("expected a no-workouts warning, got %+v", insights.Recommendations)
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
	if !hasRecommendation(insights, "warning", "chest") {
		t.Errorf("expected a low-volume chest warning, got %+v", insights.Recommendations)
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
	if !hasRecommendation(insights, "warning", "Biceps volume is high") {
		t.Errorf("expected a high-volume biceps warning, got %+v", insights.Recommendations)
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

func TestGetInsights_PushPullImbalance(t *testing.T) {
	s := newTestStore(t)

	for _, date := range []string{"2026-03-20", "2026-03-27"} {
		seedWorkout(t, s, date, []Exercise{
			{Name: "Bench Press", Sets: sets(10, 80, 5)},
			{Name: "Overhead Press", Sets: sets(10, 50, 5)},
			{Name: "Lat Pulldown", Sets: sets(3, 60, 10)},
		})
	}

	insights := getInsights(t, s)
	if !hasRecommendation(insights, "warning", "pull") {
		t.Errorf("expected a push/pull imbalance warning, got %+v", insights.Recommendations)
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
	if !hasRecommendation(insights, "info", "Hip Thrust") {
		t.Errorf("expected an untagged recommendation, got %+v", insights.Recommendations)
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
	if !hasRecommendation(insights, "info", "bodyweight") {
		t.Errorf("expected a missing-bodyweight recommendation, got %+v", insights.Recommendations)
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

func TestGetInsights_Stalled(t *testing.T) {
	s := newTestStore(t)

	// Previous 4 weeks: best 100x5. Recent 4 weeks: still 100x5.
	for _, date := range []string{"2026-02-10", "2026-02-24", "2026-03-10", "2026-03-24"} {
		seedWorkout(t, s, date, []Exercise{
			{Name: "Squat", Sets: sets(3, 100, 5)},
			{Name: "Deadlift", Sets: sets(1, 140, 5)},
		})
	}
	// Deadlift improves in the recent window.
	seedWorkout(t, s, "2026-03-28", []Exercise{{Name: "Deadlift", Sets: sets(1, 150, 5)}})

	insights := getInsights(t, s)
	if len(insights.Stalled) != 1 || insights.Stalled[0].Exercise != "Squat" {
		t.Fatalf("expected only Squat stalled, got %+v", insights.Stalled)
	}
	if !hasRecommendation(insights, "warning", "Squat") {
		t.Errorf("expected a stalled Squat warning, got %+v", insights.Recommendations)
	}
}

func TestGetInsights_StalledNeedsFourSessions(t *testing.T) {
	s := newTestStore(t)

	for _, date := range []string{"2026-02-24", "2026-03-24"} {
		seedWorkout(t, s, date, []Exercise{{Name: "Squat", Sets: sets(3, 100, 5)}})
	}

	if insights := getInsights(t, s); len(insights.Stalled) != 0 {
		t.Errorf("expected no stalled lifts with 2 sessions, got %+v", insights.Stalled)
	}
}

func TestGetInsights_BalancedTrainingIsGood(t *testing.T) {
	s := newTestStore(t)
	s.SaveBodyweight("2026-03-30", 80)

	// Every muscle gets one direct exercise for 6 sets twice a week:
	// 6 x 8 sessions / 4 weeks = 12 sets/week.
	direct := []Exercise{
		{Name: "Chest Fly", Sets: sets(6, 20, 12)},
		{Name: "Lat Pulldown", Sets: sets(6, 60, 10)},
		{Name: "Lateral Raise", Sets: sets(6, 10, 15)},
		{Name: "Tricep Pushdown", Sets: sets(6, 30, 12)},
		{Name: "Leg Extension", Sets: sets(6, 50, 12)},
		{Name: "Leg Curl", Sets: sets(6, 40, 12)},
		{Name: "Calf Raise", Sets: sets(6, 60, 12)},
		{Name: "Hip Thrust", Sets: sets(6, 100, 10)},
		{Name: "Plank", Sets: sets(6, 0, 60)},
	}
	s.SetExerciseMuscles("Hip Thrust", []MuscleTarget{{Muscle: "glutes", Role: RolePrimary}})
	s.SetExerciseMuscles("Plank", []MuscleTarget{{Muscle: "core", Role: RolePrimary}})
	// Lat Pulldown already adds 3 biceps sets/week (0.5 x 6 x 8 / 4).
	biceps := Exercise{Name: "Bicep Curl", Sets: sets(5, 15, 10)}

	for _, date := range []string{
		"2026-03-05", "2026-03-07", "2026-03-12", "2026-03-14",
		"2026-03-19", "2026-03-21", "2026-03-26", "2026-03-28",
	} {
		seedWorkout(t, s, date, append(direct, biceps))
	}

	insights := getInsights(t, s)
	for _, m := range insights.Muscles {
		if m.Status != VolumeOptimal {
			t.Errorf("expected %s optimal, got %+v", m.Muscle, m)
		}
	}
	for _, r := range insights.Recommendations {
		if r.Kind == "warning" {
			t.Errorf("unexpected warning: %s", r.Text)
		}
	}
	if !hasRecommendation(insights, "good", "") {
		t.Errorf("expected a good recommendation, got %+v", insights.Recommendations)
	}
}

func TestGetInsights_NoBalanceWarningAtLowVolume(t *testing.T) {
	s := newTestStore(t)

	// 2 sets of Bench Press and nothing else: push 1, pull 0 sets a week.
	seedWorkout(t, s, "2026-03-25", []Exercise{{Name: "Bench Press", Sets: sets(2, 80, 5)}})

	if insights := getInsights(t, s); hasRecommendation(insights, "warning", "pulling") {
		t.Errorf("expected no balance warning at low volume, got %+v", insights.Recommendations)
	}
}
