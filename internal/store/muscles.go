package store

import (
	"errors"
	"fmt"
	"slices"
)

// Muscles lists the muscle groups exercises can be tagged with, in display
// order.
var Muscles = []string{
	"chest", "back", "shoulders", "biceps", "triceps",
	"quads", "hamstrings", "glutes", "calves", "core",
}

// Roles an exercise can give a muscle. A set counts fully towards its
// primary muscles and half towards its secondary ones.
const (
	RolePrimary   = "primary"
	RoleSecondary = "secondary"
)

// ErrInvalidMuscle is returned when muscle tags name an unknown muscle or
// role, or tag the same muscle twice.
var ErrInvalidMuscle = errors.New("invalid muscle tags")

// GetExerciseMuscles returns the muscle tags of every tagged exercise, keyed
// by exercise name and ordered as in Muscles.
func (s *Store) GetExerciseMuscles() (map[string][]MuscleTarget, error) {
	rows, err := s.db.Query("SELECT exercise_name, muscle, role FROM exercise_muscles")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	muscles := make(map[string][]MuscleTarget)
	for rows.Next() {
		var name string
		var m MuscleTarget
		if err := rows.Scan(&name, &m.Muscle, &m.Role); err != nil {
			return nil, err
		}
		muscles[name] = append(muscles[name], m)
	}
	for _, tags := range muscles {
		slices.SortFunc(tags, func(a, b MuscleTarget) int {
			return slices.Index(Muscles, a.Muscle) - slices.Index(Muscles, b.Muscle)
		})
	}
	return muscles, rows.Err()
}

// SetExerciseMuscles replaces the muscle tags of the named exercise. An empty
// list removes all of its tags.
func (s *Store) SetExerciseMuscles(name string, muscles []MuscleTarget) error {
	seen := make(map[string]bool)
	for _, m := range muscles {
		if !slices.Contains(Muscles, m.Muscle) || (m.Role != RolePrimary && m.Role != RoleSecondary) || seen[m.Muscle] {
			return fmt.Errorf("%w: %s %s", ErrInvalidMuscle, m.Muscle, m.Role)
		}
		seen[m.Muscle] = true
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM exercise_muscles WHERE exercise_name = ?", name); err != nil {
		return err
	}
	for _, m := range muscles {
		if _, err := tx.Exec("INSERT INTO exercise_muscles (exercise_name, muscle, role) VALUES (?, ?, ?)", name, m.Muscle, m.Role); err != nil {
			return err
		}
	}
	return tx.Commit()
}
