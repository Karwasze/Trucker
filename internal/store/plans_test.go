package store

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

// Fixed dates with known weekdays used across plan tests.
const (
	monday  = "2026-10-12"
	tuesday = "2026-10-13"
	friday  = "2026-10-16"
)

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatalf("bad test date %q: %v", s, err)
	}
	return d
}

// samplePlan returns a plan whose days are deliberately given out of
// weekday order so tests can check that reads come back Monday-first.
func samplePlan() TrainingPlan {
	return TrainingPlan{
		Name: "5x5",
		Days: []PlanDay{
			{Weekday: "friday", Exercises: []PlanExercise{
				{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 120}}, WeightIncrement: 2.5},
			}},
			{Weekday: "monday", Exercises: []PlanExercise{
				{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}, WeightIncrement: 2.5},
				{Name: "Bench Press", Sets: []Set{{Reps: 5, Weight: 80}}, RepsIncrement: 1, DeloadAfter: 1, DeloadPercent: 10},
				{Name: "Deadlift", Sets: []Set{{Reps: 5, Weight: 140}}, WeightIncrement: 5},
			}},
		},
	}
}

func mustCreatePlan(t *testing.T, s *Store, plan TrainingPlan) TrainingPlan {
	t.Helper()
	created, err := s.CreatePlan(plan)
	if err != nil {
		t.Fatalf("failed to create plan: %v", err)
	}
	return created
}

func TestCreateAndGetPlan(t *testing.T) {
	s := newTestStore(t)

	created := mustCreatePlan(t, s, samplePlan())
	if created.ID == 0 {
		t.Fatal("expected created plan to have an ID")
	}

	got, err := s.GetPlan(created.ID)
	if err != nil {
		t.Fatalf("failed to get plan: %v", err)
	}
	if !reflect.DeepEqual(got, created) {
		t.Errorf("GetPlan returned %+v, CreatePlan returned %+v", got, created)
	}

	if got.Name != "5x5" {
		t.Errorf("expected name 5x5, got %s", got.Name)
	}
	if len(got.Days) != 2 || got.Days[0].Weekday != "monday" || got.Days[1].Weekday != "friday" {
		t.Fatalf("expected days ordered monday, friday; got %+v", got.Days)
	}

	mon := got.Days[0].Exercises
	if len(mon) != 3 || mon[0].Name != "Squat" || mon[1].Name != "Bench Press" || mon[2].Name != "Deadlift" {
		t.Fatalf("expected monday exercises in submitted order, got %+v", mon)
	}
	if !reflect.DeepEqual(mon[0].Sets, []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}) {
		t.Errorf("unexpected squat sets: %+v", mon[0].Sets)
	}
	bench := mon[1]
	if bench.RepsIncrement != 1 || bench.DeloadAfter != 1 || bench.DeloadPercent != 10 || bench.ConsecutiveMisses != 0 {
		t.Errorf("unexpected bench progression settings: %+v", bench)
	}
}

func TestCreatePlan_IgnoresClientMissCounter(t *testing.T) {
	s := newTestStore(t)

	plan := samplePlan()
	plan.Days[0].Exercises[0].ConsecutiveMisses = 5
	created := mustCreatePlan(t, s, plan)

	if misses := created.Days[1].Exercises[0].ConsecutiveMisses; misses != 0 {
		t.Errorf("expected consecutive_misses to start at 0, got %d", misses)
	}
}

func TestCreatePlan_DuplicateName(t *testing.T) {
	s := newTestStore(t)
	mustCreatePlan(t, s, samplePlan())

	_, err := s.CreatePlan(samplePlan())
	if !errors.Is(err, ErrDuplicatePlanName) {
		t.Errorf("expected ErrDuplicatePlanName, got %v", err)
	}
}

func TestCreatePlan_InvalidWeekday(t *testing.T) {
	s := newTestStore(t)

	_, err := s.CreatePlan(TrainingPlan{Name: "Bad", Days: []PlanDay{{Weekday: "funday"}}})
	if !errors.Is(err, ErrInvalidWeekday) {
		t.Errorf("expected ErrInvalidWeekday, got %v", err)
	}

	plans, _ := s.GetPlans()
	if len(plans) != 0 {
		t.Errorf("expected nothing saved on invalid weekday, got %d plans", len(plans))
	}
}

func TestGetPlan_NotFound(t *testing.T) {
	s := newTestStore(t)

	if _, err := s.GetPlan(999); !errors.Is(err, ErrPlanNotFound) {
		t.Errorf("expected ErrPlanNotFound, got %v", err)
	}
}

