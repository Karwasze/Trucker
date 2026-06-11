package store

// SaveWorkout persists a workout along with its exercises and sets.
func (s *Store) SaveWorkout(workout Workout) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Exec("INSERT INTO workouts (date, workout_type, workout_day) VALUES (?, ?, ?)",
		workout.Date, workout.WorkoutType, workout.WorkoutDay)
	if err != nil {
		return err
	}

	workoutID, err := result.LastInsertId()
	if err != nil {
		return err
	}

	for _, exercise := range workout.Exercises {
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

	return tx.Commit()
}

// GetWorkouts returns all workouts with their exercises and sets, ordered by
// date descending.
func (s *Store) GetWorkouts() ([]Workout, error) {
	rows, err := s.db.Query(`
		SELECT w.id, w.date, w.workout_type, w.workout_day, e.id, e.name, s.reps, s.weight
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
		var workoutID, exerciseID, workoutDay int
		var date, exerciseName, workoutType string
		var reps int
		var weight float64

		if err := rows.Scan(&workoutID, &date, &workoutType, &workoutDay, &exerciseID, &exerciseName, &reps, &weight); err != nil {
			return nil, err
		}

		if _, exists := workoutMap[workoutID]; !exists {
			workoutMap[workoutID] = &Workout{
				ID:          workoutID,
				Date:        date,
				WorkoutType: workoutType,
				WorkoutDay:  workoutDay,
				Exercises:   []Exercise{},
			}
		}

		if _, exists := exerciseMap[exerciseID]; !exists {
			exercise := Exercise{
				Name: exerciseName,
				Sets: []Set{},
			}
			exerciseMap[exerciseID] = &exercise
			workoutMap[workoutID].Exercises = append(workoutMap[workoutID].Exercises, exercise)
		}

		set := Set{
			Reps:   reps,
			Weight: weight,
		}
		for i := range workoutMap[workoutID].Exercises {
			if workoutMap[workoutID].Exercises[i].Name == exerciseName {
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
