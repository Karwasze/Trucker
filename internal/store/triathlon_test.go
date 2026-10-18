package store

import (
	"reflect"
	"testing"
)

// cardioAt is a cardio workout starting at a time of day ("15:04").
func cardioAt(activity, date, clock string, metres, seconds float64) CardioWorkout {
	w := cardio(activity, date, metres, seconds)
	w.StartedAt = date + "T" + clock + ":00Z"
	return w
}

// quarter is a quarter Ironman day, with the leg times given.
func quarter(date string, swim, bike, run float64) []CardioWorkout {
	return []CardioWorkout{
		cardioAt(ActivitySwimming, date, "07:00", 950, swim),
		cardioAt(ActivityCycling, date, "10:00", 45000, bike),
		cardioAt(ActivityRunning, date, "17:00", 10550, run),
	}
}

func TestTriathlons_AnyDayWithASwimRideAndRun(t *testing.T) {
	workouts := []CardioWorkout{
		// In any order and hours apart, with two runs adding up and a walk left out.
		cardioAt(ActivityRunning, "2026-03-10", "06:00", 4000, 1200),
		cardioAt(ActivityCycling, "2026-03-10", "09:00", 45000, 4800),
		cardioAt(ActivityWalking, "2026-03-10", "12:00", 3000, 2000),
		cardioAt(ActivitySwimming, "2026-03-10", "18:00", 950, 1800),
		cardioAt(ActivityRunning, "2026-03-10", "19:00", 6550, 1800),
		// Without a ride it isn't one.
		cardioAt(ActivitySwimming, "2026-03-11", "07:00", 1500, 1800),
		cardioAt(ActivityRunning, "2026-03-11", "08:00", 10000, 3000),
	}
	for i := range workouts {
		workouts[i].ID = i + 1
	}

	got := triathlons(workouts)
	if len(got) != 1 {
		t.Fatalf("expected 1 triathlon, got %+v", got)
	}
	want := Triathlon{
		Date:         "2026-03-10",
		Class:        TriathlonQuarter,
		Swim:         TriathlonLeg{WorkoutIDs: []int{4}, DistanceM: 950, DurationSeconds: 1800},
		Bike:         TriathlonLeg{WorkoutIDs: []int{2}, DistanceM: 45000, DurationSeconds: 4800},
		Run:          TriathlonLeg{WorkoutIDs: []int{1, 5}, DistanceM: 10550, DurationSeconds: 3000},
		TotalSeconds: 9600,
		PR:           true,
	}
	if !reflect.DeepEqual(got[0], want) {
		t.Errorf("expected %+v, got %+v", want, got[0])
	}
}

func TestTriathlonClass(t *testing.T) {
	for _, tc := range []struct {
		swim, bike, run float64
		want            string
	}{
		{750, 20000, 5000, TriathlonSprint},
		{800, 22500, 5400, TriathlonSprint},
		{950, 45000, 10550, TriathlonQuarter},
		{1000, 42000, 10500, TriathlonQuarter},
		{1900, 90000, 21097, TriathlonHalf},
		{3800, 180000, 42195, TriathlonFull},
		// Too far from any standard distance.
		{1000, 30000, 7000, TriathlonCustom},
		{2500, 60000, 15000, TriathlonCustom},
		// Olympic distances aren't a class of their own.
		{1500, 40000, 10000, TriathlonCustom},
		{1500, 40000, 21000, TriathlonCustom},
		// A ride without a distance, e.g. indoors.
		{1500, 0, 10000, TriathlonCustom},
	} {
		if got := triathlonClass(tc.swim, tc.bike, tc.run); got != tc.want {
			t.Errorf("%v/%v/%v: expected %s, got %s", tc.swim, tc.bike, tc.run, tc.want, got)
		}
	}
}

func TestTriathlons_PRIsTheFastestOfItsClassSoFar(t *testing.T) {
	var workouts []CardioWorkout
	workouts = append(workouts, quarter("2026-03-01", 1800, 4800, 3000)...) // 9600, first
	workouts = append(workouts, quarter("2026-03-08", 1800, 5000, 3000)...) // 9800, slower
	workouts = append(workouts, quarter("2026-03-15", 1700, 4700, 2900)...) // 9300, faster
	workouts = append(workouts,
		cardioAt(ActivitySwimming, "2026-03-20", "07:00", 1000, 1200),
		cardioAt(ActivityCycling, "2026-03-20", "08:00", 30000, 3600),
		cardioAt(ActivityRunning, "2026-03-20", "09:00", 7000, 2100),
	)

	var prs []bool
	for _, tri := range triathlons(workouts) {
		prs = append(prs, tri.PR)
	}
	// Custom distances aren't comparable, so never PRs.
	if want := []bool{true, false, true, false}; !reflect.DeepEqual(prs, want) {
		t.Errorf("expected PRs %v, got %v", want, prs)
	}
}

