package store

// RestingHeartRate is the resting heart rate (bpm) recorded on Date.
type RestingHeartRate struct {
	Date string  `json:"date"`
	BPM  float64 `json:"bpm"`
}

// SaveRestingHeartRates records each day's resting heart rate, replacing
// any recorded for the same day and keeping the other days.
func (s *Store) SaveRestingHeartRates(readings []RestingHeartRate) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, r := range readings {
		if _, err := tx.Exec(`
			INSERT INTO resting_heart_rates (date, bpm) VALUES (?, ?)
			ON CONFLICT(date) DO UPDATE SET bpm = excluded.bpm
		`, r.Date, r.BPM); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListRestingHeartRates returns the readings from from to to (YYYY-MM-DD,
// inclusive; either "" for no limit), oldest first.
func (s *Store) ListRestingHeartRates(from, to string) ([]RestingHeartRate, error) {
	if to == "" {
		to = "9999-12-31"
	}
	rows, err := s.db.Query(`SELECT date, bpm FROM resting_heart_rates
		WHERE date >= ? AND date <= ? ORDER BY date`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	readings := []RestingHeartRate{}
	for rows.Next() {
		var r RestingHeartRate
		if err := rows.Scan(&r.Date, &r.BPM); err != nil {
			return nil, err
		}
		readings = append(readings, r)
	}
	return readings, rows.Err()
}
