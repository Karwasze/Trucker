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

// ReplaceBodyweight replaces every bodyweight entry with entries, in one
// transaction. A later entry for the same date replaces an earlier one.
func (s *Store) ReplaceBodyweight(entries []BodyweightEntry) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM bodyweight"); err != nil {
		return err
	}
	for _, e := range entries {
		if _, err := tx.Exec(`
			INSERT INTO bodyweight (date, weight) VALUES (?, ?)
			ON CONFLICT(date) DO UPDATE SET weight = excluded.weight
		`, e.Date, e.Weight); err != nil {
			return err
		}
	}
	return tx.Commit()
}
