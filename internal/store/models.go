package store

type Workout struct {
	ID          int        `json:"id"`
	Date        string     `json:"date"`
	WorkoutType string     `json:"workout_type"`
	WorkoutDay  int        `json:"workout_day"`
	Exercises   []Exercise `json:"exercises"`
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

type GZCLPDayExercise struct {
	Day          int    `json:"day"`
	Slot         string `json:"slot"`
	ExerciseName string `json:"exercise_name"`
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
