package store

import (
	"errors"
	"testing"
)

func TestDefaultMuscleTagsSeededByMigration(t *testing.T) {
	s := newTestStore(t)

	muscles, err := s.GetExerciseMuscles()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, name := range defaultExerciseNames {
		if len(muscles[name]) == 0 {
			t.Errorf("expected default exercise %q to have muscle tags", name)
		}
	}

	bench := muscles["Bench Press"]
	want := map[string]string{"chest": RolePrimary, "triceps": RoleSecondary, "shoulders": RoleSecondary}
	if len(bench) != len(want) {
		t.Fatalf("expected %d Bench Press tags, got %+v", len(want), bench)
	}
	for _, m := range bench {
		if want[m.Muscle] != m.Role {
			t.Errorf("unexpected Bench Press tag %+v", m)
		}
	}
}

func TestSetExerciseMuscles_Replaces(t *testing.T) {
	s := newTestStore(t)

	if err := s.SetExerciseMuscles("Hip Thrust", []MuscleTarget{
		{Muscle: "glutes", Role: RolePrimary},
		{Muscle: "hamstrings", Role: RoleSecondary},
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.SetExerciseMuscles("Hip Thrust", []MuscleTarget{{Muscle: "glutes", Role: RolePrimary}}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	muscles, _ := s.GetExerciseMuscles()
	got := muscles["Hip Thrust"]
	if len(got) != 1 || got[0] != (MuscleTarget{Muscle: "glutes", Role: RolePrimary}) {
		t.Errorf("expected only glutes primary, got %+v", got)
	}
}

func TestSetExerciseMuscles_EmptyClears(t *testing.T) {
	s := newTestStore(t)

	if err := s.SetExerciseMuscles("Squat", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	muscles, _ := s.GetExerciseMuscles()
	if len(muscles["Squat"]) != 0 {
		t.Errorf("expected Squat tags cleared, got %+v", muscles["Squat"])
	}
}

func TestSetExerciseMuscles_RejectsInvalid(t *testing.T) {
	s := newTestStore(t)

	cases := [][]MuscleTarget{
		{{Muscle: "forearms", Role: RolePrimary}},
		{{Muscle: "chest", Role: "main"}},
		{{Muscle: "chest", Role: RolePrimary}, {Muscle: "chest", Role: RoleSecondary}},
	}
	for _, tags := range cases {
		if err := s.SetExerciseMuscles("Dip", tags); !errors.Is(err, ErrInvalidMuscle) {
			t.Errorf("expected ErrInvalidMuscle for %+v, got %v", tags, err)
		}
	}
	muscles, _ := s.GetExerciseMuscles()
	if len(muscles["Dip"]) != 0 {
		t.Errorf("expected no tags saved for rejected input, got %+v", muscles["Dip"])
	}
}

func TestUpdateExercise_RenamesMuscleTags(t *testing.T) {
	s := newTestStore(t)

	created, _ := s.CreateExercise("Hip Thrust")
	s.SetExerciseMuscles("Hip Thrust", []MuscleTarget{{Muscle: "glutes", Role: RolePrimary}})

	if _, err := s.UpdateExercise(created.ID, "Barbell Hip Thrust"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	muscles, _ := s.GetExerciseMuscles()
	if len(muscles["Hip Thrust"]) != 0 {
		t.Error("expected old name to have no tags")
	}
	if len(muscles["Barbell Hip Thrust"]) != 1 {
		t.Errorf("expected tags under new name, got %+v", muscles["Barbell Hip Thrust"])
	}
}

func TestGetAllExercises_IncludesMuscles(t *testing.T) {
	s := newTestStore(t)
	s.SeedDefaultExercises()
	s.CreateExercise("Hip Thrust")

	exercises, err := s.GetAllExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, e := range exercises {
		switch e.Name {
		case "Squat":
			if len(e.Muscles) == 0 {
				t.Error("expected Squat to include muscles")
			}
		case "Hip Thrust":
			if e.Muscles == nil || len(e.Muscles) != 0 {
				t.Errorf("expected untagged exercise to have empty (non-nil) muscles, got %#v", e.Muscles)
			}
		}
	}
}
