package store

import "testing"

func TestSaveAndGetWorkouts(t *testing.T) {
	s := newTestStore(t)

	workout := Workout{
		Date:        "2026-03-15",
		WorkoutType: "custom",
		WorkoutDay:  0,
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

	if err := s.SaveWorkout(workout); err != nil {
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
	if w.Date != "2026-03-15" {
		t.Errorf("expected date 2026-03-15, got %s", w.Date)
	}
	if w.WorkoutType != "custom" {
		t.Errorf("expected workout_type custom, got %s", w.WorkoutType)
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

func TestSaveWorkout_GZCLPType(t *testing.T) {
	s := newTestStore(t)

	workout := Workout{
		Date:        "2026-03-15",
		WorkoutType: "gzclp",
		WorkoutDay:  2,
		Exercises: []Exercise{
			{Name: "Squat", Sets: []Set{{Weight: 100, Reps: 5}}},
		},
	}

	if err := s.SaveWorkout(workout); err != nil {
		t.Fatalf("failed to save workout: %v", err)
	}

	workouts, err := s.GetWorkouts()
	if err != nil {
		t.Fatalf("failed to get workouts: %v", err)
	}
	if workouts[0].WorkoutType != "gzclp" {
		t.Errorf("expected gzclp type, got %s", workouts[0].WorkoutType)
	}
	if workouts[0].WorkoutDay != 2 {
		t.Errorf("expected workout day 2, got %d", workouts[0].WorkoutDay)
	}
}

func TestGetWorkouts_MultipleWorkouts_OrderedByDateDesc(t *testing.T) {
	s := newTestStore(t)

	seedWorkout(t, s, "2026-03-10", "custom", 0, []Exercise{
		{Name: "Squat", Sets: []Set{{Weight: 80, Reps: 5}}},
	})
	seedWorkout(t, s, "2026-03-15", "custom", 0, []Exercise{
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
