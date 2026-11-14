package store

import (
	"errors"
	"reflect"
	"testing"
)

func float(v float64) *float64 { return &v }

func text(v string) *string { return &v }

func boolean(v bool) *bool { return &v }

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

func TestSaveCardioWorkouts_KeepsDistanceEnteredOnImport(t *testing.T) {
	s := newTestStore(t)
	// An indoor run whose watch estimate of 2 km was replaced by the
	// treadmill's 2.5 km while importing it.
	run := cardioRun("a", "2026-10-10", 2)
	run.Samples = []CardioSample{{T: 0, D: 0}, {T: 330, D: 1000}, {T: 660, D: 2000}}
	run.Indoor = boolean(true)
	run.DistanceM = float(2500)
	run.ManualDistance = true
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{run})
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.GetCardioWorkout(saved[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.ManualDistance || *got.DistanceM != 2500 {
		t.Errorf("expected the distance entered kept as entered by hand, got %+v", got)
	}
	if last := got.Samples[len(got.Samples)-1].D; last != 2500 {
		t.Errorf("expected the samples scaled to the distance entered, got %v", last)
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

	got, err := s.SetCardioDistance(rideID, 30000, false)
	if err != nil {
		t.Fatal(err)
	}
	if got.DistanceM == nil || *got.DistanceM != 30000 || !got.ManualDistance {
		t.Errorf("expected a manual 30 km, got %v manual=%v", got.DistanceM, got.ManualDistance)
	}

	// A distance entered by hand can be corrected.
	if got, err = s.SetCardioDistance(rideID, 32000, false); err != nil || *got.DistanceM != 32000 {
		t.Errorf("expected the distance corrected to 32 km, got %v %v", got.DistanceM, err)
	}
	if list, _ := s.ListCardioWorkouts(ActivityCycling); len(list) != 1 || !list[0].ManualDistance {
		t.Errorf("expected the listed ride marked manual, got %+v", list)
	}

	// One Health measured is kept.
	if _, err := s.SetCardioDistance(runID, 6000, false); !errors.Is(err, ErrDistanceMeasured) {
		t.Errorf("expected ErrDistanceMeasured for a measured run, got %v", err)
	}
	if run, _ := s.GetCardioWorkout(runID); *run.DistanceM != 5000 || run.ManualDistance {
		t.Errorf("expected the run's 5 km kept, got %v manual=%v", *run.DistanceM, run.ManualDistance)
	}

	if _, err := s.SetCardioDistance(9999, 1000, false); !errors.Is(err, ErrCardioWorkoutNotFound) {
		t.Errorf("expected ErrCardioWorkoutNotFound, got %v", err)
	}
}

func TestSetCardioPlace_OnlyFillsAnUnknownPlace(t *testing.T) {
	s := newTestStore(t)
	// Imported before the place was kept, with a distance entered since.
	ride := cardioRun("ride", "2026-10-10", 30)
	ride.Activity = ActivityCycling
	ride.DistanceM = nil
	outdoor := cardioRun("outdoor", "2026-10-11", 5)
	outdoor.Indoor = boolean(false)
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{ride, outdoor})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetCardioDistance(saved[0].ID, 30000, false); err != nil {
		t.Fatal(err)
	}

	got, err := s.SetCardioPlace(saved[0].ID, true)
	if err != nil || got.Indoor == nil || !*got.Indoor || !got.ManualDistance || *got.DistanceM != 30000 {
		t.Errorf("expected the ride marked indoors with its distance kept, got %+v %v", got, err)
	}
	// A place Health gave on import stays.
	if got, err := s.SetCardioPlace(saved[1].ID, true); err != nil || *got.Indoor {
		t.Errorf("expected the outdoor run kept outdoors, got %+v %v", got, err)
	}
	if _, err := s.SetCardioPlace(9999, true); !errors.Is(err, ErrCardioWorkoutNotFound) {
		t.Errorf("expected ErrCardioWorkoutNotFound, got %v", err)
	}
}

func TestSetCardioDistance_IndoorRun(t *testing.T) {
	s := newTestStore(t)

	// The watch estimates an indoor run's distance from the wrist: 5 km here
	// of a 6 km treadmill run.
	indoor := cardioRun("treadmill", "2026-10-10", 5)
	indoor.Indoor = boolean(true)
	indoor.Samples = []CardioSample{{T: 0, D: 0}, {T: 900, D: 2500, HR: float(140)}, {T: 1650, D: 5000}}
	indoor.Laps = []CardioLap{{T: 0, Duration: 330, D: 1000}, {T: 330, Duration: 330, D: 1000}}
	outdoor := cardioRun("outdoor", "2026-10-11", 5)
	outdoor.Indoor = boolean(false)
	// Imported before the place was recorded.
	unknown := cardioRun("unknown", "2026-10-12", 5)
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{indoor, outdoor, unknown})
	if err != nil {
		t.Fatal(err)
	}
	indoorID, outdoorID, unknownID := saved[0].ID, saved[1].ID, saved[2].ID

	got, err := s.SetCardioDistance(indoorID, 6000, false)
	if err != nil {
		t.Fatal(err)
	}
	if *got.DistanceM != 6000 || !got.ManualDistance || got.Indoor == nil || !*got.Indoor {
		t.Errorf("expected a manual 6 km indoor run, got %v manual=%v indoor=%v", *got.DistanceM, got.ManualDistance, got.Indoor)
	}

	// What the samples and laps covered follows the distance entered.
	run, err := s.GetCardioWorkout(indoorID)
	if err != nil {
		t.Fatal(err)
	}
	if d := run.Samples[1].D; d != 3000 {
		t.Errorf("expected the samples scaled to 3 km halfway, got %v", d)
	}
	if d := run.Samples[2].D; d != 6000 {
		t.Errorf("expected the samples scaled to 6 km in all, got %v", d)
	}
	if run.Samples[1].HR == nil || *run.Samples[1].HR != 140 || run.Samples[1].T != 900 {
		t.Errorf("expected the rest of the samples kept, got %+v", run.Samples[1])
	}
	if want := []CardioLap{{T: 0, Duration: 330, D: 1200}, {T: 330, Duration: 330, D: 1200}}; !reflect.DeepEqual(run.Laps, want) {
		t.Errorf("expected laps %+v, got %+v", want, run.Laps)
	}

	// Correcting it scales from what the watch measured, not the last entry.
	if _, err := s.SetCardioDistance(indoorID, 5500, false); err != nil {
		t.Fatal(err)
	}
	if run, _ := s.GetCardioWorkout(indoorID); run.Samples[2].D != 5500 || run.Laps[0].D != 1100 {
		t.Errorf("expected samples and laps scaled to 5.5 km, got %v and %v", run.Samples[2].D, run.Laps[0].D)
	}

	// An outdoor run's distance is measured.
	if _, err := s.SetCardioDistance(outdoorID, 6000, true); !errors.Is(err, ErrDistanceMeasured) {
		t.Errorf("expected ErrDistanceMeasured for an outdoor run, got %v", err)
	}
	// One imported before the place was recorded is taken as measured
	// unless it's said to be indoors, which is then recorded.
	if _, err := s.SetCardioDistance(unknownID, 6000, false); !errors.Is(err, ErrDistanceMeasured) {
		t.Errorf("expected ErrDistanceMeasured for a run of unknown place, got %v", err)
	}
	if got, err := s.SetCardioDistance(unknownID, 6000, true); err != nil || got.Indoor == nil || !*got.Indoor {
		t.Errorf("expected the run recorded indoors, got %v %v", got.Indoor, err)
	}
	if run, _ := s.GetCardioWorkout(unknownID); run.Indoor == nil || !*run.Indoor || *run.DistanceM != 6000 {
		t.Errorf("expected a 6 km indoor run stored, got %v %v", run.Indoor, *run.DistanceM)
	}
	if run, _ := s.GetCardioWorkout(outdoorID); run.Indoor == nil || *run.Indoor {
		t.Errorf("expected the outdoor run kept outdoors, got %v", run.Indoor)
	}
}

