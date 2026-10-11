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

	for _, exercise := range workout.Exercises {
		exerciseResult, err := tx.Exec("INSERT INTO exercises (workout_id, name) VALUES (?, ?)", workoutID, exercise.Name)
		if err != nil {
			return 0, err
		}

		exerciseID, err := exerciseResult.LastInsertId()
		if err != nil {
			return 0, err
		}

		for _, set := range exercise.Sets {
			if _, err := tx.Exec("INSERT INTO sets (exercise_id, reps, weight) VALUES (?, ?, ?)", exerciseID, set.Reps, set.Weight); err != nil {
				return 0, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(workoutID), nil
}

// GetWorkouts returns all workouts with their exercises and sets, ordered by
// date descending.
func (s *Store) GetWorkouts() ([]Workout, error) {
	rows, err := s.db.Query(`
		SELECT w.id, w.date, w.plan_id, e.id, e.name, s.reps, s.weight
		FROM workouts w
		LEFT JOIN exercises e ON w.id = e.workout_id
		LEFT JOIN sets s ON e.id = s.exercise_id
		ORDER BY w.date DESC, e.id, s.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workoutMap := make(map[int]*Workout)
	exerciseMap := make(map[int]*Exercise)

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

		if _, exists := workoutMap[workoutID]; !exists {
			workoutMap[workoutID] = &Workout{
				ID:        workoutID,
				Date:      date,
				Exercises: []Exercise{},
			}
			if planID.Valid {
				id := int(planID.Int64)
				workoutMap[workoutID].PlanID = &id
			}
		}

		if !exerciseID.Valid {
			continue
		}

		if _, exists := exerciseMap[int(exerciseID.Int64)]; !exists {
			exercise := Exercise{
				Name: exerciseName.String,
				Sets: []Set{},
			}
			exerciseMap[int(exerciseID.Int64)] = &exercise
			workoutMap[workoutID].Exercises = append(workoutMap[workoutID].Exercises, exercise)
		}

		if !reps.Valid {
			continue
		}

		set := Set{
			Reps:   int(reps.Int64),
			Weight: weight.Float64,
		}
		for i := range workoutMap[workoutID].Exercises {
			if workoutMap[workoutID].Exercises[i].Name == exerciseName.String {
				workoutMap[workoutID].Exercises[i].Sets = append(workoutMap[workoutID].Exercises[i].Sets, set)
				break
			}
		}
	}

	var workouts []Workout
	for _, workout := range workoutMap {
		workouts = append(workouts, *workout)
	}

	return workouts, nil
}

// DeleteWorkout removes a workout and all of its exercises and sets. It
// returns false if no workout with the given ID exists.
func (s *Store) DeleteWorkout(id int) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		DELETE FROM sets
		WHERE exercise_id IN (
			SELECT id FROM exercises WHERE workout_id = ?
		)
	`, id); err != nil {
		return false, err
	}

	if _, err := tx.Exec("DELETE FROM exercises WHERE workout_id = ?", id); err != nil {
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
