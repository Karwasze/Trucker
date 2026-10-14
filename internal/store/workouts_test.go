package store

import "testing"

func TestSaveAndGetWorkouts(t *testing.T) {
	s := newTestStore(t)

	workout := Workout{
		Date: "2026-03-15",
		Exercises: []Exercise{
			{
				Name: "Squat",
				Sets: []Set{
					{Weight: 100, Reps: 5},
					{Weight: 110, Reps: 3},
				},
			},
			{
				Name: "Bench Press",
				Sets: []Set{
					{Weight: 80, Reps: 8},
				},
			},
		},
	}

	id, err := s.SaveWorkout(workout)
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}

	if len(workouts) != 1 {
		t.Fatalf("expected 1 workout, got %d", len(workouts))
	}

	w := workouts[0]
	if w.ID != id {
		t.Errorf("expected returned id %d to match saved workout id %d", id, w.ID)
	}
	if w.Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", w.Date)
	}
	if len(w.Exercises) != 2 {
		t.Fatalf("expected 2 exercises, got %d", len(w.Exercises))
	}

	var squat *Exercise
	for i := range w.Exercises {
		if w.Exercises[i].Name == "Squat" {
			squat = &w.Exercises[i]
		}
	}
	if squat == nil {
		t.Fatal("expected Squat exercise")
	}
	if len(squat.Sets) != 2 {
		t.Errorf("expected 2 sets for Squat, got %d", len(squat.Sets))
	}
	if squat.Sets[0].Weight != 100 || squat.Sets[0].Reps != 5 {
		t.Errorf("unexpected set data: %+v", squat.Sets[0])
	}
}

func TestGetWorkouts_MultipleWorkouts_OrderedByDateDesc(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-10", []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, s, "2026-03-15", []Exercise{
		{Name: "Deadlift", Sets: []Set{{Weight: 120, Reps: 3}}},
	})
	seedWorkout(t, s, "2026-03-01", []Exercise{
		{Name: "Bench Press", Sets: []Set{{Weight: 60, Reps: 5}}},
	})
	seedWorkout(t, s, "2026-03-12", nil)
	seedWorkout(t, s, "2026-03-15", []Exercise{
		{Name: "Row", Sets: []Set{{Weight: 50, Reps: 8}}},
	})

	// Map iteration is random, so repeat to catch unstable ordering.
	for i := 0; i < 20; i++ {
		workouts, err := s.GetWorkouts()
		if err != nil {
			t.Fatalf("failed to get workouts: %v", err)
		}
		if len(workouts) != 5 {
			t.Fatalf("expected 5 workouts, got %d", len(workouts))
		}

		// Newest date first; same-day workouts newest-logged first.
		want := []string{"2026-03-15/Row", "2026-03-15/Deadlift", "2026-03-12/", "2026-03-10/Squat", "2026-03-01/Bench Press"}
		for j, w := range workouts {
			got := w.Date + "/"
			if len(w.Exercises) > 0 {
				got += w.Exercises[0].Name
			}
			if got != want[j] {
				t.Fatalf("position %d: expected %s, got %s", j, want[j], got)
			}
		}
	}
}

func TestGetWorkouts_DuplicateExerciseNamesKeepTheirSets(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-10", []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
		{Name: "Squat", Sets: []Set{{Weight: 80, Reps: 8}, {Weight: 80, Reps: 8}}},
	})

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	ex := workouts[0].Exercises
	if len(ex) != 2 || len(ex[0].Sets) != 1 || len(ex[1].Sets) != 2 {
		t.Fatalf("unexpected exercises: %+v", ex)
	}
}

func TestGetWorkouts_WorkoutWithoutExercisesOrSets(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-10", nil)
	seedWorkout(t, s, "2026-03-15", []Exercise{{Name: "Squat"}})
	seedWorkout(t, s, "2026-03-20", []Exercise{{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 5}}}})

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 3 {
		t.Fatalf("expected 3 workouts, got %d", len(workouts))
	}

	byDate := map[string]Workout{}
	for _, w := range workouts {
		byDate[w.Date] = w
	}
	if ex := byDate["2026-03-10"].Exercises; ex == nil || len(ex) != 0 {
		t.Errorf("expected empty exercises, got %+v", ex)
	}
	if ex := byDate["2026-03-15"].Exercises; len(ex) != 1 || ex[0].Sets == nil || len(ex[0].Sets) != 0 {
		t.Errorf("expected one exercise with no sets, got %+v", ex)
	}
	if ex := byDate["2026-03-20"].Exercises; len(ex) != 1 || len(ex[0].Sets) != 1 {
		t.Errorf("expected bench press with one set, got %+v", ex)
	}
}

func TestUpdateWorkout_ReplacesDateAndExercises(t *testing.T) {
	s := newTestStore(t)

	planID := 7
	id, err := s.SaveWorkout(Workout{
		Date:   "2026-03-15",
		PlanID: &planID,
		Exercises: []Exercise{
			{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}, {Weight: 100, Reps: 5}}},
			{Name: "Bench Press", Sets: []Set{{Weight: 80, Reps: 8}}},
		},
	})
	if err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}
	other := seedWorkout(t, s, "2026-03-10", []Exercise{
		{Name: "Deadlift", Sets: []Set{{Weight: 140, Reps: 3}}},
	})

	found, err := s.UpdateWorkout(Workout{
		ID:   id,
		Date: "2026-03-16",
		Exercises: []Exercise{
			{Name: "Squat", Sets: []Set{{Weight: 102.5, Reps: 5}}},
			{Name: "Row", Sets: []Set{{Weight: 60, Reps: 10}}},
		},
	})
	if err != nil {
		t.Fatalf("failed to update workout: %v", err)
	}
	if !found {
		t.Fatal("expected workout to be found")
	}

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 2 {
		t.Fatalf("expected 2 workouts, got %d", len(workouts))
	}

	w := workouts[0]
	if w.ID != id || w.Date != "2026-03-16" {
		t.Errorf("expected workout %d on 2026-03-16, got %d on %s", id, w.ID, w.Date)
	}
	if w.PlanID == nil || *w.PlanID != planID {
		t.Errorf("expected plan_id %d to be kept, got %v", planID, w.PlanID)
	}
	if len(w.Exercises) != 2 || w.Exercises[0].Name != "Squat" || w.Exercises[1].Name != "Row" {
		t.Fatalf("unexpected exercises: %+v", w.Exercises)
	}
	if len(w.Exercises[0].Sets) != 1 || w.Exercises[0].Sets[0].Weight != 102.5 {
		t.Errorf("unexpected squat sets: %+v", w.Exercises[0].Sets)
	}

	if workouts[1].ID != other || len(workouts[1].Exercises) != 1 {
		t.Errorf("expected other workout to be untouched, got %+v", workouts[1])
	}

	var orphanSets int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM sets WHERE exercise_id NOT IN (SELECT id FROM exercises)").Scan(&orphanSets); err != nil {
		t.Fatalf("failed to count sets: %v", err)
	}
	if orphanSets != 0 {
		t.Errorf("expected old sets to be removed, found %d orphans", orphanSets)
	}
}

func TestUpdateWorkout_NotFound(t *testing.T) {
	s := newTestStore(t)

	found, err := s.UpdateWorkout(Workout{ID: 999, Date: "2026-03-15"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected missing workout to report not found")
	}
}
