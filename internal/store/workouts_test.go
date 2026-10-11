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

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if len(workouts) != 2 {
		t.Fatalf("expected 2 workouts, got %d", len(workouts))
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
