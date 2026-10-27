package store

import (
	"database/sql"
	"errors"
	"math"
)

// zoneStarts is where zones 2 to 5 start, as shares of the heart rate
// reserve (max less resting) above resting, as Apple Watch works out its
// zones.
var zoneStarts = []float64{0.6, 0.7, 0.8, 0.9}

// HeartRateZone is a heart rate zone, 1 to 5 as the watch numbers them, in
// whole bpm. Zone 1 has no Min and zone 5 no Max.
type HeartRateZone struct {
	Zone int  `json:"zone"`
	Min  *int `json:"min,omitempty"`
	Max  *int `json:"max,omitempty"`
}

// HeartRateZones are the zones worked out from the max and resting heart
// rate in effect from Date (YYYY-MM-DD).
type HeartRateZones struct {
	Date      string          `json:"date"`
	MaxHR     float64         `json:"max_hr"`
	RestingHR float64         `json:"resting_hr"`
	Zones     []HeartRateZone `json:"zones"`
}

// computeHeartRateZones splits the heart rate reserve into five zones.
func computeHeartRateZones(maxHR, restingHR float64) []HeartRateZone {
	zones := make([]HeartRateZone, len(zoneStarts)+1)
	for i := range zones {
		zones[i].Zone = i + 1
		if i > 0 {
			zones[i].Min = ip(int(math.Round(restingHR + zoneStarts[i-1]*(maxHR-restingHR))))
		}
		if i < len(zoneStarts) {
			zones[i].Max = ip(int(math.Round(restingHR+zoneStarts[i]*(maxHR-restingHR))) - 1)
		}
	}
	return zones
}

func ip(v int) *int { return &v }

// SetHeartRateProfile records the max and resting heart rate as of date
// and returns the zones in effect then. A profile the same as the one in
// effect adds nothing, and one on a date with a profile replaces it.
func (s *Store) SetHeartRateProfile(date string, maxHR, restingHR float64) (*HeartRateZones, error) {
	current, err := heartRateZones(s.db, date)
	if err != nil {
		return nil, err
	}
	if current != nil && current.MaxHR == maxHR && current.RestingHR == restingHR {
		return current, nil
	}
	if _, err := s.db.Exec(`
		INSERT INTO heart_rate_profiles (date, max_hr, resting_hr) VALUES (?, ?, ?)
		ON CONFLICT(date) DO UPDATE SET max_hr = excluded.max_hr, resting_hr = excluded.resting_hr
	`, date, maxHR, restingHR); err != nil {
		return nil, err
	}
	return heartRateZones(s.db, date)
}

// HeartRateZones returns the zones in effect on date (YYYY-MM-DD): from the
// latest profile on or before it, else the earliest one, or nil without
// any.
func (s *Store) HeartRateZones(date string) (*HeartRateZones, error) {
	return heartRateZones(s.db, date)
}

func heartRateZones(q querier, date string) (*HeartRateZones, error) {
	var z HeartRateZones
	err := q.QueryRow(`
		SELECT date, max_hr, resting_hr FROM heart_rate_profiles
		ORDER BY date <= ? DESC, CASE WHEN date <= ? THEN date END DESC, date
		LIMIT 1
	`, date, date).Scan(&z.Date, &z.MaxHR, &z.RestingHR)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	z.Zones = computeHeartRateZones(z.MaxHR, z.RestingHR)
	return &z, nil
}
