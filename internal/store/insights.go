package store

import (
	"fmt"
	"math"
	"slices"
	"strings"
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
	stallWindowDays     = 56
	stallMinSessions    = 4
	strengthWindowDays  = 90
	bodyweightTrendDays = 30
	staleAfterDays      = 10
	// Balance is only judged once the larger side gets this many sets a week.
	balanceMinSets = 6
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
}

var (
	pushMuscles = []string{"chest", "shoulders", "triceps"}
	pullMuscles = []string{"back", "biceps"}
)

const dateLayout = "2006-01-02"

// insightSet is one logged set with its workout date.
type insightSet struct {
	date     string
	exercise string
	weight   float64
	reps     int
}

// GetInsights analyses training up to and including today (YYYY-MM-DD).
func (s *Store) GetInsights(today string) (Insights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return Insights{}, fmt.Errorf("invalid date %q: %w", today, err)
	}
	daysAgo := func(days int) string { return now.AddDate(0, 0, -days).Format(dateLayout) }

	sets, err := s.setsBetween(daysAgo(strengthWindowDays), today)
	if err != nil {
		return Insights{}, err
	}
	tags, err := s.GetExerciseMuscles()
	if err != nil {
		return Insights{}, err
	}
	bodyweight, err := s.ListBodyweight()
	if err != nil {
		return Insights{}, err
	}

	insights := Insights{
		Date:       today,
		Bodyweight: bodyweightTrend(bodyweight),
		Stalled:    stalledLifts(sets, daysAgo(stallWindowDays), daysAgo(volumeWindowDays)),
		Untagged:   []string{},
	}

	volumeStart := daysAgo(volumeWindowDays)
	weeks := float64(volumeWindowDays) / 7
	sessions := make(map[string]bool)
	weighted := make(map[string]float64)
	muscleDays := make(map[string]map[string]bool)
	lastTrained := make(map[string]string)
	for _, set := range sets {
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
		insights.Strength = strengthLevels(sets, insights.Bodyweight.Weight)
	}
	if insights.Strength == nil {
		insights.Strength = []StrengthLevel{}
	}

	insights.Recommendations = recommend(insights, now, len(sessions) > 0)
	return insights, nil
}

