package store

import (
	"reflect"
	"testing"
)

func TestComputeHeartRateZones(t *testing.T) {
	// A reserve of 130 bpm over a resting 55, split at 60, 70, 80 and 90%.
	got := computeHeartRateZones(185, 55)
	want := []HeartRateZone{
		{Zone: 1, Max: ip(132)},
		{Zone: 2, Min: ip(133), Max: ip(145)},
		{Zone: 3, Min: ip(146), Max: ip(158)},
		{Zone: 4, Min: ip(159), Max: ip(171)},
		{Zone: 5, Min: ip(172)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestHeartRateZones_ByDate(t *testing.T) {
	s := newTestStore(t)
	if z, err := s.HeartRateZones("2026-10-20"); err != nil || z != nil {
		t.Fatalf("expected no zones before any are set, got %+v, %v", z, err)
	}

	if _, err := s.SetHeartRateProfile("2026-10-10", 185, 55); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetHeartRateProfile("2026-10-20", 185, 50); err != nil {
		t.Fatal(err)
	}

	for date, resting := range map[string]float64{
		// Sessions before the first profile go by it, as the best there is.
		"2026-10-01": 55,
		"2026-10-15": 55,
		"2026-10-20": 50,
		"2026-11-01": 50,
	} {
		z, err := s.HeartRateZones(date)
		if err != nil {
			t.Fatal(err)
		}
		if z == nil || z.RestingHR != resting {
			t.Errorf("%s: got %+v, want resting %v", date, z, resting)
		}
	}
}

func TestSetHeartRateProfile_OnlyRecordsChanges(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.SetHeartRateProfile("2026-10-10", 185, 55); err != nil {
		t.Fatal(err)
	}
	// The same profile on a later day adds no new one.
	z, err := s.SetHeartRateProfile("2026-10-12", 185, 55)
	if err != nil {
		t.Fatal(err)
	}
	if z.Date != "2026-10-10" {
		t.Errorf("expected the profile from 2026-10-10 to stand, got %+v", z)
	}
	// A change on the same day replaces that day's.
	if _, err := s.SetHeartRateProfile("2026-10-14", 185, 52); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetHeartRateProfile("2026-10-14", 185, 53); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM heart_rate_profiles").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("expected 2 profiles, got %d", n)
	}
	z, err = s.HeartRateZones("2026-10-14")
	if err != nil {
		t.Fatal(err)
	}
	if z.RestingHR != 53 || len(z.Zones) != 5 {
		t.Errorf("got %+v", z)
	}
}