func TestGetCardioWorkout_DropsMileSplits(t *testing.T) {
	s := newTestStore(t)
	// The watch marks a split every kilometre and every mile of a 3.5 km
	// run, interleaved.
	run := cardioRun("a", "2026-10-10", 3.5)
	run.Laps = []CardioLap{
		{T: 0, Duration: 300, D: 1000},
		{T: 0, Duration: 483, D: 1609.3},
		{T: 300, Duration: 300, D: 1000},
		{T: 483, Duration: 483, D: 1609.3},
		{T: 600, Duration: 300, D: 1000},
		{T: 966, Duration: 84, D: 281.4},
		{T: 900, Duration: 150, D: 500},
	}
	saved, err := s.SaveCardioWorkouts([]CardioWorkout{run})
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.GetCardioWorkout(saved[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	want := []CardioLap{
		{T: 0, Duration: 300, D: 1000},
		{T: 300, Duration: 300, D: 1000},
		{T: 600, Duration: 300, D: 1000},
		{T: 900, Duration: 150, D: 500},
	}
	if !reflect.DeepEqual(got.Laps, want) {
		t.Errorf("got laps %+v, want %+v", got.Laps, want)
	}
}

func TestKilometreLaps_KeepsLapsMarkedByHand(t *testing.T) {
	laps := []CardioLap{
		{T: 0, Duration: 600, D: 2000},
		{T: 600, Duration: 200, D: 800},
		{T: 800, Duration: 120, D: 300},
	}
	if got := kilometreLaps(laps); !reflect.DeepEqual(got, laps) {
		t.Errorf("got %+v, want %+v", got, laps)
	}
}

func TestListCardioWorkoutsBetween(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s,
		cardioRun("a", "2026-09-30", 5),
		cardioRun("b", "2026-10-01", 5),
		cardioRun("c", "2026-10-31", 5),
		cardioRun("d", "2026-11-01", 5),
	)
	ride := cardio(ActivityCycling, "2026-10-15", 20000, 2400)
	seedCardio(t, s, ride)

	got, err := s.ListCardioWorkoutsBetween("", "2026-10-01", "2026-10-31")
	if err != nil {
		t.Fatal(err)
	}
	var dates []string
	for _, w := range got {
		dates = append(dates, w.Date)
	}
	if !reflect.DeepEqual(dates, []string{"2026-10-31", "2026-10-15", "2026-10-01"}) {
		t.Errorf("expected October's workouts newest first, got %v", dates)
	}

	runs, err := s.ListCardioWorkoutsBetween(ActivityRunning, "2026-10-01", "2026-10-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 2 {
		t.Errorf("expected October's two runs, got %+v", runs)
	}
}