// setsBetween returns every set logged after start and up to end (both
// YYYY-MM-DD), in date order.
func (s *Store) setsBetween(start, end string) ([]insightSet, error) {
	rows, err := s.db.Query(`
		SELECT w.date, e.name, s.weight, s.reps
		FROM sets s
		JOIN exercises e ON s.exercise_id = e.id
		JOIN workouts w ON e.workout_id = w.id
		WHERE w.date > ? AND w.date <= ?
		ORDER BY w.date, s.id
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sets []insightSet
	for rows.Next() {
		var set insightSet
		if err := rows.Scan(&set.date, &set.exercise, &set.weight, &set.reps); err != nil {
			return nil, err
		}
		sets = append(sets, set)
	}
	return sets, rows.Err()
}

// estimated1RM is calculate1RM limited to rep counts the formula handles.
func estimated1RM(set insightSet) float64 {
	if set.reps < 1 || set.reps > 36 {
		return 0
	}
	return calculate1RM(set.weight, set.reps)
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
				best = math.Max(best, estimated1RM(set))
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

// stalledLifts finds exercises trained at least stallMinSessions times after
// start whose best estimated 1RM after split is no better than before it.
func stalledLifts(sets []insightSet, start, split string) []StalledLift {
	type history struct {
		sessions         map[string]bool
		previous, recent float64
	}
	byExercise := make(map[string]*history)
	var order []string
	for _, set := range sets {
		if set.date <= start {
			continue
		}
		h := byExercise[set.exercise]
		if h == nil {
			h = &history{sessions: make(map[string]bool)}
			byExercise[set.exercise] = h
			order = append(order, set.exercise)
		}
		h.sessions[set.date] = true
		if set.date > split {
			h.recent = math.Max(h.recent, estimated1RM(set))
		} else {
			h.previous = math.Max(h.previous, estimated1RM(set))
		}
	}

	stalled := []StalledLift{}
	slices.Sort(order)
	for _, name := range order {
		h := byExercise[name]
		if len(h.sessions) >= stallMinSessions && h.previous > 0 && h.recent > 0 && h.recent <= h.previous {
			stalled = append(stalled, StalledLift{Exercise: name, Recent1RM: round(h.recent, 1), Previous1RM: round(h.previous, 1)})
		}
	}
	return stalled
}

// recommend turns the analysis into advice, warnings first.
func recommend(insights Insights, now time.Time, trainedRecently bool) []Recommendation {
	var warnings, infos []Recommendation
	warn := func(format string, args ...any) {
		warnings = append(warnings, Recommendation{Kind: "warning", Text: fmt.Sprintf(format, args...)})
	}
	info := func(format string, args ...any) {
		infos = append(infos, Recommendation{Kind: "info", Text: fmt.Sprintf(format, args...)})
	}

	if !trainedRecently {
		warn("No workouts in the last 4 weeks. Log a few sessions to get training advice.")
	} else {
		volume := make(map[string]float64)
		var untrained []string
		for _, m := range insights.Muscles {
			volume[m.Muscle] = m.WeeklySets
			switch m.Status {
			case VolumeUntrained:
				untrained = append(untrained, m.Muscle)
			case VolumeLow:
				warn("Train %s more: %s sets a week%s. Aim for %d–%d.",
					m.Muscle, formatSets(m.WeeklySets), lastTrainedNote(m, now), VolumeLowBelow, VolumeHighAbove)
			case VolumeHigh:
				warn("%s volume is high: %s sets a week. Above %d is hard to recover from, so consider cutting back.",
					capitalize(m.Muscle), formatSets(m.WeeklySets), VolumeHighAbove)
			}
			if m.Status != VolumeUntrained && m.Status != VolumeLow {
				if days := daysSince(m.LastTrained, now); days > staleAfterDays {
					warn("%s hasn't been trained in %d days.", capitalize(m.Muscle), days)
				}
				if m.DaysPerWeek < 1.5 {
					info("%s is trained about once a week. Splitting its sets over 2 days usually grows it better.", capitalize(m.Muscle))
				}
			}
		}

		if len(untrained) > 0 {
			warn("Not trained in the last 4 weeks: %s. Aim for %d–%d sets a week each.",
				strings.Join(untrained, ", "), VolumeLowBelow, VolumeHighAbove)
		}

		push, pull := sum(volume, pushMuscles), sum(volume, pullMuscles)
		switch {
		case push >= balanceMinSets && push > 1.5*pull:
			warn("You do more pushing (%s sets a week) than pulling (%s). Add rows or pulldowns to keep shoulders healthy.",
				formatSets(push), formatSets(pull))
		case pull >= balanceMinSets && pull > 1.5*push:
			warn("You do more pulling (%s sets a week) than pushing (%s). Add presses to balance it.",
				formatSets(pull), formatSets(push))
		}
		if quads, hams := volume["quads"], volume["hamstrings"]; quads >= balanceMinSets && quads > 2*hams {
			warn("Quads get %s sets a week but hamstrings only %s. Add leg curls or Romanian deadlifts.",
				formatSets(quads), formatSets(hams))
		}
	}

	for _, lift := range insights.Stalled {
		warn("%s has stalled: best estimated 1RM %s kg over the last 4 weeks vs %s kg before. Try a deload or a different rep range.",
			lift.Exercise, formatSets(lift.Recent1RM), formatSets(lift.Previous1RM))
	}
	if len(insights.Untagged) > 0 {
		info("Tag muscles for %s in Settings so they count towards your volume.", strings.Join(insights.Untagged, ", "))
	}
	if insights.Bodyweight == nil {
		info("Add your bodyweight to see strength levels.")
	}

	recommendations := append(warnings, infos...)
	if len(warnings) == 0 {
		recommendations = append([]Recommendation{{Kind: "good", Text: "Your training volume looks balanced. Keep it up."}}, recommendations...)
	}
	return recommendations
}

func lastTrainedNote(m MuscleVolume, now time.Time) string {
	if days := daysSince(m.LastTrained, now); days > staleAfterDays {
		return fmt.Sprintf(", last trained %d days ago", days)
	}
	return ""
}

// daysSince returns whole days from date (YYYY-MM-DD) to now, or 0 if date is
// empty or invalid.
func daysSince(date string, now time.Time) int {
	t, err := time.Parse(dateLayout, date)
	if err != nil {
		return 0
	}
	return int(now.Sub(t).Hours() / 24)
}

func sum(values map[string]float64, keys []string) float64 {
	total := 0.0
	for _, k := range keys {
		total += values[k]
	}
	return total
}

func round(v float64, decimals int) float64 {
	p := math.Pow(10, float64(decimals))
	return math.Round(v*p) / p
}

// formatSets prints a number without trailing zeros, e.g. 7.5 or 12.
func formatSets(v float64) string {
	return strings.TrimSuffix(fmt.Sprintf("%.1f", v), ".0")
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
