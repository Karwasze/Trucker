package store

import (
	"cmp"
	"database/sql"
	"errors"
	"fmt"
	"maps"
	"math"
	"slices"
	"time"
)

// Weekly set ranges per muscle. Fewer than VolumeLowBelow sets a week is
// unlikely to build muscle; more than VolumeHighAbove is hard to recover
// from.
const (
	VolumeLowBelow  = 10
	VolumeHighAbove = 20
)

// Statuses of a muscle's weekly volume.
const (
	VolumeUntrained = "untrained"
	VolumeLow       = "low"
	VolumeOptimal   = "optimal"
	VolumeHigh      = "high"
)

const (
	volumeWindowDays    = 28
	bodyweightTrendDays = 30
	// A plan exercise counts as stalled after this many misses in a row at
	// the same weight.
	stallAfterMisses = 2
	// Progression rates need sessions at least this many days apart, so a
	// couple of close sessions don't extrapolate wildly.
	minRateDays  = 14
	daysPerMonth = 30.44
)

var strengthLevelNames = []string{"beginner", "novice", "intermediate", "advanced", "elite"}

// strengthStandards are male 1RM-to-bodyweight ratios for each level in
// strengthLevelNames.
var strengthStandards = []struct {
	exercise string
	ratios   []float64
}{
	{"Squat", []float64{0.75, 1.25, 1.5, 2.25, 2.75}},
	{"Bench Press", []float64{0.5, 1.0, 1.25, 1.75, 2.0}},
	{"Deadlift", []float64{1.0, 1.5, 2.0, 2.5, 3.0}},
	{"Overhead Press", []float64{0.35, 0.55, 0.8, 1.05, 1.35}},
	{"Romanian Deadlift", []float64{0.75, 1.0, 1.5, 2.0, 2.75}},
}

const dateLayout = "2006-01-02"

// insightSet is one logged set with its workout.
type insightSet struct {
	workoutID int
	date      string
	exercise  string
	Set
}

// exerciseHistory is an exercise's logged sessions, one per workout, oldest
// first.
type exerciseHistory struct {
	dates    []string
	sessions [][]Set
}

// GetInsights analyses training up to and including today (YYYY-MM-DD).
// Adherence, deloads, progression, tonnage and strength levels cover the
// timespan starting on from (YYYY-MM-DD, or "" for all time); muscle volume
// always covers the last four weeks. Adherence and stalls are judged against
// the plan planID, and left out for 0 or an unknown plan; so is
// progression, which only covers the plan's exercises.
func (s *Store) GetInsights(today, from string, planID int) (Insights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return Insights{}, fmt.Errorf("invalid date %q: %w", today, err)
	}
	if from != "" {
		if _, err := time.Parse(dateLayout, from); err != nil {
			return Insights{}, fmt.Errorf("invalid date %q: %w", from, err)
		}
	}

	all, err := s.setsBetween("", today)
	if err != nil {
		return Insights{}, err
	}
	var window []insightSet
	for _, set := range all {
		if set.date >= from {
			window = append(window, set)
		}
	}
	tags, err := s.GetExerciseMuscles()
	if err != nil {
		return Insights{}, err
	}
	bodyweight, err := s.ListBodyweight()
	if err != nil {
		return Insights{}, err
	}
	cardio, err := s.cardioBetween("", today)
	if err != nil {
		return Insights{}, err
	}

	insights := Insights{
		Date:        today,
		From:        from,
		Bodyweight:  bodyweightTrend(bodyweight),
		Stalls:      []PlanStall{},
		Progression: []LiftProgress{},
		Tonnage:     tonnage(window, now),
		Untagged:    []string{},
		Cardio:      cardioSummaries(cardio, from, now),
		Triathlon:   triathlonSummary(triathlons(cardio), from),
	}

	if planID != 0 {
		plan, err := getPlan(s.db, planID)
		switch {
		case errors.Is(err, ErrPlanNotFound):
		case err != nil:
			return Insights{}, err
		default:
			if insights.Adherence, err = s.adherence(plan, from, now); err != nil {
				return Insights{}, err
			}
			insights.Stalls = planStalls(plan, all, from, today)
			insights.Progression = planProgress(plan, liftProgress(all, from))
		}
	}

	volumeStart := now.AddDate(0, 0, -volumeWindowDays).Format(dateLayout)
	weeks := float64(volumeWindowDays) / 7
	sessions := make(map[string]bool)
	weighted := make(map[string]float64)
	muscleDays := make(map[string]map[string]bool)
	lastTrained := make(map[string]string)
	for _, set := range all {
		muscles, tagged := tags[set.exercise]
		if !tagged && set.date > volumeStart && !slices.Contains(insights.Untagged, set.exercise) {
			insights.Untagged = append(insights.Untagged, set.exercise)
		}
		for _, m := range muscles {
			if m.Role == RolePrimary && set.date > lastTrained[m.Muscle] {
				lastTrained[m.Muscle] = set.date
			}
		}
		if set.date <= volumeStart {
			continue
		}
		sessions[set.date] = true
		for _, m := range muscles {
			if m.Role == RoleSecondary {
				weighted[m.Muscle] += 0.5
				continue
			}
			weighted[m.Muscle]++
			if muscleDays[m.Muscle] == nil {
				muscleDays[m.Muscle] = make(map[string]bool)
			}
			muscleDays[m.Muscle][set.date] = true
		}
	}
	slices.Sort(insights.Untagged)
	for _, w := range cardio {
		if w.Date > volumeStart {
			sessions[w.Date] = true
		}
	}

	insights.SessionsPerWeek = round(float64(len(sessions))/weeks, 1)
	for _, muscle := range Muscles {
		weekly := round(weighted[muscle]/weeks, 1)
		insights.Muscles = append(insights.Muscles, MuscleVolume{
			Muscle:      muscle,
			WeeklySets:  weekly,
			DaysPerWeek: round(float64(len(muscleDays[muscle]))/weeks, 1),
			LastTrained: lastTrained[muscle],
			Status:      volumeStatus(weekly),
		})
	}

	if insights.Bodyweight != nil {
		insights.Strength = strengthLevels(window, insights.Bodyweight.Weight)
	}
	if insights.Strength == nil {
		insights.Strength = []StrengthLevel{}
	}
	if insights.Goal, err = s.goalSummary(cardio, now); err != nil {
		return Insights{}, err
	}
	return insights, nil
}

