package store

import (
	"fmt"
	"testing"
)

func TestSeedDefaultGZCLPDayExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultGZCLPDayExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM gzclp_day_exercises").Scan(&count)
	if count != 20 {
		t.Errorf("expected 20 GZCLP day exercises, got %d", count)
	}

	for day := 1; day <= 4; day++ {
		var dayCount int
		s.db.QueryRow("SELECT COUNT(*) FROM gzclp_day_exercises WHERE day = ?", day).Scan(&dayCount)
		if dayCount != 5 {
			t.Errorf("expected 5 exercises for day %d, got %d", day, dayCount)
		}
	}
}

func TestGetGZCLPCurrentDay_Default(t *testing.T) {
	s := newTestStore(t)

	day, err := s.GetGZCLPCurrentDay()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != 1 {
		t.Errorf("expected day 1, got %d", day)
	}
}

func TestGetGZCLPCurrentDay_AfterUpdate(t *testing.T) {
	s := newTestStore(t)

	s.db.Exec("UPDATE gzclp_settings SET current_day = 3 WHERE id = 1")

	day, err := s.GetGZCLPCurrentDay()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if day != 3 {
		t.Errorf("expected day 3, got %d", day)
	}
}

func TestGetGZCLPExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultGZCLPDayExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		day                                    int
		wantT1, wantT2, wantT3, wantA1, wantA2 string
	}{
		{1, "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"},
		{2, "Overhead Press", "Deadlift", "Bent Over Row", "Lateral Raise", "Leg Curl"},
		{3, "Bench Press", "Squat", "Lat Pulldown", "Chest Fly", "Leg Press"},
		{4, "Deadlift", "Overhead Press", "Bent Over Row", "Leg Curl", "Lateral Raise"},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("Day%d", tt.day), func(t *testing.T) {
			t1, t2, t3, a1, a2 := s.GetGZCLPExercises(tt.day)
			if t1 != tt.wantT1 {
				t.Errorf("T1: got %q, want %q", t1, tt.wantT1)
			}
			if t2 != tt.wantT2 {
				t.Errorf("T2: got %q, want %q", t2, tt.wantT2)
			}
			if t3 != tt.wantT3 {
				t.Errorf("T3: got %q, want %q", t3, tt.wantT3)
			}
			if a1 != tt.wantA1 {
				t.Errorf("Additional1: got %q, want %q", a1, tt.wantA1)
			}
			if a2 != tt.wantA2 {
				t.Errorf("Additional2: got %q, want %q", a2, tt.wantA2)
			}
		})
	}
}

func TestGetGZCLPExercises_FallbackDefaults(t *testing.T) {
	s := newTestStore(t)
	// No day exercises seeded — should return hardcoded defaults
	t1, t2, t3, a1, a2 := s.GetGZCLPExercises(99)
	if t1 != "Squat" || t2 != "Bench Press" || t3 != "Lat Pulldown" || a1 != "Leg Press" || a2 != "Chest Fly" {
		t.Errorf("unexpected fallback defaults: %s, %s, %s, %s, %s", t1, t2, t3, a1, a2)
	}
}

func TestGetGZCLPAllDayExercises(t *testing.T) {
	s := newTestStore(t)
	if err := s.SeedDefaultGZCLPDayExercises(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	assignments, err := s.GetGZCLPAllDayExercises()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(assignments) != 20 {
		t.Errorf("expected 20 assignments, got %d", len(assignments))
	}
}
