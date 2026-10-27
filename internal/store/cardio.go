package store

import (
	"cmp"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
)

var (
	ErrCardioWorkoutNotFound = errors.New("cardio workout not found")
	// ErrDistanceMeasured is returned for setting the distance of a workout
	// whose distance Health measured.
	ErrDistanceMeasured = errors.New("distance was measured")
)

// ValidCardioActivity reports whether activity is one of CardioActivities.
func ValidCardioActivity(activity string) bool {
	return slices.Contains(CardioActivities, activity)
}

// SaveCardioWorkouts saves workouts in one transaction and returns the ones
// it saved, with their IDs. Workouts whose SourceUUID was already imported
// are skipped. A workout with a PlannedSessionID fills that session, in
// place of any workout that filled it before.
func (s *Store) SaveCardioWorkouts(workouts []CardioWorkout) ([]CardioWorkout, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	saved := []CardioWorkout{}
	for _, w := range workouts {
		samples, err := jsonColumn(w.Samples)
		if err != nil {
			return nil, err
		}
		laps, err := jsonColumn(w.Laps)
		if err != nil {
			return nil, err
		}
		result, err := tx.Exec(`
			INSERT INTO cardio_workouts (date, started_at, activity, duration_seconds,
				distance_m, energy_kcal, avg_heart_rate, max_heart_rate, swim_strokes,
				lap_length_m, samples, laps, source, source_uuid)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(source_uuid) DO NOTHING
		`, w.Date, w.StartedAt, w.Activity, w.DurationSeconds,
			w.DistanceM, w.EnergyKcal, w.AvgHeartRate, w.MaxHeartRate, w.SwimStrokes,
			w.LapLengthM, samples, laps, w.Source, w.SourceUUID)
		if err != nil {
			return nil, err
		}
		if n, err := result.RowsAffected(); err != nil {
			return nil, err
		} else if n == 0 {
			continue
		}
		id, err := result.LastInsertId()
		if err != nil {
			return nil, err
		}
		w.ID = int(id)
		if w.PlannedSessionID != nil {
			result, err := tx.Exec("UPDATE planned_sessions SET cardio_workout_id = ? WHERE id = ?", w.ID, *w.PlannedSessionID)
			if err != nil {
				return nil, err
			}
			if n, err := result.RowsAffected(); err != nil {
				return nil, err
			} else if n == 0 {
				return nil, ErrSessionNotFound
			}
		}
		saved = append(saved, w)
	}
	return saved, tx.Commit()
}

const cardioColumns = `id, date, started_at, activity, duration_seconds, distance_m,
	energy_kcal, avg_heart_rate, max_heart_rate, swim_strokes, lap_length_m,
	COALESCE(source, ''), source_uuid, manual_distance`

