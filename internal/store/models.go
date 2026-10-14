package store

type Workout struct {
	ID        int        `json:"id"`
	Date      string     `json:"date"`
	PlanID    *int       `json:"plan_id,omitempty"`
	Exercises []Exercise `json:"exercises"`
}

type Exercise struct {
	Name string `json:"name"`
	Sets []Set  `json:"sets"`
}

type ExerciseDB struct {
	ID        int            `json:"id"`
	Name      string         `json:"name"`
	IsDefault bool           `json:"is_default"`
	Muscles   []MuscleTarget `json:"muscles"`
}

// MuscleTarget is a muscle an exercise works, as RolePrimary or
// RoleSecondary.
type MuscleTarget struct {
	Muscle string `json:"muscle"`
	Role   string `json:"role"`
}

// BodyweightEntry is the bodyweight in kg recorded for a date.
type BodyweightEntry struct {
	Date   string  `json:"date"`
	Weight float64 `json:"weight"`
}

type Set struct {
	Weight float64 `json:"weight"`
	Reps   int     `json:"reps"`
}

type StatisticsData struct {
	Date         string  `json:"date"`
	Estimated1RM float64 `json:"estimated_1rm"`
	TotalVolume  float64 `json:"total_volume"`
}

type StatisticsResponse struct {
	Exercises []string         `json:"exercises"`
	Data      []StatisticsData `json:"data"`
}

// TrainingPlan is a named weekly schedule of exercises with per-set targets.
type TrainingPlan struct {
	ID   int       `json:"id"`
	Name string    `json:"name"`
	Days []PlanDay `json:"days"`
}

// PlanDay holds the exercises a plan schedules on one weekday ("monday" ..
// "sunday").
type PlanDay struct {
	Weekday   string         `json:"weekday"`
	Exercises []PlanExercise `json:"exercises"`
}

// PlanExercise is one exercise in a plan day with its sets × reps scheme.
// Weights are not planned: they are worked out from logged workouts.
type PlanExercise struct {
	Name string `json:"name"`
	Sets int    `json:"sets"`
	Reps int    `json:"reps"`
}

// ExerciseTarget is what to lift for a plan exercise next: its sets × reps
// scheme at weights worked out from the exercise's logged history, and the
// reason for them, e.g. why the weight went up.
type ExerciseTarget struct {
	Name   string `json:"name"`
	Sets   []Set  `json:"sets"`
	Reason string `json:"reason,omitempty"`
}

// ProgressionResult reports how a logged workout affected one plan exercise.
type ProgressionResult struct {
	Exercise string `json:"exercise"`
	Result   string `json:"result"`
}

// Insights summarises recent training: volume per muscle, strength relative
// to bodyweight, stalled lifts and the resulting recommendations.
type Insights struct {
	Date            string           `json:"date"`
	Bodyweight      *BodyweightTrend `json:"bodyweight"`
	SessionsPerWeek float64          `json:"sessions_per_week"`
	Muscles         []MuscleVolume   `json:"muscles"`
	Strength        []StrengthLevel  `json:"strength"`
	Stalled         []StalledLift    `json:"stalled"`
	Untagged        []string         `json:"untagged"`
	Recommendations []Recommendation `json:"recommendations"`
}

// BodyweightTrend is the latest bodyweight and, when an earlier entry from
// the preceding 30 days exists, the change since then.
type BodyweightTrend struct {
	Date        string   `json:"date"`
	Weight      float64  `json:"weight"`
	Change      *float64 `json:"change,omitempty"`
	ChangeSince string   `json:"change_since,omitempty"`
}

// MuscleVolume is the average weekly training a muscle got over the last
// four weeks.
type MuscleVolume struct {
	Muscle      string  `json:"muscle"`
	WeeklySets  float64 `json:"weekly_sets"`
	DaysPerWeek float64 `json:"days_per_week"`
	LastTrained string  `json:"last_trained,omitempty"`
	Status      string  `json:"status"`
}

// StrengthLevel compares a main lift's best estimated 1RM to bodyweight
// standards. Level is empty below beginner; NextLevel is empty at elite.
type StrengthLevel struct {
	Exercise    string  `json:"exercise"`
	Best1RM     float64 `json:"best_1rm"`
	Ratio       float64 `json:"ratio"`
	Level       string  `json:"level"`
	NextLevel   string  `json:"next_level"`
	NextLevelKg float64 `json:"next_level_kg"`
}

// StalledLift is an exercise whose best estimated 1RM over the last four
// weeks did not beat the four weeks before.
type StalledLift struct {
	Exercise    string  `json:"exercise"`
	Recent1RM   float64 `json:"recent_1rm"`
	Previous1RM float64 `json:"previous_1rm"`
}

// Recommendation is one piece of advice. Kind is "warning", "info" or "good".
type Recommendation struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
}
