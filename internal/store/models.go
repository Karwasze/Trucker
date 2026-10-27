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

// Activities of a CardioWorkout.
const (
	ActivityRunning  = "running"
	ActivityCycling  = "cycling"
	ActivitySwimming = "swimming"
	ActivityWalking  = "walking"
	ActivityHiking   = "hiking"
)

// CardioActivities are the activities a CardioWorkout can be.
var CardioActivities = []string{ActivityRunning, ActivityCycling, ActivitySwimming, ActivityWalking, ActivityHiking}

// CardioWorkout is an endurance workout, imported from Apple Health. Date is
// the local date of StartedAt (RFC3339). Distances are in metres. Samples
// and Laps are only loaded for a single workout, not in lists.
type CardioWorkout struct {
	ID              int      `json:"id"`
	Date            string   `json:"date"`
	StartedAt       string   `json:"started_at"`
	Activity        string   `json:"activity"`
	DurationSeconds float64  `json:"duration_seconds"`
	DistanceM       *float64 `json:"distance_m,omitempty"`
	// ManualDistance is set when DistanceM was entered by hand, as Health
	// had none. Importing ignores it.
	ManualDistance bool           `json:"manual_distance,omitempty"`
	EnergyKcal     *float64       `json:"energy_kcal,omitempty"`
	AvgHeartRate   *float64       `json:"avg_heart_rate,omitempty"`
	MaxHeartRate   *float64       `json:"max_heart_rate,omitempty"`
	SwimStrokes    *int           `json:"swim_strokes,omitempty"`
	LapLengthM     *float64       `json:"lap_length_m,omitempty"`
	Samples        []CardioSample `json:"samples,omitempty"`
	Laps           []CardioLap    `json:"laps,omitempty"`
	Source         string         `json:"source,omitempty"`
	SourceUUID     *string        `json:"source_uuid,omitempty"`
	// PlannedSessionID, when importing, is the planned session it fills.
	PlannedSessionID *int `json:"planned_session_id,omitempty"`
}

// CardioSample is where a workout stood T seconds in: D metres covered so
// far and the heart rate, when one was measured around then.
type CardioSample struct {
	T  float64  `json:"t"`
	D  float64  `json:"d"`
	HR *float64 `json:"hr,omitempty"`
}