// goalSummary sums up the active goal's week as of now, or nil without an
// active goal or once its race is over.
func (s *Store) goalSummary(cardio []CardioWorkout, now time.Time) (*GoalSummary, error) {
	goal, err := s.ActiveGoal()
	if err != nil || goal == nil {
		return nil, err
	}
	today := now.Format(dateLayout)
	if goal.RaceDate < today {
		return nil, nil
	}
	fitness := estimateFitness(cardio, now)
	start, _ := time.Parse(dateLayout, goal.StartDate)
	race, _ := time.Parse(dateLayout, goal.RaceDate)
	weeks := planWeeks(start, race, taperWeeks(*goal, fitness))
	i := min(weekIndex(weeks, now), len(weeks)-1)

	summary := &GoalSummary{
		Goal:        *goal,
		WeeksToRace: len(weeks) - 1 - i,
		Phase:       weeks[i].phase,
		PlannedM:    map[string]float64{},
		DoneM:       map[string]float64{},
		Threshold:   fitness.Threshold,
	}
	monday := mondayOf(now)
	sessions, err := s.GoalSessions(goal.ID, monday.Format(dateLayout), monday.AddDate(0, 0, 6).Format(dateLayout), today)
	if err != nil {
		return nil, err
	}
	for _, session := range sessions {
		switch session.Verdict.Status {
		case VerdictMet:
			summary.Met++
		case VerdictPartial:
			summary.Partial++
		case VerdictMissed:
			summary.Missed++
		default:
			summary.Pending++
		}
		summary.PlannedM[session.Activity] += deref(session.TargetDistanceM)
		if session.Workout != nil {
			summary.DoneM[session.Activity] += deref(session.Workout.DistanceM)
		}
	}
	return summary, nil
}

