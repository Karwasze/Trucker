package store

import "errors"

// ErrDefaultExercise is returned when attempting to modify or delete a
// default (built-in) exercise.
var ErrDefaultExercise = errors.New("cannot modify default exercise")

var defaultExerciseNames = []string{
	"Squat", "Bench Press", "Deadlift", "Overhead Press",
	"Front Squat", "Sumo Deadlift", "Lat Pulldown", "Bent Over Row",
	"Leg Curl", "Leg Extension", "Leg Press", "Tricep Pushdown",
	"Bicep Curl", "Calf Raise", "Lateral Raise", "Chest Fly",
}

// SeedDefaultExercises ensures the built-in exercises exist in the exercise
// library and are marked as default. It is safe to call repeatedly.
func (s *Store) SeedDefaultExercises() error {
	for _, name := range defaultExerciseNames {
		if _, err := s.db.Exec("INSERT OR IGNORE INTO exercise_library (name, is_default) VALUES (?, 1)", name); err != nil {
			return err
		}
		if _, err := s.db.Exec("UPDATE exercise_library SET is_default = 1 WHERE name = ?", name); err != nil {
			return err
		}
	}
	return nil
}

// GetAllExercises returns every exercise in the library, ordered by name.
func (s *Store) GetAllExercises() ([]ExerciseDB, error) {
	var exercises []ExerciseDB

	rows, err := s.db.Query("SELECT id, name, is_default FROM exercise_library ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var exercise ExerciseDB
		if err := rows.Scan(&exercise.ID, &exercise.Name, &exercise.IsDefault); err != nil {
			return nil, err
		}
		exercises = append(exercises, exercise)
	}

	return exercises, nil
}

// CreateExercise adds a new custom exercise to the library.
func (s *Store) CreateExercise(name string) (ExerciseDB, error) {
	result, err := s.db.Exec("INSERT INTO exercise_library (name, is_default) VALUES (?, 0)", name)
	if err != nil {
		return ExerciseDB{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return ExerciseDB{}, err
	}

	return ExerciseDB{ID: int(id), Name: name}, nil
}

// UpdateExercise renames an exercise and propagates the new name to any
// GZCLP day assignments that referenced it. It returns ErrDefaultExercise if
// the exercise is a default one.
func (s *Store) UpdateExercise(id int, name string) (ExerciseDB, error) {
	var oldName string
	var isDefault bool
	s.db.QueryRow("SELECT name, is_default FROM exercise_library WHERE id = ?", id).Scan(&oldName, &isDefault)

	if isDefault {
		return ExerciseDB{}, ErrDefaultExercise
	}

	if _, err := s.db.Exec("UPDATE exercise_library SET name = ? WHERE id = ?", name, id); err != nil {
		return ExerciseDB{}, err
	}

	if oldName != "" && oldName != name {
		s.db.Exec("UPDATE gzclp_day_exercises SET exercise_name = ? WHERE exercise_name = ?", name, oldName)
	}

	return ExerciseDB{ID: id, Name: name}, nil
}

// DeleteExercise removes a custom exercise from the library. It returns
// ErrDefaultExercise if the exercise is a default one.
func (s *Store) DeleteExercise(id int) error {
	var isDefault bool
	s.db.QueryRow("SELECT is_default FROM exercise_library WHERE id = ?", id).Scan(&isDefault)

	if isDefault {
		return ErrDefaultExercise
	}

	_, err := s.db.Exec("DELETE FROM exercise_library WHERE id = ?", id)
	return err
}
