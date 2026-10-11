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
	ID        int    `json:"id"`
	Name      string `json:"name"`
	IsDefault bool   `json:"is_default"`
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

// PlanExercise is one exercise in a plan day, with its target sets and the
// rules used to progress or deload them. ConsecutiveMisses is maintained by
// the server.
type PlanExercise struct {
	Name              string  `json:"name"`
	Sets              []Set   `json:"sets"`
	WeightIncrement   float64 `json:"weight_increment"`
	RepsIncrement     int     `json:"reps_increment"`
	DeloadAfter       int     `json:"deload_after"`
	DeloadPercent     float64 `json:"deload_percent"`
	ConsecutiveMisses int     `json:"consecutive_misses"`
}

// ProgressionResult reports how a logged workout affected one plan exercise.
type ProgressionResult struct {
	Exercise string `json:"exercise"`
	Result   string `json:"result"`
}