// CardioLap is a lap or segment marked during a workout, starting T seconds
// in and covering D metres.
type CardioLap struct {
	T        float64 `json:"t"`
	Duration float64 `json:"duration"`
	D        float64 `json:"d"`
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
// time) to Date: plan adherence and stalls, progression and tonnage per lift,
// strength relative to bodyweight, cardio per activity and triathlons.
// Cardio days count as sessions and towards adherence like lifting days.
// Muscle volume always covers the last four weeks.
type Insights struct {
	Date            string            `json:"date"`
	From            string            `json:"from,omitempty"`
	Bodyweight      *BodyweightTrend  `json:"bodyweight"`
	SessionsPerWeek float64           `json:"sessions_per_week"`
	Muscles         []MuscleVolume    `json:"muscles"`
	Adherence       *Adherence        `json:"adherence"`
	Stalls          []PlanStall       `json:"stalls"`
	Progression     []LiftProgress    `json:"progression"`
	Tonnage         Tonnage           `json:"tonnage"`
	Strength        []StrengthLevel   `json:"strength"`
	Untagged        []string          `json:"untagged"`
	Cardio          []CardioSummary   `json:"cardio"`
	Triathlon       *TriathlonSummary `json:"triathlon"`
	Goal            *GoalSummary      `json:"goal"`
}

// GoalSummary is where the active goal stands: how far off the race is,
// the phase of this week (Monday to Sunday), how this week's sessions went
// so far, its planned and done distance per discipline, and the threshold
// speed (m/s) per discipline the plan's targets come from.
type GoalSummary struct {
	Goal        Goal               `json:"goal"`
	WeeksToRace int                `json:"weeks_to_race"`
	Phase       string             `json:"phase"`
	Met         int                `json:"met"`
	Partial     int                `json:"partial"`
	Missed      int                `json:"missed"`
	Pending     int                `json:"pending"`
	PlannedM    map[string]float64 `json:"planned_m"`
	DoneM       map[string]float64 `json:"done_m"`
	Threshold   map[string]float64 `json:"threshold"`
}

// CardioSummary is an activity's cardio workouts over the timespan: how
// many, how far (in metres) and how long in total, and the average distance
// per week.
type CardioSummary struct {
	Activity        string  `json:"activity"`
	Sessions        int     `json:"sessions"`
	DistanceM       float64 `json:"distance_m"`
	DurationSeconds float64 `json:"duration_seconds"`
	WeeklyDistanceM float64 `json:"weekly_distance_m"`
}

// Adherence is how many of a plan's scheduled days had a workout from the
// plan, from Since (the later of the timespan's start and the plan's first
// logged workout; empty when nothing was logged from the plan yet). A plan
// workout on a scheduled day counts; plan workouts on other days are Extra. Today only counts
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
// developed over the timespan. PerMonth is the change from the first
// session to the latest, per month; it is left out when those are less than
// two weeks apart. Record1RM is the best estimated 1RM of all time, up to
// the end of the timespan.
type LiftProgress struct {
	Exercise   string   `json:"exercise"`
	Sessions   int      `json:"sessions"`
	First1RM   float64  `json:"first_1rm"`
	FirstDate  string   `json:"first_date"`
	Best1RM    float64  `json:"best_1rm"`
	BestDate   string   `json:"best_date"`
	Latest1RM  float64  `json:"latest_1rm"`
	PerMonth   *float64 `json:"per_month,omitempty"`
	Record1RM  float64  `json:"record_1rm"`
	RecordDate string   `json:"record_date"`
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

// Categories of an Achievement.
const (
	AchievementPace      = "pace"
	AchievementDistance  = "distance"
	AchievementTriathlon = "triathlon"
	AchievementStrength  = "strength"
)

// Achievement is a badge earned in tiers, hardest last. Best is the best
// result so far in the tiers' unit, or nil before any: the time (s) over
// Distance for pace, metres for distance, and the estimated 1RM to
// bodyweight ratio for strength. Triathlons have no best.
type Achievement struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Title    string `json:"title"`
	// Activity is the cardio activity, or the lift for strength.
	Activity string            `json:"activity,omitempty"`
	Distance float64           `json:"distance_m,omitempty"`
	Best     *float64          `json:"best,omitempty"`
	Tiers    []AchievementTier `json:"tiers"`
}

// AchievementTier is one level of an Achievement: a time (s) to beat for
// pace, metres to cover for distance and triathlons (all legs together), a
// 1RM to bodyweight ratio to reach for strength. Name is set for tiers with
// one, such as race distances and strength levels.
type AchievementTier struct {
	Name     string  `json:"name,omitempty"`
	Target   float64 `json:"target"`
	EarnedOn string  `json:"earned_on,omitempty"`
	// WorkoutID is the workout that earned it: a cardio workout for pace and
	// distance, a lifting workout for strength. Triathlons are by date.
	WorkoutID int `json:"workout_id,omitempty"`
}

// Goal is an endurance race to train for: the legs to cover (in metres; a
// single-sport goal has one) on RaceDate, training on Weekdays with the
// long session on LongDay. Only one goal is Active at a time.
type Goal struct {
	ID        int      `json:"id"`
	Name      string   `json:"name"`
	RaceDate  string   `json:"race_date"`
	StartDate string   `json:"start_date"`
	SwimM     *float64 `json:"swim_m,omitempty"`
	BikeM     *float64 `json:"bike_m,omitempty"`
	RunM      *float64 `json:"run_m,omitempty"`
	Weekdays  []string `json:"weekdays"`
	LongDay   string   `json:"long_day"`
	Active    bool     `json:"active"`
}

// Kinds of a PlannedSession.
const (
	KindEasy      = "easy"
	KindLong      = "long"
	KindTempo     = "tempo"
	KindIntervals = "intervals"
	KindRecovery  = "recovery"
	KindTechnique = "technique"
	KindBrick     = "brick"
	KindRace      = "race"
)

// Phases of a goal's plan, in order.
const (
	PhaseBase  = "base"
	PhaseBuild = "build"
	PhasePeak  = "peak"
	PhaseTaper = "taper"
	PhaseRace  = "race"
)

// PlannedSession is one session of a goal's plan: an Activity on Date to a
// distance or duration target, at an intensity. Speeds are in m/s for every
// sport. Interval sessions repeat Reps of RepDistanceM or RepDurationS with
// RecoveryS between them. A long session may carry a TempoBlock in its
// middle. CardioWorkoutID is the imported workout that
// filled it; Workout and Verdict are filled in when sessions are read.
type PlannedSession struct {
	ID              int            `json:"id"`
	GoalID          int            `json:"goal_id"`
	Date            string         `json:"date"`
	Activity        string         `json:"activity"`
	Kind            string         `json:"kind"`
	Phase           string         `json:"phase"`
	TargetDistanceM *float64       `json:"target_distance_m,omitempty"`
	TargetDurationS *float64       `json:"target_duration_s,omitempty"`
	Intensity       string         `json:"intensity"`
	Description     string         `json:"description"`
	SpeedMin        *float64       `json:"speed_min,omitempty"`
	SpeedMax        *float64       `json:"speed_max,omitempty"`
	HRMin           *float64       `json:"hr_min,omitempty"`
	HRMax           *float64       `json:"hr_max,omitempty"`
	Reps            *int           `json:"reps,omitempty"`
	RepDistanceM    *float64       `json:"rep_distance_m,omitempty"`
	RepDurationS    *float64       `json:"rep_duration_s,omitempty"`
	RecoveryS       *float64       `json:"recovery_s,omitempty"`
	TempoBlock      *TempoBlock    `json:"tempo_block,omitempty"`
	CardioWorkoutID *int           `json:"cardio_workout_id,omitempty"`
	Workout         *CardioWorkout `json:"workout,omitempty"`
	Verdict         *Verdict       `json:"verdict,omitempty"`
}

// TempoBlock is DistanceM in zone 3 within a long session: in its middle,
// or finishing it when Position is BlockAtEnd. Blocks planned before zones
// carry a speed range (m/s) or a heart rate range, which are no longer
// used.
type TempoBlock struct {
	DistanceM float64  `json:"distance_m"`
	Position  string   `json:"position,omitempty"`
	SpeedMin  *float64 `json:"speed_min,omitempty"`
	SpeedMax  *float64 `json:"speed_max,omitempty"`
	HRMin     *float64 `json:"hr_min,omitempty"`
	HRMax     *float64 `json:"hr_max,omitempty"`
}

// BlockAtEnd is the Position of a TempoBlock finishing its session.
const BlockAtEnd = "end"

// Statuses of a Verdict.
const (
	VerdictMet     = "met"
	VerdictPartial = "partial"
	VerdictMissed  = "missed"
	VerdictPending = "pending"
)

// Verdict is whether a planned session was done as planned, with the checks
// behind it.
type Verdict struct {
	Status string  `json:"status"`
	Checks []Check `json:"checks"`
}

// Check compares what was done with the target on one aspect of a session,
// e.g. "Distance": "8.2 km" against "8 km".
type Check struct {
	Name   string `json:"name"`
	Actual string `json:"actual"`
	Target string `json:"target"`
	OK     bool   `json:"ok"`
}