func TestTriathlonSummary(t *testing.T) {
	var workouts []CardioWorkout
	workouts = append(workouts, quarter("2026-02-01", 1700, 4500, 2900)...) // 9100, before the timespan
	workouts = append(workouts, quarter("2026-03-01", 1800, 4800, 3000)...)
	workouts = append(workouts,
		cardioAt(ActivitySwimming, "2026-03-08", "07:00", 750, 900),
		cardioAt(ActivityCycling, "2026-03-08", "08:00", 20000, 2400),
		cardioAt(ActivityRunning, "2026-03-08", "09:00", 5000, 1500),
	)
	workouts = append(workouts, quarter("2026-03-15", 1800, 4500, 3900)...) // 10200

	summary := triathlonSummary(triathlons(workouts), "2026-02-15")
	if summary == nil {
		t.Fatal("expected a summary")
	}
	if summary.Count != 3 {
		t.Errorf("expected 3 triathlons in the timespan, got %d", summary.Count)
	}
	if summary.Latest.Date != "2026-03-15" || summary.First == nil || summary.First.Date != "2026-03-01" {
		t.Errorf("expected latest 2026-03-15 and first 2026-03-01, got %+v / %+v", summary.Latest, summary.First)
	}
	// Records are all time, shortest class first.
	var records []string
	for _, r := range summary.Records {
		records = append(records, r.Class+" "+r.Date)
	}
	if want := []string{"sprint 2026-03-08", "quarter 2026-02-01"}; !reflect.DeepEqual(records, want) {
		t.Errorf("expected records %v, got %v", want, records)
	}
	wantShare := map[string]float64{"swim": 0.176, "bike": 0.441, "run": 0.382}
	if !reflect.DeepEqual(summary.Share, wantShare) {
		t.Errorf("expected share %v, got %v", wantShare, summary.Share)
	}
	if summary.TypicalShare["run"] != 0.36 {
		t.Errorf("expected the quarter typical run share, got %v", summary.TypicalShare)
	}
	if summary.Weakest != "swim" {
		t.Errorf("expected the swim to be the weakest leg, got %q", summary.Weakest)
	}
}

func TestTriathlonSummary_BalancedHasNoWeakestLeg(t *testing.T) {
	summary := triathlonSummary(triathlons(quarter("2026-03-01", 1200, 5200, 3600)), "")
	if summary.Weakest != "" {
		t.Errorf("expected no weakest leg, got %q (share %v)", summary.Weakest, summary.Share)
	}
	if summary.First != nil {
		t.Errorf("expected no first with a single triathlon, got %+v", summary.First)
	}
}

func TestTriathlonSummary_NoneInTimespan(t *testing.T) {
	if summary := triathlonSummary(triathlons(quarter("2026-03-01", 1800, 4800, 3000)), "2026-03-02"); summary != nil {
		t.Errorf("expected no summary, got %+v", summary)
	}
}

func TestListTriathlons_NewestFirst(t *testing.T) {
	s := newTestStore(t)
	seedCardio(t, s, quarter("2026-03-01", 1800, 4800, 3000)...)
	seedCardio(t, s, quarter("2026-03-08", 1800, 4800, 3000)...)

	tris, err := s.ListTriathlons()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tris) != 2 || tris[0].Date != "2026-03-08" || len(tris[0].Swim.WorkoutIDs) != 1 {
		t.Errorf("expected two triathlons, newest first, got %+v", tris)
	}
}

func TestListTriathlons_EmptyIsNotNil(t *testing.T) {
	s := newTestStore(t)
	tris, err := s.ListTriathlons()
	if err != nil || tris == nil {
		t.Errorf("expected an empty slice, got %v, %v", tris, err)
	}
}

func TestGetInsights_Triathlon(t *testing.T) {
	s := newTestStore(t)
	insights, err := s.GetInsights("2026-03-20", "", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if insights.Triathlon != nil {
		t.Errorf("expected no triathlon summary, got %+v", insights.Triathlon)
	}

	seedCardio(t, s, quarter("2026-03-01", 1800, 4800, 3000)...)
	// Triathlons after the date don't count yet.
	seedCardio(t, s, quarter("2026-03-21", 1, 1, 1)...)
	insights, err = s.GetInsights("2026-03-20", "", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if insights.Triathlon == nil || insights.Triathlon.Count != 1 || insights.Triathlon.Latest.Date != "2026-03-01" {
		t.Errorf("expected the 2026-03-01 triathlon, got %+v", insights.Triathlon)
	}
}
