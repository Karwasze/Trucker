package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mattn/go-sqlite3"
)

// ErrPlanNotFound is returned when no training plan exists with a given ID.
var ErrPlanNotFound = errors.New("training plan not found")

// ErrDuplicatePlanName is returned when a plan name is already taken.
var ErrDuplicatePlanName = errors.New("training plan name already exists")

// ErrInvalidWeekday is returned when a plan day names an unknown weekday.
var ErrInvalidWeekday = errors.New("invalid weekday")

// weekdayNames lists weekdays in the order they are stored: index 0 is
// stored as 1 (Monday), index 6 as 7 (Sunday).
var weekdayNames = []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

// IsWeekday reports whether name is a valid lowercase weekday name.
func IsWeekday(name string) bool {
	_, err := weekdayNumber(name)
	return err == nil
}

func weekdayNumber(name string) (int, error) {
	for i, n := range weekdayNames {
		if n == name {
			return i + 1, nil
		}
	}
	return 0, fmt.Errorf("%w: %q", ErrInvalidWeekday, name)
}

// isoWeekday converts a time.Weekday to 1 (Monday) through 7 (Sunday).
func isoWeekday(d time.Weekday) int {
	if d == time.Sunday {
		return 7
	}
	return int(d)
}

// querier is satisfied by both *sql.DB and *sql.Tx, so helpers can run
// inside or outside a transaction.
type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func isUniqueViolation(err error) bool {
	var sqliteErr sqlite3.Error
	return errors.As(err, &sqliteErr) && sqliteErr.ExtendedCode == sqlite3.ErrConstraintUnique
}

// CreatePlan stores a new training plan and returns it as persisted.
func (s *Store) CreatePlan(plan TrainingPlan) (TrainingPlan, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return TrainingPlan{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec("INSERT INTO training_plans (name) VALUES (?)", plan.Name)
	if isUniqueViolation(err) {
		return TrainingPlan{}, ErrDuplicatePlanName
	}
	if err != nil {
		return TrainingPlan{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return TrainingPlan{}, err
	}

	if err := insertPlanDays(tx, int(id), plan.Days); err != nil {
		return TrainingPlan{}, err
	}

	created, err := getPlan(tx, int(id))
	if err != nil {
		return TrainingPlan{}, err
	}

	return created, tx.Commit()
}

// GetPlan returns the training plan with the given ID, or ErrPlanNotFound.
func (s *Store) GetPlan(id int) (TrainingPlan, error) {
	return getPlan(s.db, id)
}

// GetPlans returns every training plan, ordered by name.
func (s *Store) GetPlans() ([]TrainingPlan, error) {
	rows, err := s.db.Query("SELECT id FROM training_plans ORDER BY name")
	if err != nil {
		return nil, err
	}

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	plans := []TrainingPlan{}
	for _, id := range ids {
		plan, err := getPlan(s.db, id)
		if err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	return plans, nil
}

// UpdatePlan replaces a plan's name and days. It returns ErrPlanNotFound if
// the plan does not exist.
func (s *Store) UpdatePlan(plan TrainingPlan) (TrainingPlan, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return TrainingPlan{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec("UPDATE training_plans SET name = ? WHERE id = ?", plan.Name, plan.ID)
	if isUniqueViolation(err) {
		return TrainingPlan{}, ErrDuplicatePlanName
	}
	if err != nil {
		return TrainingPlan{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return TrainingPlan{}, err
	}
	if rowsAffected == 0 {
		return TrainingPlan{}, ErrPlanNotFound
	}

	if err := deletePlanDays(tx, plan.ID); err != nil {
		return TrainingPlan{}, err
	}
	if err := insertPlanDays(tx, plan.ID, plan.Days); err != nil {
		return TrainingPlan{}, err
	}

	updated, err := getPlan(tx, plan.ID)
	if err != nil {
		return TrainingPlan{}, err
	}

	return updated, tx.Commit()
}

// DeletePlan removes a plan with all of its days and sets, and detaches any
// workouts that were logged against it. It returns false if no plan with
// the given ID exists.
func (s *Store) DeletePlan(id int) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if err := deletePlanDays(tx, id); err != nil {
		return false, err
	}

	if _, err := tx.Exec("UPDATE workouts SET plan_id = NULL WHERE plan_id = ?", id); err != nil {
		return false, err
	}

	result, err := tx.Exec("DELETE FROM training_plans WHERE id = ?", id)
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

// GetPlanDay returns what the plan schedules on the weekday of date. On a
// rest day the returned day has no exercises.
func (s *Store) GetPlanDay(id int, date time.Time) (PlanDay, error) {
	plan, err := getPlan(s.db, id)
	if err != nil {
		return PlanDay{}, err
	}

	weekday := weekdayNames[isoWeekday(date.Weekday())-1]
	for _, day := range plan.Days {
		if day.Weekday == weekday {
			return day, nil
		}
	}
	return PlanDay{Weekday: weekday, Exercises: []PlanExercise{}}, nil
}

func getPlan(q querier, id int) (TrainingPlan, error) {
	plan := TrainingPlan{ID: id, Days: []PlanDay{}}
	err := q.QueryRow("SELECT name FROM training_plans WHERE id = ?", id).Scan(&plan.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingPlan{}, ErrPlanNotFound
	}
	if err != nil {
		return TrainingPlan{}, err
	}

	rows, err := q.Query(`
		SELECT weekday, exercise_name, set_count, reps
		FROM training_plan_exercises
		WHERE plan_id = ?
		ORDER BY weekday, position
	`, id)
	if err != nil {
		return TrainingPlan{}, err
	}
	defer rows.Close()

	lastWeekday := 0
	for rows.Next() {
		var weekday int
		var ex PlanExercise
		if err := rows.Scan(&weekday, &ex.Name, &ex.Sets, &ex.Reps); err != nil {
			return TrainingPlan{}, err
		}

		if weekday != lastWeekday {
			plan.Days = append(plan.Days, PlanDay{Weekday: weekdayNames[weekday-1], Exercises: []PlanExercise{}})
			lastWeekday = weekday
		}
		day := &plan.Days[len(plan.Days)-1]
		day.Exercises = append(day.Exercises, ex)
	}

	return plan, rows.Err()
}

func insertPlanDays(q querier, planID int, days []PlanDay) error {
	for _, day := range days {
		weekday, err := weekdayNumber(day.Weekday)
		if err != nil {
			return err
		}

		for position, ex := range day.Exercises {
			if _, err := q.Exec(`
				INSERT INTO training_plan_exercises (plan_id, weekday, position, exercise_name, set_count, reps)
				VALUES (?, ?, ?, ?, ?, ?)
			`, planID, weekday, position, ex.Name, ex.Sets, ex.Reps); err != nil {
				return err
			}
		}
	}
	return nil
}

// deletePlanDays removes a plan's exercises, along with any target sets
// stored for them before plans held only sets × reps.
func deletePlanDays(q querier, planID int) error {
	if _, err := q.Exec(`
		DELETE FROM training_plan_sets
		WHERE plan_exercise_id IN (
			SELECT id FROM training_plan_exercises WHERE plan_id = ?
		)
	`, planID); err != nil {
		return err
	}

	_, err := q.Exec("DELETE FROM training_plan_exercises WHERE plan_id = ?", planID)
	return err
}
