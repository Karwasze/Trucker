package store

import "testing"

func TestSaveBodyweight_ReplacesSameDate(t *testing.T) {
	s := newTestStore(t)

	if err := s.SaveBodyweight("2026-03-10", 82); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.SaveBodyweight("2026-03-10", 81.5); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries, err := s.ListBodyweight()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Weight != 81.5 {
		t.Errorf("expected 81.5, got %v", entries[0].Weight)
	}
}

func TestListBodyweight_OrderedByDate(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-15", 81)
	s.SaveBodyweight("2026-03-01", 83)
	s.SaveBodyweight("2026-03-10", 82)

	entries, err := s.ListBodyweight()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{"2026-03-01", "2026-03-10", "2026-03-15"}
	if len(entries) != len(want) {
		t.Fatalf("expected %d entries, got %d", len(want), len(entries))
	}
	for i, date := range want {
		if entries[i].Date != date {
			t.Errorf("entry %d: expected %s, got %s", i, date, entries[i].Date)
		}
	}
}

func TestListBodyweight_EmptyIsNotNil(t *testing.T) {
	s := newTestStore(t)

	entries, err := s.ListBodyweight()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries == nil {
		t.Error("expected empty slice, got nil")
	}
}

func TestDeleteBodyweight(t *testing.T) {
	s := newTestStore(t)

	s.SaveBodyweight("2026-03-10", 82)
	s.SaveBodyweight("2026-03-11", 81)
	if err := s.DeleteBodyweight("2026-03-10"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries, _ := s.ListBodyweight()
	if len(entries) != 1 || entries[0].Date != "2026-03-11" {
		t.Errorf("expected only 2026-03-11 to remain, got %+v", entries)
	}
}
