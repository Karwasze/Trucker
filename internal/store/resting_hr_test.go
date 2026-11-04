package store

import "testing"

func TestRestingHeartRates_SaveKeepsOtherDays(t *testing.T) {
	s := newTestStore(t)
	if err := s.SaveRestingHeartRates([]RestingHeartRate{{"2026-03-01", 52}, {"2026-03-02", 54}}); err != nil {
		t.Fatal(err)
	}
	// A later sync covering fewer days updates those and keeps the rest.
	if err := s.SaveRestingHeartRates([]RestingHeartRate{{"2026-03-02", 53}, {"2026-03-03", 51}}); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListRestingHeartRates("", "")
	if err != nil {
		t.Fatal(err)
	}
	want := []RestingHeartRate{{"2026-03-01", 52}, {"2026-03-02", 53}, {"2026-03-03", 51}}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("expected %v, got %v", want, got)
		}
	}
	if got, _ := s.ListRestingHeartRates("2026-03-02", "2026-03-02"); len(got) != 1 || got[0].BPM != 53 {
		t.Errorf("expected only Mar 2, got %v", got)
	}
}
