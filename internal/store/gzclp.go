package store

import "database/sql"

type gzclpDayDefault struct {
	Day          int
	Slot         string
	ExerciseName string
}

var defaultGZCLPDayExercises = []gzclpDayDefault{
	// Day A1
	{Day: 1, Slot: "T1", ExerciseName: "Squat"},
	{Day: 1, Slot: "T2", ExerciseName: "Bench Press"},
	{Day: 1, Slot: "T3", ExerciseName: "Lat Pulldown"},
	{Day: 1, Slot: "Additional1", ExerciseName: "Leg Press"},
	{Day: 1, Slot: "Additional2", ExerciseName: "Chest Fly"},
	// Day B1
	{Day: 2, Slot: "T1", ExerciseName: "Overhead Press"},
	{Day: 2, Slot: "T2", ExerciseName: "Deadlift"},
	{Day: 2, Slot: "T3", ExerciseName: "Bent Over Row"},
	{Day: 2, Slot: "Additional1", ExerciseName: "Lateral Raise"},
	{Day: 2, Slot: "Additional2", ExerciseName: "Leg Curl"},
	// Day A2
	{Day: 3, Slot: "T1", ExerciseName: "Bench Press"},
	{Day: 3, Slot: "T2", ExerciseName: "Squat"},
	{Day: 3, Slot: "T3", ExerciseName: "Lat Pulldown"},
	{Day: 3, Slot: "Additional1", ExerciseName: "Chest Fly"},
	{Day: 3, Slot: "Additional2", ExerciseName: "Leg Press"},
	// Day B2
	{Day: 4, Slot: "T1", ExerciseName: "Deadlift"},
	{Day: 4, Slot: "T2", ExerciseName: "Overhead Press"},
	{Day: 4, Slot: "T3", ExerciseName: "Bent Over Row"},
	{Day: 4, Slot: "Additional1", ExerciseName: "Leg Curl"},
	{Day: 4, Slot: "Additional2", ExerciseName: "Lateral Raise"},
}

// NextGZCLPDay returns the next day in the 4-day GZCLP cycle.
func NextGZCLPDay(day int) int {
	return (day % 4) + 1
}

// SeedDefaultGZCLPDayExercises ensures the default GZCLP day/slot exercise
// assignments exist. It is safe to call repeatedly.
func (s *Store) SeedDefaultGZCLPDayExercises() error {
	for _, d := range defaultGZCLPDayExercises {
		if _, err := s.db.Exec("INSERT OR IGNORE INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (?, ?, ?)",
			d.Day, d.Slot, d.ExerciseName); err != nil {
			return err
		}
	}
	return nil
}

// GetGZCLPCurrentDay returns the current GZCLP workout day from settings,
// initializing the settings row to day 1 if it doesn't exist.
func (s *Store) GetGZCLPCurrentDay() (int, error) {
	var currentDay int
	err := s.db.QueryRow("SELECT current_day FROM gzclp_settings WHERE id = 1").Scan(&currentDay)
	if err != nil {
		if err == sql.ErrNoRows {
			s.db.Exec("INSERT INTO gzclp_settings (id, current_day, skipped_days) VALUES (1, 1, 0)")
			return 1, nil
		}
		return 0, err
	}

	return currentDay, nil
}

// SetGZCLPCurrentDay updates the current GZCLP workout day in settings.
func (s *Store) SetGZCLPCurrentDay(day int) error {
	_, err := s.db.Exec("UPDATE gzclp_settings SET current_day = ? WHERE id = 1", day)
	return err
}

// SkipGZCLPDay advances the current GZCLP workout day and increments the
// skipped-days counter. It returns the day that was skipped and the new
// current day.
func (s *Store) SkipGZCLPDay() (current, next int, err error) {
	current, err = s.GetGZCLPCurrentDay()
	if err != nil {
		return 0, 0, err
	}

	next = NextGZCLPDay(current)

	if _, err := s.db.Exec(`
		UPDATE gzclp_settings
		SET current_day = ?, skipped_days = skipped_days + 1
		WHERE id = 1
	`, next); err != nil {
		return 0, 0, err
	}

	return current, next, nil
}

// GetGZCLPExercises returns the T1, T2, T3, and two additional exercises
// assigned to the given GZCLP workout day, falling back to defaults if no
// assignments are configured.
func (s *Store) GetGZCLPExercises(workoutDay int) (t1, t2, t3, additional1, additional2 string) {
	rows, err := s.db.Query("SELECT slot, exercise_name FROM gzclp_day_exercises WHERE day = ?", workoutDay)
	if err != nil {
		return "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"
	}
	defer rows.Close()

	slotMap := make(map[string]string)
	for rows.Next() {
		var slot, name string
		if err := rows.Scan(&slot, &name); err != nil {
			continue
		}
		slotMap[slot] = name
	}

	if len(slotMap) == 0 {
		return "Squat", "Bench Press", "Lat Pulldown", "Leg Press", "Chest Fly"
	}

	return slotMap["T1"], slotMap["T2"], slotMap["T3"], slotMap["Additional1"], slotMap["Additional2"]
}

// GetGZCLPAllDayExercises returns every configured GZCLP day/slot exercise
// assignment, ordered by day then slot.
func (s *Store) GetGZCLPAllDayExercises() ([]GZCLPDayExercise, error) {
	rows, err := s.db.Query("SELECT day, slot, exercise_name FROM gzclp_day_exercises ORDER BY day, slot")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var assignments []GZCLPDayExercise
	for rows.Next() {
		var a GZCLPDayExercise
		if err := rows.Scan(&a.Day, &a.Slot, &a.ExerciseName); err != nil {
			continue
		}
		assignments = append(assignments, a)
	}
	return assignments, nil
}

// SetGZCLPDayExercises replaces the GZCLP day/slot exercise assignments with
// the given list.
func (s *Store) SetGZCLPDayExercises(assignments []GZCLPDayExercise) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, a := range assignments {
		if _, err := tx.Exec(
			"INSERT OR REPLACE INTO gzclp_day_exercises (day, slot, exercise_name) VALUES (?, ?, ?)",
			a.Day, a.Slot, a.ExerciseName); err != nil {
			return err
		}
	}

	return tx.Commit()
}