// ListCardioWorkouts returns the cardio workouts of an activity, or of every
// activity for "", newest first, without their samples and laps.
func (s *Store) ListCardioWorkouts(activity string) ([]CardioWorkout, error) {
	rows, err := s.db.Query(`SELECT `+cardioColumns+` FROM cardio_workouts
		WHERE ? = '' OR activity = ?
		ORDER BY started_at DESC, id DESC`, activity, activity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workouts := []CardioWorkout{}
	for rows.Next() {
		w, err := scanCardioWorkout(rows)
		if err != nil {
			return nil, err
		}
		workouts = append(workouts, w)
	}
	return workouts, rows.Err()
}

// GetCardioWorkout returns a cardio workout with its samples and laps, or
// ErrCardioWorkoutNotFound.
func (s *Store) GetCardioWorkout(id int) (CardioWorkout, error) {
	return getCardioWorkout(s.db, id)
}

func getCardioWorkout(q querier, id int) (CardioWorkout, error) {
	var samples, laps sql.NullString
	row := q.QueryRow(`SELECT `+cardioColumns+`, samples, laps FROM cardio_workouts WHERE id = ?`, id)
	w, err := scanCardioWorkout(row, &samples, &laps)
	if errors.Is(err, sql.ErrNoRows) {
		return CardioWorkout{}, ErrCardioWorkoutNotFound
	}
	if err != nil {
		return CardioWorkout{}, err
	}
	if samples.Valid {
		if err := json.Unmarshal([]byte(samples.String), &w.Samples); err != nil {
			return CardioWorkout{}, err
		}
	}
	if laps.Valid {
		if err := json.Unmarshal([]byte(laps.String), &w.Laps); err != nil {
			return CardioWorkout{}, err
		}
		w.Laps = kilometreLaps(w.Laps)
	}
	return w, nil
}

// lapOverlapS is how far a lap may start before the previous one ends and
// still follow it, as lap times are rounded.
const lapOverlapS = 0.5

// kilometreLaps returns the laps of the series with the most laps, in
// order. The watch splits runs every kilometre and every mile, marking
// both as overlapping series of segments; the kilometre series always has
// more of them. Laps marked by hand don't overlap, so they're kept as is.
func kilometreLaps(laps []CardioLap) []CardioLap {
	sorted := slices.Clone(laps)
	slices.SortStableFunc(sorted, func(a, b CardioLap) int { return cmp.Compare(a.T, b.T) })
	var series [][]CardioLap
	for _, lap := range sorted {
		// The series that ended last before the lap starts takes it.
		best := -1
		for i, s := range series {
			end := lastEnd(s)
			if end <= lap.T+lapOverlapS && (best < 0 || end > lastEnd(series[best])) {
				best = i
			}
		}
		if best < 0 {
			series = append(series, []CardioLap{lap})
		} else {
			series[best] = append(series[best], lap)
		}
	}
	if len(series) <= 1 {
		return laps
	}
	longest := series[0]
	for _, s := range series[1:] {
		if len(s) > len(longest) {
			longest = s
		}
	}
	return longest
}

func lastEnd(laps []CardioLap) float64 {
	last := laps[len(laps)-1]
	return last.T + last.Duration
}

// SetCardioDistance sets the distance (metres) of a cardio workout Health
// had none for, or whose distance was entered by hand before, returning the
// updated workout. It returns ErrDistanceMeasured for a distance Health
// measured and ErrCardioWorkoutNotFound for an unknown id.
func (s *Store) SetCardioDistance(id int, metres float64) (CardioWorkout, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return CardioWorkout{}, err
	}
	defer tx.Rollback()
	w, err := getCardioWorkout(tx, id)
	if err != nil {
		return CardioWorkout{}, err
	}
	if w.DistanceM != nil && !w.ManualDistance {
		return CardioWorkout{}, ErrDistanceMeasured
	}
	if _, err := tx.Exec("UPDATE cardio_workouts SET distance_m = ?, manual_distance = 1 WHERE id = ?", metres, id); err != nil {
		return CardioWorkout{}, err
	}
	w.DistanceM, w.ManualDistance = &metres, true
	return w, tx.Commit()
}

// DeleteCardioWorkout deletes a cardio workout, reporting whether it
// existed. The planned session it filled is empty again.
func (s *Store) DeleteCardioWorkout(id int) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE planned_sessions SET cardio_workout_id = NULL WHERE cardio_workout_id = ?", id); err != nil {
		return false, err
	}
	result, err := tx.Exec("DELETE FROM cardio_workouts WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, tx.Commit()
}

// cardioBetween returns the cardio workouts after start and up to end (both
// YYYY-MM-DD), oldest first, without their samples and laps.
func (s *Store) cardioBetween(start, end string) ([]CardioWorkout, error) {
	return cardioBetween(s.db, start, end)
}

func cardioBetween(q querier, start, end string) ([]CardioWorkout, error) {
	rows, err := q.Query(`SELECT `+cardioColumns+` FROM cardio_workouts
		WHERE date > ? AND date <= ?
		ORDER BY started_at, id`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workouts []CardioWorkout
	for rows.Next() {
		w, err := scanCardioWorkout(rows)
		if err != nil {
			return nil, err
		}
		workouts = append(workouts, w)
	}
	return workouts, rows.Err()
}

func scanCardioWorkout(row interface{ Scan(...any) error }, extra ...any) (CardioWorkout, error) {
	var w CardioWorkout
	dest := append([]any{&w.ID, &w.Date, &w.StartedAt, &w.Activity, &w.DurationSeconds,
		&w.DistanceM, &w.EnergyKcal, &w.AvgHeartRate, &w.MaxHeartRate, &w.SwimStrokes,
		&w.LapLengthM, &w.Source, &w.SourceUUID, &w.ManualDistance}, extra...)
	err := row.Scan(dest...)
	return w, err
}

// jsonColumn encodes v for a JSON column, or NULL when it is empty.
func jsonColumn[T any](v []T) (any, error) {
	if len(v) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(v)
	return string(b), err
}
