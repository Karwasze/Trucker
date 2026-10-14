package store

import "database/sql"

// SaveWorkout persists a workout along with its exercises and sets, returning
// the new workout's ID.
func (s *Store) SaveWorkout(workout Workout) (int, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	result, err := tx.Exec("INSERT INTO workouts (date, plan_id) VALUES (?, ?)", workout.Date, workout.PlanID)
	if err != nil {
		return 0, err
	}

	workoutID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	if err := insertExercises(tx, workoutID, workout.Exercises); err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(workoutID), nil
}

// UpdateWorkout replaces a workout's date, exercises and sets. The plan it
// was logged against is kept. It returns false if no workout with the given
// ID exists.
func (s *Store) UpdateWorkout(workout Workout) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	result, err := tx.Exec("UPDATE workouts SET date = ? WHERE id = ?", workout.Date, workout.ID)
	if err != nil {
		return false, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if rowsAffected == 0 {
		return false, nil
	}

	if err := deleteExercises(tx, workout.ID); err != nil {
		return false, err
	}
	if err := insertExercises(tx, int64(workout.ID), workout.Exercises); err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func insertExercises(tx *sql.Tx, workoutID int64, exercises []Exercise) error {
	for _, exercise := range exercises {
		exerciseResult, err := tx.Exec("INSERT INTO exercises (workout_id, name) VALUES (?, ?)", workoutID, exercise.Name)
		if err != nil {
			return err
		}

		exerciseID, err := exerciseResult.LastInsertId()
		if err != nil {
			return err
		}

		for _, set := range exercise.Sets {
			if _, err := tx.Exec("INSERT INTO sets (exercise_id, reps, weight) VALUES (?, ?, ?)", exerciseID, set.Reps, set.Weight); err != nil {
				return err
			}
		}
	}
	return nil
}

// deleteExercises removes a workout's exercises and their sets.
func deleteExercises(tx *sql.Tx, workoutID int) error {
	if _, err := tx.Exec(`
		DELETE FROM sets
		WHERE exercise_id IN (
			SELECT id FROM exercises WHERE workout_id = ?
		)
	`, workoutID); err != nil {
		return err
	}

	_, err := tx.Exec("DELETE FROM exercises WHERE workout_id = ?", workoutID)
	return err
}

// GetWorkouts returns all workouts with their exercises and sets, newest
// first. Workouts on the same date are ordered by most recently logged.
func (s *Store) GetWorkouts() ([]Workout, error) {
	rows, err := s.db.Query(`
		SELECT w.id, w.date, w.plan_id, e.id, e.name, s.reps, s.weight
		FROM workouts w
		LEFT JOIN exercises e ON w.id = e.workout_id
		LEFT JOIN sets s ON e.id = s.exercise_id
		ORDER BY w.date DESC, w.id DESC, e.id, s.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Rows arrive grouped by workout and then by exercise, so appending as
	// IDs change preserves the query's ordering.
	var workouts []Workout
	lastWorkoutID, lastExerciseID := -1, int64(-1)

	for rows.Next() {
		// Exercise and set columns are NULL for workouts without exercises
		// and exercises without sets, because of the LEFT JOINs.
		var workoutID int
		var date string
		var planID, exerciseID, reps sql.NullInt64
		var exerciseName sql.NullString
		var weight sql.NullFloat64

		if err := rows.Scan(&workoutID, &date, &planID, &exerciseID, &exerciseName, &reps, &weight); err != nil {
			return nil, err
		}

		if workoutID != lastWorkoutID {
			workout := Workout{
				ID:        workoutID,
				Date:      date,
				Exercises: []Exercise{},
			}
			if planID.Valid {
				id := int(planID.Int64)
				workout.PlanID = &id
			}
			workouts = append(workouts, workout)
			lastWorkoutID = workoutID
		}
		workout := &workouts[len(workouts)-1]

		if !exerciseID.Valid {
			continue
		}

		if exerciseID.Int64 != lastExerciseID {
			workout.Exercises = append(workout.Exercises, Exercise{
				Name: exerciseName.String,
				Sets: []Set{},
			})
			lastExerciseID = exerciseID.Int64
		}

		if !reps.Valid {
			continue
		}

		exercise := &workout.Exercises[len(workout.Exercises)-1]
		exercise.Sets = append(exercise.Sets, Set{
			Reps:   int(reps.Int64),
			Weight: weight.Float64,
		})
	}

	return workouts, rows.Err()
}

// DeleteWorkout removes a workout and all of its exercises and sets. It
// returns false if no workout with the given ID exists.
func (s *Store) DeleteWorkout(id int) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if err := deleteExercises(tx, id); err != nil {
		return false, err
	}

	result, err := tx.Exec("DELETE FROM workouts WHERE id = ?", id)
	if err != nil {
		return false, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}

	if rowsAffected == 0 {
		return false, nil
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return true, nil
}

// GetLatestExerciseSets returns the sets recorded for the given exercise in
// its most recently dated workout.
func (s *Store) GetLatestExerciseSets(exerciseName string) ([]Set, error) {
	rows, err := s.db.Query(`
		SELECT s.reps, s.weight
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE e.name = ? AND w.id = (
			SELECT w2.id
			FROM workouts w2
			JOIN exercises e2 ON w2.id = e2.workout_id
			WHERE e2.name = ?
			ORDER BY w2.date DESC
			LIMIT 1
		)
		ORDER BY s.id
	`, exerciseName, exerciseName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sets []Set
	for rows.Next() {
		var set Set
		if err := rows.Scan(&set.Reps, &set.Weight); err != nil {
			return nil, err
		}
		sets = append(sets, set)
	}

	return sets, nil
}
