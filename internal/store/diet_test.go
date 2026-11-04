package store

import (
	"fmt"
	"testing"
)

func ptr(v float64) *float64 { return &v }

func TestSaveDietDay_ReplacesSameDate(t *testing.T) {
	s := newTestStore(t)

	if err := s.SaveDietDay(DietDay{Date: "2026-10-12", Adhered: true, ProteinG: ptr(150)}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.SaveDietDay(DietDay{Date: "2026-10-12", Adhered: false}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	days, err := s.ListDietDays("", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(days) != 1 || days[0].Adhered || days[0].ProteinG != nil {
		t.Errorf("expected the second save to replace the first, got %+v", days)
	}
}

func TestListDietDays_WithinRangeOldestFirst(t *testing.T) {
	s := newTestStore(t)
	for _, date := range []string{"2026-10-20", "2026-10-05", "2026-10-12", "2026-10-13"} {
		s.SaveDietDay(DietDay{Date: date, Adhered: true})
	}

	days, err := s.ListDietDays("2026-10-12", "2026-10-18")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(days) != 2 || days[0].Date != "2026-10-12" || days[1].Date != "2026-10-13" {
		t.Errorf("unexpected days %+v", days)
	}

	all, _ := s.ListDietDays("", "")
	if len(all) != 4 || all[0].Date != "2026-10-05" {
		t.Errorf("expected every day oldest first, got %+v", all)
	}
}

func TestListDietDays_EmptyIsNotNil(t *testing.T) {
	s := newTestStore(t)
	days, err := s.ListDietDays("", "")
	if err != nil || days == nil {
		t.Errorf("expected an empty slice, got %v, %v", days, err)
	}
}

func TestDeleteDietDay(t *testing.T) {
	s := newTestStore(t)
	s.SaveDietDay(DietDay{Date: "2026-10-12", Adhered: true})
	s.SaveDietDay(DietDay{Date: "2026-10-13", Adhered: true})

	if err := s.DeleteDietDay("2026-10-12"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	days, _ := s.ListDietDays("", "")
	if len(days) != 1 || days[0].Date != "2026-10-13" {
		t.Errorf("unexpected days %+v", days)
	}
}

func TestDietInsights_Empty(t *testing.T) {
	s := newTestStore(t)

	got, err := s.DietInsights("2026-10-20")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.CurrentStreak != 0 || got.LongestStreak != 0 || got.Recent.Logged != 0 {
		t.Errorf("expected nothing, got %+v", got)
	}
	if got.MostMissed != nil || got.Protein != nil || got.Bodyweight != nil || got.FirstDate != nil {
		t.Errorf("expected no summaries, got %+v", got)
	}
}

func TestDietInsights_Streaks(t *testing.T) {
	s := newTestStore(t)
	// 1–4 Oct kept, 5 Oct missed, 6–8 Oct kept, 9 Oct not logged, 10–12 Oct kept.
	for _, d := range []string{"01", "02", "03", "04", "06", "07", "08", "10", "11", "12"} {
		s.SaveDietDay(DietDay{Date: "2026-10-" + d, Adhered: true})
	}
	s.SaveDietDay(DietDay{Date: "2026-10-05", Adhered: false})

	cases := []struct {
		today   string
		current int
	}{
		// Today counts once logged.
		{"2026-10-12", 3},
		// Today isn't over, so not logging it yet keeps the streak.
		{"2026-10-13", 3},
		// A day gone by without a log ends it.
		{"2026-10-14", 0},
	}
	for _, c := range cases {
		got, err := s.DietInsights(c.today)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.CurrentStreak != c.current {
			t.Errorf("%s: expected a current streak of %d, got %d", c.today, c.current, got.CurrentStreak)
		}
		if got.LongestStreak != 4 {
			t.Errorf("%s: expected a longest streak of 4, got %d", c.today, got.LongestStreak)
		}
	}
}

func TestDietInsights_RecentAdherenceAndMostMissedWeekday(t *testing.T) {
	s := newTestStore(t)
	// Mondays 5, 12 and 19 Oct 2026 missed, a Friday missed, the rest kept.
	missed := map[string]bool{"2026-10-05": true, "2026-10-12": true, "2026-10-19": true, "2026-10-16": true}
	for d := 1; d <= 20; d++ {
		date := "2026-10-" + twoDigits(d)
		s.SaveDietDay(DietDay{Date: date, Adhered: !missed[date]})
	}
	// Outside the last 30 days, so left out.
	s.SaveDietDay(DietDay{Date: "2026-08-01", Adhered: false})

	got, err := s.DietInsights("2026-10-20")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Recent.Days != 30 || got.Recent.Logged != 20 || got.Recent.Adhered != 16 {
		t.Errorf("unexpected recent adherence %+v", got.Recent)
	}
	if got.FirstDate == nil || *got.FirstDate != "2026-08-01" {
		t.Errorf("expected the first day logged to be 2026-08-01, got %v", got.FirstDate)
	}
	if got.MostMissed == nil || got.MostMissed.Weekday != "monday" || got.MostMissed.Missed != 3 || got.MostMissed.Logged != 3 {
		t.Errorf("expected Mondays missed 3 of 3, got %+v", got.MostMissed)
	}
}

func TestDietInsights_NoMostMissedWeekdayForOneMiss(t *testing.T) {
	s := newTestStore(t)
	s.SaveDietDay(DietDay{Date: "2026-10-19", Adhered: false})
	s.SaveDietDay(DietDay{Date: "2026-10-20", Adhered: true})

	got, _ := s.DietInsights("2026-10-20")
	if got.MostMissed != nil {
		t.Errorf("expected no pattern from one miss, got %+v", got.MostMissed)
	}
}

func TestDietInsights_Protein(t *testing.T) {
	s := newTestStore(t)
	s.SaveDietDay(DietDay{Date: "2026-10-18", Adhered: true, ProteinG: ptr(160)})
	s.SaveDietDay(DietDay{Date: "2026-10-19", Adhered: true, ProteinG: ptr(120)})
	s.SaveDietDay(DietDay{Date: "2026-10-20", Adhered: true, ProteinG: ptr(150)})
	// Without protein, and outside the last 14 days: neither counts.
	s.SaveDietDay(DietDay{Date: "2026-10-17", Adhered: true})
	s.SaveDietDay(DietDay{Date: "2026-10-01", Adhered: true, ProteinG: ptr(50)})

	got, err := s.DietInsights("2026-10-20")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	p := got.Protein
	if p == nil {
		t.Fatal("expected a protein summary")
	}
	if p.Days != 3 || p.AverageG != 143.3 {
		t.Errorf("unexpected protein summary %+v", p)
	}
}

func TestDietInsights_Bodyweight(t *testing.T) {
	s := newTestStore(t)
	s.SaveDietDay(DietDay{Date: "2026-10-20", Adhered: true})
	s.SaveBodyweight("2026-09-01", 90) // before the last 30 days
	s.SaveBodyweight("2026-09-25", 84.2)
	s.SaveBodyweight("2026-10-10", 83.6)
	s.SaveBodyweight("2026-10-19", 83.1)

	got, err := s.DietInsights("2026-10-20")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b := got.Bodyweight
	if b == nil || b.From != "2026-09-25" || b.To != "2026-10-19" || b.ChangeKg != -1.1 {
		t.Errorf("unexpected bodyweight change %+v", b)
	}
}

func TestDietInsights_NoBodyweightChangeOverAFewDays(t *testing.T) {
	s := newTestStore(t)
	s.SaveBodyweight("2026-10-17", 84)
	s.SaveBodyweight("2026-10-19", 83)

	got, _ := s.DietInsights("2026-10-20")
	if got.Bodyweight != nil {
		t.Errorf("expected no change from weigh-ins 2 days apart, got %+v", got.Bodyweight)
	}
}

func twoDigits(n int) string { return fmt.Sprintf("%02d", n) }

func TestTargetWeight(t *testing.T) {
	s := newTestStore(t)
	if got, err := s.TargetWeight(); err != nil || got != nil {
		t.Fatalf("expected no target at first, got %v %v", got, err)
	}
	target := 78.5
	if err := s.SetTargetWeight(&target); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.TargetWeight(); got == nil || *got != 78.5 {
		t.Errorf("expected 78.5 kg, got %v", got)
	}
	if err := s.SetTargetWeight(nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.TargetWeight(); got != nil {
		t.Errorf("expected the target cleared, got %v", *got)
	}
}

func TestTargetWeight_KeepsProteinTargetRow(t *testing.T) {
	s := newTestStore(t)
	// A database from before the protein target was dropped keeps its row.
	if _, err := s.db.Exec("INSERT INTO diet_settings (id, protein_target_g) VALUES (1, 160)"); err != nil {
		t.Fatal(err)
	}
	target := 80.0
	if err := s.SetTargetWeight(&target); err != nil {
		t.Fatal(err)
	}
	var protein float64
	s.db.QueryRow("SELECT protein_target_g FROM diet_settings WHERE id = 1").Scan(&protein)
	if got, _ := s.TargetWeight(); got == nil || *got != 80 || protein != 160 {
		t.Errorf("expected 80 kg alongside the old protein target, got %v and %v", got, protein)
	}
}