func TestGetPlans(t *testing.T) {
	s := newTestStore(t)

	plans, err := s.GetPlans()
	if err != nil {
		t.Fatalf("failed to get plans: %v", err)
	}
	if len(plans) != 0 {
		t.Fatalf("expected no plans, got %d", len(plans))
	}

	mustCreatePlan(t, s, TrainingPlan{Name: "Upper/Lower"})
	mustCreatePlan(t, s, samplePlan())

	plans, err = s.GetPlans()
	if err != nil {
		t.Fatalf("failed to get plans: %v", err)
	}
	if len(plans) != 2 {
		t.Fatalf("expected 2 plans, got %d", len(plans))
	}
	if plans[0].Name != "5x5" || plans[1].Name != "Upper/Lower" {
		t.Errorf("expected plans ordered by name, got %s, %s", plans[0].Name, plans[1].Name)
	}
	if len(plans[0].Days) != 2 {
		t.Errorf("expected listed plans to include days, got %+v", plans[0].Days)
	}
	if plans[1].Days == nil {
		t.Error("expected empty plan to have a non-nil days slice")
	}
}

func TestUpdatePlan_ReplacesDays(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	updated, err := s.UpdatePlan(TrainingPlan{
		ID:   created.ID,
		Name: "Renamed",
		Days: []PlanDay{{Weekday: "tuesday", Exercises: []PlanExercise{
			{Name: "Overhead Press", Sets: []Set{{Reps: 8, Weight: 40}}},
		}}},
	})
	if err != nil {
		t.Fatalf("failed to update plan: %v", err)
	}
	if updated.Name != "Renamed" || len(updated.Days) != 1 || updated.Days[0].Weekday != "tuesday" {
		t.Errorf("unexpected updated plan: %+v", updated)
	}

	var exerciseCount, setCount int
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_exercises").Scan(&exerciseCount)
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_sets").Scan(&setCount)
	if exerciseCount != 1 || setCount != 1 {
		t.Errorf("expected old rows replaced (1 exercise, 1 set), got %d exercises, %d sets", exerciseCount, setCount)
	}
}

func TestUpdatePlan_NotFound(t *testing.T) {
	s := newTestStore(t)

	if _, err := s.UpdatePlan(TrainingPlan{ID: 999, Name: "Nope"}); !errors.Is(err, ErrPlanNotFound) {
		t.Errorf("expected ErrPlanNotFound, got %v", err)
	}
}

func TestUpdatePlan_DuplicateName(t *testing.T) {
	s := newTestStore(t)
	mustCreatePlan(t, s, samplePlan())
	other := mustCreatePlan(t, s, TrainingPlan{Name: "Other"})

	if _, err := s.UpdatePlan(TrainingPlan{ID: other.ID, Name: "5x5"}); !errors.Is(err, ErrDuplicatePlanName) {
		t.Errorf("expected ErrDuplicatePlanName, got %v", err)
	}
}

func TestDeletePlan(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())
	kept := mustCreatePlan(t, s, TrainingPlan{Name: "Kept", Days: []PlanDay{{Weekday: "monday", Exercises: []PlanExercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 60}}},
	}}}})

	planID := created.ID
	workoutID, err := s.SaveWorkout(Workout{Date: monday, PlanID: &planID})
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	found, err := s.DeletePlan(created.ID)
	if err != nil {
		t.Fatalf("failed to delete plan: %v", err)
	}
	if !found {
		t.Fatal("expected plan to be found")
	}

	if _, err := s.GetPlan(created.ID); !errors.Is(err, ErrPlanNotFound) {
		t.Errorf("expected deleted plan to be gone, got %v", err)
	}
	if _, err := s.GetPlan(kept.ID); err != nil {
		t.Errorf("expected other plan to survive: %v", err)
	}

	var exerciseCount, setCount int
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_exercises").Scan(&exerciseCount)
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_sets").Scan(&setCount)
	if exerciseCount != 1 || setCount != 1 {
		t.Errorf("expected only the kept plan's rows to remain, got %d exercises, %d sets", exerciseCount, setCount)
	}

	workouts, _ := s.GetWorkouts()
	if len(workouts) != 1 || workouts[0].ID != workoutID {
		t.Fatalf("expected workout to survive plan deletion, got %+v", workouts)
	}
	if workouts[0].PlanID != nil {
		t.Errorf("expected workout plan_id to be cleared, got %d", *workouts[0].PlanID)
	}
}

func TestDeletePlan_NotFound(t *testing.T) {
	s := newTestStore(t)

	found, err := s.DeletePlan(999)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found to be false")
	}
}

func TestGetPlanDay(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	day, err := s.GetPlanDay(created.ID, mustDate(t, monday))
	if err != nil {
		t.Fatalf("failed to get plan day: %v", err)
	}
	if day.Weekday != "monday" || len(day.Exercises) != 3 {
		t.Errorf("expected monday with 3 exercises, got %+v", day)
	}

	rest, err := s.GetPlanDay(created.ID, mustDate(t, tuesday))
	if err != nil {
		t.Fatalf("failed to get rest day: %v", err)
	}
	if rest.Weekday != "tuesday" {
		t.Errorf("expected tuesday, got %s", rest.Weekday)
	}
	if rest.Exercises == nil || len(rest.Exercises) != 0 {
		t.Errorf("expected empty non-nil exercises on a rest day, got %+v", rest.Exercises)
	}

	if _, err := s.GetPlanDay(999, mustDate(t, monday)); !errors.Is(err, ErrPlanNotFound) {
		t.Errorf("expected ErrPlanNotFound, got %v", err)
	}
}

