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
				{Name: "Squat", Sets: 1, Reps: 3},
			}},
			{Weekday: "monday", Exercises: []PlanExercise{
				{Name: "Squat", Sets: 2, Reps: 5},
				{Name: "Bench Press", Sets: 3, Reps: 8},
				{Name: "Deadlift", Sets: 1, Reps: 5},
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
	if mon[0] != (PlanExercise{Name: "Squat", Sets: 2, Reps: 5}) || mon[1] != (PlanExercise{Name: "Bench Press", Sets: 3, Reps: 8}) {
		t.Errorf("unexpected set/rep schemes: %+v", mon)
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
			{Name: "Overhead Press", Sets: 4, Reps: 8},
		}}},
	})
	if err != nil {
		t.Fatalf("failed to update plan: %v", err)
	}
	if updated.Name != "Renamed" || len(updated.Days) != 1 || updated.Days[0].Weekday != "tuesday" {
		t.Errorf("unexpected updated plan: %+v", updated)
	}
	if ex := updated.Days[0].Exercises; len(ex) != 1 || ex[0] != (PlanExercise{Name: "Overhead Press", Sets: 4, Reps: 8}) {
		t.Errorf("unexpected updated exercises: %+v", ex)
	}

	var exerciseCount int
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_exercises").Scan(&exerciseCount)
	if exerciseCount != 1 {
		t.Errorf("expected old rows replaced (1 exercise), got %d exercises", exerciseCount)
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
		{Name: "Squat", Sets: 3, Reps: 5},
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

	var exerciseCount int
	s.db.QueryRow("SELECT COUNT(*) FROM training_plan_exercises").Scan(&exerciseCount)
	if exerciseCount != 1 {
		t.Errorf("expected only the kept plan's rows to remain, got %d exercises", exerciseCount)
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

func TestExerciseTargets(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-10-05", []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}},
		{Name: "Bench Press", Sets: []Set{{Reps: 8, Weight: 60}, {Reps: 8, Weight: 60}, {Reps: 6, Weight: 60}}},
	})
	// Logged without a plan, and the same exercise twice in one workout:
	// every session of the exercise counts, merged per workout.
	seedWorkout(t, s, "2026-10-09", []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 105}}},
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 105}}},
	})
	// Logged after the date asked about, so it is ignored.
	seedWorkout(t, s, "2026-10-20", []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 200}, {Reps: 5, Weight: 200}}},
	})

	targets, err := s.ExerciseTargets([]PlanExercise{
		{Name: "Squat", Sets: 2, Reps: 5},
		{Name: "Bench Press", Sets: 3, Reps: 8},
		{Name: "Deadlift", Sets: 1, Reps: 5},
	}, monday)
	if err != nil {
		t.Fatalf("failed to get targets: %v", err)
	}

	want := []ExerciseTarget{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 110}, {Reps: 5, Weight: 110}},
			Reason: "Weight up 5 kg: you completed 2 × 5 @ 105 kg last time."},
		{Name: "Bench Press", Sets: []Set{{Reps: 8, Weight: 60}, {Reps: 8, Weight: 60}, {Reps: 7, Weight: 60}},
			Reason: "You didn't finish 3 × 8 @ 60 kg last time: same weight, one more rep on short sets. 2 more misses deload."},
		{Name: "Deadlift", Sets: []Set{{Reps: 5, Weight: 0}}, Reason: "No history yet: pick a starting weight."},
	}
	if !reflect.DeepEqual(targets, want) {
		t.Errorf("expected targets %+v, got %+v", want, targets)
	}
}

func TestExerciseTargets_FollowEditedHistory(t *testing.T) {
	s := newTestStore(t)
	scheme := []PlanExercise{{Name: "Squat", Sets: 1, Reps: 5}}
	id := seedWorkout(t, s, "2026-10-05", []Exercise{{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}}}})

	if _, err := s.UpdateWorkout(Workout{ID: id, Date: "2026-10-05", Exercises: []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 4, Weight: 100}}},
	}}); err != nil {
		t.Fatalf("failed to update workout: %v", err)
	}

	targets, err := s.ExerciseTargets(scheme, monday)
	if err != nil {
		t.Fatalf("failed to get targets: %v", err)
	}
	if got := targets[0].Sets; !reflect.DeepEqual(got, []Set{{Reps: 5, Weight: 100}}) {
		t.Errorf("expected the edited miss to repeat 100 kg, got %+v", got)
	}
}

