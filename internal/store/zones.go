package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"slices"
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

// HeartRateZones are the zones in effect from Date (YYYY-MM-DD): as Apple
// Watch has them in Health, where ZoneStarts gives where zones 2 and up
// start (bpm), else worked out from MaxHR and RestingHR, which are 0 then.
type HeartRateZones struct {
	Date       string          `json:"date"`
	MaxHR      float64         `json:"max_hr,omitempty"`
	RestingHR  float64         `json:"resting_hr,omitempty"`
	ZoneStarts []float64       `json:"zone_starts,omitempty"`
	Zones      []HeartRateZone `json:"zones"`
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

// watchHeartRateZones are the zones Apple Watch has, from where zones 2
// and up start (bpm, ascending). A heart rate counts in a zone from its
// start, so a fractional start, e.g. 136.8, begins at the next whole bpm.
func watchHeartRateZones(starts []float64) []HeartRateZone {
	zones := make([]HeartRateZone, len(starts)+1)
	for i := range zones {
		zones[i].Zone = i + 1
		if i > 0 {
			zones[i].Min = ip(int(math.Ceil(starts[i-1])))
		}
		if i < len(starts) {
			zones[i].Max = ip(int(math.Ceil(starts[i])) - 1)
		}
	}
	return zones
}

func ip(v int) *int { return &v }

// SetHeartRateProfile records the max and resting heart rate as of date
// and returns the zones in effect then. A profile the same as the one in
// effect adds nothing, and one on a date with a profile replaces it.
func (s *Store) SetHeartRateProfile(date string, maxHR, restingHR float64) (*HeartRateZones, error) {
	return s.setHeartRateZones(date, HeartRateZones{MaxHR: maxHR, RestingHR: restingHR})
}

// SetHeartRateZones records the zones Apple Watch has as of date, from
// where zones 2 and up start (bpm, ascending), and returns the zones in
// effect then, like SetHeartRateProfile.
func (s *Store) SetHeartRateZones(date string, starts []float64) (*HeartRateZones, error) {
	return s.setHeartRateZones(date, HeartRateZones{ZoneStarts: starts})
}

func (s *Store) setHeartRateZones(date string, z HeartRateZones) (*HeartRateZones, error) {
	current, err := heartRateZones(s.db, date)
	if err != nil {
		return nil, err
	}
	if current != nil && current.MaxHR == z.MaxHR && current.RestingHR == z.RestingHR &&
		slices.Equal(current.ZoneStarts, z.ZoneStarts) {
		return current, nil
	}
	var maxHR, restingHR, starts any
	if z.ZoneStarts != nil {
		encoded, err := json.Marshal(z.ZoneStarts)
		if err != nil {
			return nil, err
		}
		starts = string(encoded)
	} else {
		maxHR, restingHR = z.MaxHR, z.RestingHR
	}
	if _, err := s.db.Exec(`
		INSERT INTO heart_rate_profiles (date, max_hr, resting_hr, zone_starts) VALUES (?, ?, ?, ?)
		ON CONFLICT(date) DO UPDATE SET max_hr = excluded.max_hr, resting_hr = excluded.resting_hr,
			zone_starts = excluded.zone_starts
	`, date, maxHR, restingHR, starts); err != nil {
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
	var maxHR, restingHR sql.NullFloat64
	var starts sql.NullString
	err := q.QueryRow(`
		SELECT date, max_hr, resting_hr, zone_starts FROM heart_rate_profiles
		ORDER BY date <= ? DESC, CASE WHEN date <= ? THEN date END DESC, date
		LIMIT 1
	`, date, date).Scan(&z.Date, &maxHR, &restingHR, &starts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := fillZones(&z, maxHR, restingHR, starts); err != nil {
		return nil, err
	}
	return &z, nil
}

// fillZones works out z's zones from a profile's columns: the watch's zone
// starts when it has them, else its max and resting heart rate.
func fillZones(z *HeartRateZones, maxHR, restingHR sql.NullFloat64, starts sql.NullString) error {
	if starts.Valid {
		if err := json.Unmarshal([]byte(starts.String), &z.ZoneStarts); err != nil {
			return err
		}
		z.Zones = watchHeartRateZones(z.ZoneStarts)
		return nil
	}
	z.MaxHR, z.RestingHR = maxHR.Float64, restingHR.Float64
	z.Zones = computeHeartRateZones(z.MaxHR, z.RestingHR)
	return nil
}

// allHeartRateZones returns the zones of every profile, oldest first.
func (s *Store) allHeartRateZones() ([]HeartRateZones, error) {
	rows, err := s.db.Query(`SELECT date, max_hr, resting_hr, zone_starts FROM heart_rate_profiles ORDER BY date`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var all []HeartRateZones
	for rows.Next() {
		var z HeartRateZones
		var maxHR, restingHR sql.NullFloat64
		var starts sql.NullString
		if err := rows.Scan(&z.Date, &maxHR, &restingHR, &starts); err != nil {
			return nil, err
		}
		if err := fillZones(&z, maxHR, restingHR, starts); err != nil {
			return nil, err
		}
		all = append(all, z)
	}
	return all, rows.Err()
}

// zonesOn picks the zones in effect on date from all (oldest first), as
// HeartRateZones does: the latest on or before it, else the earliest.
func zonesOn(all []HeartRateZones, date string) *HeartRateZones {
	if len(all) == 0 {
		return nil
	}
	pick := &all[0]
	for i := range all {
		if all[i].Date <= date {
			pick = &all[i]
		}
	}
	return pick
}

// zoneOf is the zone (1 to 5) a heart rate falls in.
func zoneOf(zones []HeartRateZone, hr float64) int {
	zone := 1
	for _, z := range zones {
		if z.Min != nil && math.Round(hr) >= float64(*z.Min) {
			zone = z.Zone
		}
	}
	return zone
}
