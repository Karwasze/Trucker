package store

import (
	"errors"
	"reflect"
	"testing"
)

func float(v float64) *float64 { return &v }

func text(v string) *string { return &v }

func cardioRun(uuid, date string, km float64) CardioWorkout {
	return CardioWorkout{
		Date:            date,
		StartedAt:       date + "T07:00:00+02:00",
		Activity:        ActivityRunning,
		DurationSeconds: km * 330,
		DistanceM:       float(km * 1000),
		AvgHeartRate:    float(150),
		Samples:         []CardioSample{{T: 0, D: 0}, {T: 10, D: 30, HR: float(120)}},
		Laps:            []CardioLap{{T: 0, Duration: 330, D: 1000}},
		Source:          "Apple Watch",
		SourceUUID:      text(uuid),
	}
}

func TestSaveCardioWorkouts_SkipsAlreadyImported(t *testing.T) {
	s := newTestStore(t)

	saved, err := s.SaveCardioWorkouts([]CardioWorkout{cardioRun("a", "2026-10-10", 5)})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != 1 || saved[0].ID == 0 {
		t.Fatalf("expected one saved workout with an ID, got %+v", saved)
	}

	// Importing the same Health workout again, alongside a new one, only
	// saves the new one.
	saved, err = s.SaveCardioWorkouts([]CardioWorkout{
		cardioRun("a", "2026-10-10", 5),
		cardioRun("b", "2026-10-12", 8),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != 1 || *saved[0].SourceUUID != "b" {
		t.Fatalf("expected only the new workout saved, got %+v", saved)
	}

	all, err := s.ListCardioWorkouts("")
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 workouts, got %d", len(all))
	}
}

func TestListCardioWorkouts(t *testing.T) {
	s := newTestStore(t)
	ride := CardioWorkout{
		Date: "2026-10-11", StartedAt: "2026-10-11T09:00:00+02:00",
		Activity: ActivityCycling, DurationSeconds: 3600, DistanceM: float(30000),
	}
	if _, err := s.SaveCardioWorkouts([]CardioWorkout{
		cardioRun("a", "2026-10-10", 5), ride, cardioRun("b", "2026-10-12", 8),
	}); err != nil {
		t.Fatal(err)
	}

	all, err := s.ListCardioWorkouts("")
	if err != nil {
		t.Fatal(err)
	}
	var dates []string
	for _, w := range all {
		dates = append(dates, w.Date)
		if w.Samples != nil || w.Laps != nil {
			t.Errorf("expected the list to leave out samples and laps, got %+v", w)
		}
	}
	if want := []string{"2026-10-12", "2026-10-11", "2026-10-10"}; !reflect.DeepEqual(dates, want) {
		t.Errorf("expected newest first %v, got %v", want, dates)
	}

	runs, err := s.ListCardioWorkouts(ActivityRunning)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 2 {
		t.Errorf("expected 2 runs, got %d", len(runs))
	}

	none, err := s.ListCardioWorkouts(ActivitySwimming)
	if err != nil {
		t.Fatal(err)
	}
	if none == nil || len(none) != 0 {
		t.Errorf("expected an empty, non-nil list, got %#v", none)
	}
}

func TestGetCardioWorkout_IncludesSamples(t *testing.T) {
	s := newTestStore(t)
	run := cardioRun("a", "2026-10-10", 5)
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{run})
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.GetCardioWorkout(saved[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	run.ID = saved[0].ID
	if !reflect.DeepEqual(got, run) {
		t.Errorf("got %+v, want %+v", got, run)
	}

	if _, err := s.GetCardioWorkout(999); err != ErrCardioWorkoutNotFound {
		t.Errorf("expected ErrCardioWorkoutNotFound, got %v", err)
	}
}

func TestDeleteCardioWorkout(t *testing.T) {
	s := newTestStore(t)
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{cardioRun("a", "2026-10-10", 5)})
	if err != nil {
		t.Fatal(err)
	}

	found, err := s.DeleteCardioWorkout(saved[0].ID)
	if err != nil || !found {
		t.Fatalf("expected the workout deleted, got %v, %v", found, err)
	}
	found, err = s.DeleteCardioWorkout(saved[0].ID)
	if err != nil || found {
		t.Errorf("expected nothing left to delete, got %v, %v", found, err)
	}
}

func TestSetCardioDistance(t *testing.T) {
	s := newTestStore(t)

	// An indoor ride without a speed sensor comes from Health without a distance.
	ride := cardioRun("ride", "2026-10-10", 0)
	ride.Activity = ActivityCycling
	ride.DurationSeconds = 3600
	ride.DistanceM = nil
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{ride, cardioRun("run", "2026-10-11", 5)})
	if err != nil {
		t.Fatal(err)
	}
	rideID, runID := saved[0].ID, saved[1].ID

	got, err := s.SetCardioDistance(rideID, 30000)
	if err != nil {
		t.Fatal(err)
	}
	if got.DistanceM == nil || *got.DistanceM != 30000 || !got.ManualDistance {
		t.Errorf("expected a manual 30 km, got %v manual=%v", got.DistanceM, got.ManualDistance)
	}

	// A distance entered by hand can be corrected.
	if got, err = s.SetCardioDistance(rideID, 32000); err != nil || *got.DistanceM != 32000 {
		t.Errorf("expected the distance corrected to 32 km, got %v %v", got.DistanceM, err)
	}
	if list, _ := s.ListCardioWorkouts(ActivityCycling); len(list) != 1 || !list[0].ManualDistance {
		t.Errorf("expected the listed ride marked manual, got %+v", list)
	}

	// One Health measured is kept.
	if _, err := s.SetCardioDistance(runID, 6000); !errors.Is(err, ErrDistanceMeasured) {
		t.Errorf("expected ErrDistanceMeasured for a measured run, got %v", err)
	}
	if run, _ := s.GetCardioWorkout(runID); *run.DistanceM != 5000 || run.ManualDistance {
		t.Errorf("expected the run's 5 km kept, got %v manual=%v", *run.DistanceM, run.ManualDistance)
	}

	if _, err := s.SetCardioDistance(9999, 1000); !errors.Is(err, ErrCardioWorkoutNotFound) {
		t.Errorf("expected ErrCardioWorkoutNotFound, got %v", err)
	}
}