func TestEvaluateProgression(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())
	planID := created.ID

	for _, date := range []string{"2026-09-28", "2026-10-05"} {
		seedWorkout(t, s, date, []Exercise{{Name: "Bench Press", Sets: []Set{{Reps: 8, Weight: 60}, {Reps: 8, Weight: 60}, {Reps: 6, Weight: 60}}}})
	}

	workout := Workout{Date: monday, PlanID: &planID, Exercises: []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}},
		{Name: "Bench Press", Sets: []Set{{Reps: 8, Weight: 60}, {Reps: 7, Weight: 60}, {Reps: 7, Weight: 60}}},
		{Name: "Bicep Curl", Sets: []Set{{Reps: 10, Weight: 15}}},
	}}
	id, err := s.SaveWorkout(workout)
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	workout.ID = id
	// A later workout on the same day must not affect this one's results.
	seedWorkout(t, s, monday, []Exercise{{Name: "Squat", Sets: []Set{{Reps: 1, Weight: 100}}}})

	results, err := s.EvaluateProgression(planID, workout)
	if err != nil {
		t.Fatalf("failed to evaluate progression: %v", err)
	}

	want := []ProgressionResult{
		{Exercise: "Squat", Result: ResultProgressed},
		{Exercise: "Bench Press", Result: ResultDeloaded},
	}
	if !reflect.DeepEqual(results, want) {
		t.Errorf("expected results %+v, got %+v", want, results)
	}

	after, _ := s.GetPlan(planID)
	if !reflect.DeepEqual(after, created) {
		t.Errorf("expected evaluating not to change the plan, got %+v", after)
	}
}

func TestExerciseTargets_AfterBreak(t *testing.T) {
	s := newTestStore(t)
	seedWorkout(t, s, "2026-09-14", []Exercise{{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}}}})

	targets, err := s.ExerciseTargets([]PlanExercise{{Name: "Squat", Sets: 1, Reps: 5}}, monday)
	if err != nil {
		t.Fatalf("failed to get targets: %v", err)
	}
	want := []ExerciseTarget{{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 80}},
		Reason: "Back after 4 weeks off: weight down 20% from 100 kg to ease back in."}}
	if !reflect.DeepEqual(targets, want) {
		t.Errorf("expected targets %+v, got %+v", want, targets)
	}
}

// The break before a workout eases its next target, but doesn't change how
// the workout itself is judged.
func TestEvaluateProgression_AfterBreak(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())
	planID := created.ID
	seedWorkout(t, s, "2026-08-03", []Exercise{{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}, {Reps: 5, Weight: 100}}}})

	workout := Workout{Date: monday, PlanID: &planID, Exercises: []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 70}, {Reps: 5, Weight: 70}}},
	}}
	id, err := s.SaveWorkout(workout)
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	workout.ID = id

	results, err := s.EvaluateProgression(planID, workout)
	if err != nil {
		t.Fatalf("failed to evaluate progression: %v", err)
	}
	if want := []ProgressionResult{{Exercise: "Squat", Result: ResultProgressed}}; !reflect.DeepEqual(results, want) {
		t.Errorf("expected results %+v, got %+v", want, results)
	}
}

func TestEvaluateProgression_RestDay(t *testing.T) {
	s := newTestStore(t)
	created := mustCreatePlan(t, s, samplePlan())

	results, err := s.EvaluateProgression(created.ID, Workout{ID: 1, Date: tuesday, Exercises: []Exercise{
		{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 200}}},
	}})
	if err != nil {
		t.Fatalf("failed to evaluate progression: %v", err)
	}
	if results == nil || len(results) != 0 {
		t.Errorf("expected empty non-nil results on a rest day, got %+v", results)
	}
}

func TestUpdateExercise_PropagatesToPlans(t *testing.T) {
	s := newTestStore(t)
	custom, err := s.CreateExercise("Custom Lift")
	if err != nil {
		t.Fatalf("failed to create exercise: %v", err)
	}
	created := mustCreatePlan(t, s, TrainingPlan{Name: "Custom", Days: []PlanDay{{Weekday: "monday", Exercises: []PlanExercise{
		{Name: "Custom Lift", Sets: 3, Reps: 5},
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

func TestGetPlanWorkout(t *testing.T) {
	s := newTestStore(t)
	planID := mustCreatePlan(t, s, samplePlan()).ID
	other := mustCreatePlan(t, s, TrainingPlan{Name: "Other"}).ID
	monday := "2026-10-12"

	got, err := s.GetPlanWorkout(planID, monday)
	if err != nil || got != nil {
		t.Fatalf("expected no workout before logging, got %+v, %v", got, err)
	}

	// Workouts without the plan, from another plan or on another day don't count.
	seedWorkout(t, s, monday, []Exercise{{Name: "Curl", Sets: []Set{{Reps: 10, Weight: 10}}}})
	if _, err := s.SaveWorkout(Workout{Date: monday, PlanID: &other}); err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	if _, err := s.SaveWorkout(Workout{Date: "2026-10-05", PlanID: &planID}); err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	if got, _ := s.GetPlanWorkout(planID, monday); got != nil {
		t.Fatalf("expected no plan workout on %s, got %+v", monday, got)
	}

	exercises := []Exercise{{Name: "Squat", Sets: []Set{{Reps: 5, Weight: 100}}}}
	id, err := s.SaveWorkout(Workout{Date: monday, PlanID: &planID, Exercises: exercises})
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	got, err = s.GetPlanWorkout(planID, monday)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got.ID != id || got.Date != monday || got.PlanID == nil || *got.PlanID != planID ||
		!reflect.DeepEqual(got.Exercises, exercises) {
		t.Errorf("expected workout %d with %+v, got %+v", id, exercises, got)
	}
}
