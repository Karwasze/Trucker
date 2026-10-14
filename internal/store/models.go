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

// Insights summarises training over a timespan from From (empty for all
// time) to Date: plan adherence and stalls, progression and tonnage per lift
// and strength relative to bodyweight. Muscle volume always covers the last
// four weeks.
type Insights struct {
	Date            string           `json:"date"`
	From            string           `json:"from,omitempty"`
	Bodyweight      *BodyweightTrend `json:"bodyweight"`
	SessionsPerWeek float64          `json:"sessions_per_week"`
	Muscles         []MuscleVolume   `json:"muscles"`
	Adherence       *Adherence       `json:"adherence"`
	Stalls          []PlanStall      `json:"stalls"`
	Progression     []LiftProgress   `json:"progression"`
	Tonnage         Tonnage          `json:"tonnage"`
	Strength        []StrengthLevel  `json:"strength"`
	Untagged        []string         `json:"untagged"`
}

// Adherence is how many of a plan's scheduled days had a workout, from Since
// (the later of the timespan's start and the plan's first logged workout;
// empty when nothing was logged from the plan yet). Any workout on a
// scheduled day counts; workouts on other days are Extra. Today only counts
// once something is logged. Missed lists the scheduled days without a
// workout, newest first. Streak is the number of scheduled days in a row
// completed up to now, regardless of the timespan.
type Adherence struct {
	Plan      string   `json:"plan"`
	Since     string   `json:"since,omitempty"`
	Scheduled int      `json:"scheduled"`
	Completed int      `json:"completed"`
	Extra     int      `json:"extra"`
	Streak    int      `json:"streak"`
	Missed    []string `json:"missed"`
}

// Statuses of a PlanStall.
const (
	StallMissing  = "missing"
	StallDeloaded = "deloaded"
)

// PlanStall is a plan exercise that is StallMissing its scheme several
// sessions in a row at Weight up to Date, or that StallDeloaded after Misses
// misses at Weight on Date, within the timespan. DeloadNext is set when
// the current misses are enough for the next session to deload.
type PlanStall struct {
	Exercise   string  `json:"exercise"`
	Status     string  `json:"status"`
	Weight     float64 `json:"weight"`
	Misses     int     `json:"misses"`
	Date       string  `json:"date"`
	DeloadNext bool    `json:"deload_next,omitempty"`
}

// LiftProgress is how a weighted lift's best estimated 1RM per session
// developed over the timespan. PRs counts sessions that beat every earlier
// session of the lift (the lift's first session ever is not one). PerMonth
// is the change from the first session to the latest, per month; it is
// left out when those are less than two weeks apart.
type LiftProgress struct {
	Exercise  string   `json:"exercise"`
	Sessions  int      `json:"sessions"`
	First1RM  float64  `json:"first_1rm"`
	FirstDate string   `json:"first_date"`
	Best1RM   float64  `json:"best_1rm"`
	BestDate  string   `json:"best_date"`
	Latest1RM float64  `json:"latest_1rm"`
	PerMonth  *float64 `json:"per_month,omitempty"`
	PRs       int      `json:"prs"`
	LastPR    string   `json:"last_pr,omitempty"`
}

// Tonnage is the weight lifted (weight × reps) over the timespan, in total,
// per week (starting Monday, including empty weeks) and per exercise,
// heaviest first.
type Tonnage struct {
	Total      float64           `json:"total"`
	Weekly     []WeeklyTonnage   `json:"weekly"`
	ByExercise []ExerciseTonnage `json:"by_exercise"`
}

type WeeklyTonnage struct {
	Week    string  `json:"week"`
	Tonnage float64 `json:"tonnage"`
}

type ExerciseTonnage struct {
	Exercise string  `json:"exercise"`
	Tonnage  float64 `json:"tonnage"`
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
