package store

// SaveBodyweight records the bodyweight for a date, replacing any existing
// entry for that date.
func (s *Store) SaveBodyweight(date string, weight float64) error {
	_, err := s.db.Exec(`
		INSERT INTO bodyweight (date, weight) VALUES (?, ?)
		ON CONFLICT(date) DO UPDATE SET weight = excluded.weight
	`, date, weight)
	return err
}

// ListBodyweight returns every bodyweight entry, oldest first.
func (s *Store) ListBodyweight() ([]BodyweightEntry, error) {
	rows, err := s.db.Query("SELECT date, weight FROM bodyweight ORDER BY date")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []BodyweightEntry{}
	for rows.Next() {
		var e BodyweightEntry
		if err := rows.Scan(&e.Date, &e.Weight); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// DeleteBodyweight removes the bodyweight entry for a date.
func (s *Store) DeleteBodyweight(date string) error {
	_, err := s.db.Exec("DELETE FROM bodyweight WHERE date = ?", date)
	return err
}