func TestApplyProgression(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	results, err := s.ApplyProgression(created.ID, monday, []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}},
		{Name: "Bench Press", Sets: []Set{{Reps: 3, Weight: 80}}},
		{Name: "Bicep Curl", Sets: []Set{{Reps: 10, Weight: 15}}},
	})
	if err != nil {
		t.Fatalf("failed to apply progression: %v", err)
	}

	want := []ProgressionResult{
		{Exercise: "Squat", Result: ResultProgressed},
		{Exercise: "Bench Press", Result: ResultDeloaded},
	}
	if !reflect.DeepEqual(results, want) {
		t.Errorf("expected results %+v, got %+v", want, results)
	}

	plan, _ := s.GetPlan(created.ID)
	mon := plan.Days[0].Exercises
	if !reflect.DeepEqual(mon[0].Sets, []Set{{Reps: 5, Weight: 102.5}, {Reps: 5, Weight: 102.5}}) {
		t.Errorf("expected squat to progress to 102.5, got %+v", mon[0].Sets)
	}
	if !reflect.DeepEqual(mon[1].Sets, []Set{{Reps: 5, Weight: 72}}) || mon[1].ConsecutiveMisses != 0 {
		t.Errorf("expected bench deloaded to 72 with misses reset, got %+v", mon[1])
	}
	if !reflect.DeepEqual(mon[2].Sets, []Set{{Reps: 5, Weight: 140}}) || mon[2].ConsecutiveMisses != 0 {
		t.Errorf("expected unlogged deadlift untouched, got %+v", mon[2])
	}
	fri := plan.Days[1].Exercises
	if !reflect.DeepEqual(fri[0].Sets, []Set{{Reps: 5, Weight: 120}}) {
		t.Errorf("expected friday squat untouched, got %+v", fri[0].Sets)
	}
}

func TestApplyProgression_PersistsMissCounter(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	results, err := s.ApplyProgression(created.ID, monday, []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}}},
	})
	if err != nil {
		t.Fatalf("failed to apply progression: %v", err)
	}
	if len(results) != 1 || results[0].Result != ResultMissed {
		t.Fatalf("expected a single miss, got %+v", results)
	}

	plan, _ := s.GetPlan(created.ID)
	squat := plan.Days[0].Exercises[0]
	if squat.ConsecutiveMisses != 1 {
		t.Errorf("expected 1 consecutive miss, got %d", squat.ConsecutiveMisses)
	}
	if squat.Sets[0].Weight != 100 {
		t.Errorf("expected targets unchanged on a miss, got %+v", squat.Sets)
	}
}

func TestApplyProgression_RestDay(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())
	before, _ := s.GetPlan(created.ID)

	results, err := s.ApplyProgression(created.ID, tuesday, []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 200}}},
	})
	if err != nil {
		t.Fatalf("failed to apply progression: %v", err)
	}
	if results == nil || len(results) != 0 {
		t.Errorf("expected empty non-nil results on a rest day, got %+v", results)
	}

	after, _ := s.GetPlan(created.ID)
	if !reflect.DeepEqual(before, after) {
		t.Error("expected plan unchanged after rest-day workout")
	}
}

func TestUpdateExercise_PropagatesToPlans(t *testing.T) {
	s := newTestStore(t)
	custom, err := s.CreateExercise("Custom Lift")
	if err != nil {
		t.Fatalf("failed to create exercise: %v", err)
	}
	created := mustCreatePlan(t, s, TrainingPlan{Name: "Custom", Days: []PlanDay{{Weekday: "monday", Exercises: []PlanExercise{
		{Name: "Custom Lift", Sets: []Set{{Reps: 5, Weight: 50}}},
	}}}})

	if _, err := s.UpdateExercise(custom.ID, "Renamed Lift"); err != nil {
		t.Fatalf("failed to rename exercise: %v", err)
	}

	plan, _ := s.GetPlan(created.ID)
	if name := plan.Days[0].Exercises[0].Name; name != "Renamed Lift" {
		t.Errorf("expected plan exercise renamed, got %q", name)
	}
}

func TestSaveWorkout_WithPlanID(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	planID := created.ID
	if _, err := s.SaveWorkout(Workout{Date: monday, PlanID: &planID}); err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	if _, err := s.SaveWorkout(Workout{Date: tuesday}); err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	workouts, _ := s.GetWorkouts()
	byDate := map[string]Workout{}
	for _, w := range workouts {
		byDate[w.Date] = w
	}
	if p := byDate[monday].PlanID; p == nil || *p != planID {
		t.Errorf("expected monday workout plan_id %d, got %v", planID, p)
	}
	if p := byDate[tuesday].PlanID; p != nil {
		t.Errorf("expected tuesday workout without plan_id, got %d", *p)
	}
}