// setsBetween returns every set logged after start and up to end (both
// YYYY-MM-DD), in the order they were logged.
func (s *Store) setsBetween(start, end string) ([]insightSet, error) {
	rows, err := s.db.Query(`
		SELECT w.id, w.date, e.name, s.weight, s.reps
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE w.date > ? AND w.date <= ?
		ORDER BY w.date, w.id, e.id, s.id
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sets []insightSet
	for rows.Next() {
		var set insightSet
		if err := rows.Scan(&set.workoutID, &set.date, &set.exercise, &set.Weight, &set.Reps); err != nil {
			return nil, err
		}
		sets = append(sets, set)
	}
	return sets, rows.Err()
}

// histories groups sets by exercise into sessions, merging repeated entries
// of an exercise within a workout.
func histories(sets []insightSet) map[string]*exerciseHistory {
	byExercise := make(map[string]*exerciseHistory)
	lastWorkout := make(map[string]int)
	for _, set := range sets {
		h := byExercise[set.exercise]
		if h == nil {
			h = &exerciseHistory{}
			byExercise[set.exercise] = h
		}
		if len(h.sessions) == 0 || lastWorkout[set.exercise] != set.workoutID {
			h.dates = append(h.dates, set.date)
			h.sessions = append(h.sessions, nil)
			lastWorkout[set.exercise] = set.workoutID
		}
		h.sessions[len(h.sessions)-1] = append(h.sessions[len(h.sessions)-1], set.Set)
	}
	return byExercise
}

// estimated1RM is calculate1RM limited to rep counts the formula handles.
func estimated1RM(set Set) float64 {
	if set.Reps < 1 || set.Reps > 36 {
		return 0
	}
	return calculate1RM(set.Weight, set.Reps)
}

// best1RM is the best estimated 1RM of a session's sets.
func best1RM(sets []Set) float64 {
	best := 0.0
	for _, set := range sets {
		best = math.Max(best, estimated1RM(set))
	}
	return best
}

func bodyweightTrend(entries []BodyweightEntry) *BodyweightTrend {
	if len(entries) == 0 {
		return nil
	}
	latest := entries[len(entries)-1]
	trend := &BodyweightTrend{Date: latest.Date, Weight: latest.Weight}

	latestDate, err := time.Parse(dateLayout, latest.Date)
	if err != nil {
		return trend
	}
	since := latestDate.AddDate(0, 0, -bodyweightTrendDays).Format(dateLayout)
	for _, e := range entries[:len(entries)-1] {
		if e.Date >= since {
			change := round(latest.Weight-e.Weight, 1)
			trend.Change = &change
			trend.ChangeSince = e.Date
			break
		}
	}
	return trend
}

func volumeStatus(weeklySets float64) string {
	switch {
	case weeklySets == 0:
		return VolumeUntrained
	case weeklySets < VolumeLowBelow:
		return VolumeLow
	case weeklySets > VolumeHighAbove:
		return VolumeHigh
	default:
		return VolumeOptimal
	}
}

// strengthLevels rates each main lift's best estimated 1RM against the
// bodyweight standards.
func strengthLevels(sets []insightSet, bodyweight float64) []StrengthLevel {
	if bodyweight <= 0 {
		return nil
	}
	var levels []StrengthLevel
	for _, standard := range strengthStandards {
		best := 0.0
		for _, set := range sets {
			if set.exercise == standard.exercise {
				best = math.Max(best, estimated1RM(set.Set))
			}
		}
		if best == 0 {
			continue
		}

		level := StrengthLevel{Exercise: standard.exercise, Best1RM: round(best, 1), Ratio: round(best/bodyweight, 2)}
		for i, ratio := range standard.ratios {
			if best >= ratio*bodyweight {
				level.Level = strengthLevelNames[i]
				continue
			}
			level.NextLevel = strengthLevelNames[i]
			level.NextLevelKg = round(ratio*bodyweight-best, 1)
			break
		}
		levels = append(levels, level)
	}
	return levels
}

// adherence compares the days the plan schedules with the days a workout was
// logged from the plan, from its first logged workout up to now. Cardio and
// workouts without the plan or from another plan don't count.
func (s *Store) adherence(plan TrainingPlan, from string, now time.Time) (*Adherence, error) {
	today := now.Format(dateLayout)
	a := &Adherence{Plan: plan.Name, Missed: []string{}}

	var first sql.NullString
	err := s.db.QueryRow("SELECT MIN(date) FROM workouts WHERE plan_id = ? AND date <= ?", plan.ID, today).Scan(&first)
	if err != nil {
		return nil, err
	}
	if !first.Valid {
		return a, nil
	}
	start, err := time.Parse(dateLayout, first.String)
	if err != nil {
		return nil, err
	}
	a.Since = max(first.String, from)

	scheduled := make(map[string]bool)
	for _, day := range plan.Days {
		scheduled[day.Weekday] = len(day.Exercises) > 0
	}
	trained, err := s.planWorkoutDates(plan.ID, today)
	if err != nil {
		return nil, err
	}

	// Newest first, so the streak ends at the first miss.
	streaking := true
	for d := now; !d.Before(start); d = d.AddDate(0, 0, -1) {
		date := d.Format(dateLayout)
		inSpan := date >= from
		switch {
		case !scheduled[weekdayNames[isoWeekday(d.Weekday())-1]]:
			if trained[date] && inSpan {
				a.Extra++
			}
		case trained[date]:
			if inSpan {
				a.Completed++
			}
			if streaking {
				a.Streak++
			}
		case date == today:
			// Today isn't over yet.
		default:
			if inSpan {
				a.Missed = append(a.Missed, date)
			}
			streaking = false
		}
	}
	a.Scheduled = a.Completed + len(a.Missed)
	return a, nil
}

// planWorkoutDates is the set of dates up to today with a workout logged from
// the plan.
func (s *Store) planWorkoutDates(planID int, today string) (map[string]bool, error) {
	rows, err := s.db.Query(`
		SELECT DISTINCT w.date
		FROM workouts w
		JOIN exercises e ON e.workout_id = w.id
		JOIN sets s ON s.exercise_id = e.id
		WHERE w.plan_id = ? AND w.date <= ?
	`, planID, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dates := make(map[string]bool)
	for rows.Next() {
		var date string
		if err := rows.Scan(&date); err != nil {
			return nil, err
		}
		dates[date] = true
	}
	return dates, rows.Err()
}

// planStalls replays the plan's progression over each of its exercises'
// history to find exercises missing their scheme now and deloads within the
// timespan starting on from. An exercise missing its scheme now is reported
// as such, otherwise its latest deload in the timespan is. After a layoff the
// plan eases back in instead of counting misses, so neither does this.
func planStalls(plan TrainingPlan, sets []insightSet, from, today string) []PlanStall {
	byExercise := histories(sets)
	seen := make(map[string]bool)
	stalls := []PlanStall{}
	for _, day := range plan.Days {
		for _, scheme := range day.Exercises {
			h := byExercise[scheme.Name]
			if seen[scheme.Name] || h == nil {
				continue
			}
			seen[scheme.Name] = true

			last := len(h.sessions) - 1
			weight := workingWeight(h.sessions[last])
			off, _ := daysOff(h.dates[last], today)
			if misses := consecutiveMisses(scheme, h.sessions, weight); misses >= stallAfterMisses && layoffFraction(off) == 0 {
				_, result, _ := nextTarget(scheme, h.sessions, 0)
				stalls = append(stalls, PlanStall{
					Exercise: scheme.Name, Status: StallMissing, Weight: weight, Misses: misses,
					Date: h.dates[last], DeloadNext: result == ResultDeloaded,
				})
				continue
			}

			for i := last; i >= 0 && h.dates[i] >= from; i-- {
				// Like EvaluateProgression, the outcome of a session follows
				// from the history up to it.
				if _, result, _ := nextTarget(scheme, h.sessions[:i+1], 0); result == ResultDeloaded {
					weight := workingWeight(h.sessions[i])
					stalls = append(stalls, PlanStall{
						Exercise: scheme.Name, Status: StallDeloaded, Weight: weight,
						Misses: consecutiveMisses(scheme, h.sessions[:i+1], weight), Date: h.dates[i],
					})
					break
				}
			}
		}
	}
	return stalls
}

// liftProgress follows the best estimated 1RM per session of every weighted
// lift trained since from, using earlier history for the record. Lifts are
// sorted by their change from the first session to the latest, relative to
// the first, most improved first.
func liftProgress(sets []insightSet, from string) []LiftProgress {
	byExercise := histories(sets)
	progress := []LiftProgress{}
	for _, name := range slices.Sorted(maps.Keys(byExercise)) {
		h := byExercise[name]
		var p *LiftProgress
		var lastDate, recordDate string
		record := 0.0
		for i, sets := range h.sessions {
			best := best1RM(sets)
			if best == 0 {
				continue
			}
			if date := h.dates[i]; date >= from {
				if p == nil {
					p = &LiftProgress{Exercise: name, First1RM: round(best, 1), FirstDate: date}
				}
				p.Sessions++
				if best > p.Best1RM {
					p.Best1RM, p.BestDate = round(best, 1), date
				}
				p.Latest1RM, lastDate = round(best, 1), date
			}
			if best > record {
				record, recordDate = best, h.dates[i]
			}
		}
		if p == nil {
			continue
		}
		p.Record1RM, p.RecordDate = round(record, 1), recordDate
		if days, _ := daysOff(p.FirstDate, lastDate); days >= minRateDays {
			rate := round((p.Latest1RM-p.First1RM)/float64(days)*daysPerMonth, 1)
			p.PerMonth = &rate
		}
		progress = append(progress, *p)
	}
	change := func(p LiftProgress) float64 { return (p.Latest1RM - p.First1RM) / p.First1RM }
	slices.SortStableFunc(progress, func(a, b LiftProgress) int {
		return cmp.Compare(change(b), change(a))
	})
	return progress
}

// planProgress keeps the progress of the lifts the plan schedules.
func planProgress(plan TrainingPlan, progress []LiftProgress) []LiftProgress {
	inPlan := make(map[string]bool)
	for _, day := range plan.Days {
		for _, scheme := range day.Exercises {
			inPlan[scheme.Name] = true
		}
	}
	return slices.DeleteFunc(progress, func(p LiftProgress) bool { return !inPlan[p.Exercise] })
}

// tonnage sums weight × reps over sets, per week from the week of the first
// set to the week of now.
func tonnage(sets []insightSet, now time.Time) Tonnage {
	t := Tonnage{Weekly: []WeeklyTonnage{}, ByExercise: []ExerciseTonnage{}}
	if len(sets) == 0 {
		return t
	}

	weekly := make(map[string]float64)
	byExercise := make(map[string]float64)
	for _, set := range sets {
		kg := set.Weight * float64(set.Reps)
		t.Total += kg
		byExercise[set.exercise] += kg
		date, err := time.Parse(dateLayout, set.date)
		if err != nil {
			continue
		}
		weekly[weekStart(date).Format(dateLayout)] += kg
	}
	t.Total = round(t.Total, 1)

	first, err := time.Parse(dateLayout, sets[0].date)
	if err != nil {
		first = now
	}
	for w := weekStart(first); !w.After(now); w = w.AddDate(0, 0, 7) {
		week := w.Format(dateLayout)
		t.Weekly = append(t.Weekly, WeeklyTonnage{Week: week, Tonnage: round(weekly[week], 1)})
	}
	for name, kg := range byExercise {
		t.ByExercise = append(t.ByExercise, ExerciseTonnage{Exercise: name, Tonnage: round(kg, 1)})
	}
	slices.SortFunc(t.ByExercise, func(a, b ExerciseTonnage) int {
		return cmp.Or(cmp.Compare(b.Tonnage, a.Tonnage), cmp.Compare(a.Exercise, b.Exercise))
	})
	return t
}

// weekStart returns the Monday of date's week.
func weekStart(date time.Time) time.Time {
	return date.AddDate(0, 0, 1-isoWeekday(date.Weekday()))
}

func round(v float64, decimals int) float64 {
	p := math.Pow(10, float64(decimals))
	return math.Round(v*p) / p
}

// cardioSummaries totals the cardio workouts (oldest first) from from
// (YYYY-MM-DD, or "" for all time) up to now per activity, in the order of
// CardioActivities. All time starts at the first cardio workout.
func cardioSummaries(cardio []CardioWorkout, from string, now time.Time) []CardioSummary {
	summaries := []CardioSummary{}
	start := from
	for _, w := range cardio {
		if w.Date >= from {
			if start == "" {
				start = w.Date
			}
			break
		}
	}
	if start == "" {
		return summaries
	}
	first, err := time.Parse(dateLayout, start)
	if err != nil {
		return summaries
	}
	weeks := math.Max((now.Sub(first).Hours()/24+1)/7, 1)

	byActivity := make(map[string]*CardioSummary)
	for _, w := range cardio {
		if w.Date < from {
			continue
		}
		summary := byActivity[w.Activity]
		if summary == nil {
			summary = &CardioSummary{Activity: w.Activity}
			byActivity[w.Activity] = summary
		}
		summary.Sessions++
		summary.DurationSeconds += w.DurationSeconds
		if w.DistanceM != nil {
			summary.DistanceM += *w.DistanceM
		}
	}
	for _, activity := range CardioActivities {
		if summary := byActivity[activity]; summary != nil {
			summary.DistanceM = math.Round(summary.DistanceM)
			summary.WeeklyDistanceM = math.Round(summary.DistanceM / weeks)
			summaries = append(summaries, *summary)
		}
	}
	return summaries
}
