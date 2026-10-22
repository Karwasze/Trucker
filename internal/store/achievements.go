package store

import (
	"database/sql"
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

// distanceTolerance is the share of a distance a workout may fall short by
// and still count as covering it, as GPS often measures a little short.
const distanceTolerance = 0.01

// paceLadders are the timed distances (m) with their tiers' target times
// (s), slowest first.
var paceLadders = []struct {
	activity string
	metres   float64
	name     string
	targets  []float64
}{
	{ActivityRunning, 5000, "5 km run", []float64{30 * 60, 25 * 60, 20 * 60}},
	{ActivityRunning, 10000, "10 km run", []float64{60 * 60, 50 * 60, 40 * 60}},
	{ActivityRunning, 21097.5, "Half marathon", []float64{135 * 60, 110 * 60, 90 * 60}},
	{ActivityRunning, 42195, "Marathon", []float64{270 * 60, 225 * 60, 180 * 60}},
	{ActivityCycling, 20000, "20 km ride", []float64{50 * 60, 40 * 60, 32 * 60}},
	{ActivityCycling, 40000, "40 km ride", []float64{100 * 60, 80 * 60, 65 * 60}},
	{ActivitySwimming, 400, "400 m swim", []float64{12 * 60, 9 * 60, 7 * 60}},
	{ActivitySwimming, 1500, "1.5 km swim", []float64{45 * 60, 35 * 60, 27 * 60}},
}

// distanceTier is a distance (m) to cover in one workout, named when it's
// a race distance.
type distanceTier struct {
	metres float64
	name   string
}

// distanceLadders are the distances to cover per activity, shortest first.
var distanceLadders = []struct {
	activity string
	title    string
	tiers    []distanceTier
}{
	{ActivityRunning, "Longest run", []distanceTier{{5000, ""}, {10000, ""}, {21097.5, "Half marathon"}, {42195, "Marathon"}}},
	{ActivityCycling, "Longest ride", []distanceTier{{40000, ""}, {90000, ""}, {180000, ""}}},
	{ActivitySwimming, "Longest swim", []distanceTier{{750, ""}, {1500, ""}, {1900, ""}, {3800, ""}}},
}

// triathlonTierNames name the triathlon classes of triathlonStandards.
var triathlonTierNames = map[string]string{
	TriathlonSprint:  "Sprint",
	TriathlonQuarter: "Quarter Ironman",
	TriathlonHalf:    "Half Ironman",
	TriathlonFull:    "Ironman",
}

// ListAchievements works out every achievement from the logged workouts and
// bodyweight: pace over set distances (the fastest stretch of any workout),
// the longest workouts, triathlons and strength levels for bodyweight. Each
// tier is earned on the first day its target was met.
func (s *Store) ListAchievements() ([]Achievement, error) {
	cardio, err := s.cardioWithSamples()
	if err != nil {
		return nil, err
	}
	sets, err := s.setsBetween("", "9999-12-31")
	if err != nil {
		return nil, err
	}
	bodyweight, err := s.ListBodyweight()
	if err != nil {
		return nil, err
	}

	var list []Achievement
	for _, ladder := range paceLadders {
		list = append(list, paceAchievement(cardio, ladder.activity, ladder.metres, ladder.name, ladder.targets))
	}
	for _, ladder := range distanceLadders {
		list = append(list, distanceAchievement(cardio, ladder.activity, ladder.title, ladder.tiers))
	}
	list = append(list, triathlonAchievement(triathlons(cardio)))
	for _, standard := range strengthStandards {
		list = append(list, strengthAchievement(sets, bodyweight, standard.exercise, standard.ratios))
	}
	return list, nil
}

// cardioWithSamples returns the runs, rides and swims with their samples,
// oldest first.
func (s *Store) cardioWithSamples() ([]CardioWorkout, error) {
	rows, err := s.db.Query(`SELECT `+cardioColumns+`, samples FROM cardio_workouts
		WHERE activity IN (?, ?, ?)
		ORDER BY started_at, id`, ActivityRunning, ActivityCycling, ActivitySwimming)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workouts []CardioWorkout
	for rows.Next() {
		var samples sql.NullString
		w, err := scanCardioWorkout(rows, &samples)
		if err != nil {
			return nil, err
		}
		if samples.Valid {
			if err := json.Unmarshal([]byte(samples.String), &w.Samples); err != nil {
				return nil, err
			}
		}
		workouts = append(workouts, w)
	}
	return workouts, rows.Err()
}

func paceAchievement(cardio []CardioWorkout, activity string, metres float64, name string, targets []float64) Achievement {
	a := Achievement{
		ID:       "pace-" + activity + "-" + strconv.FormatFloat(metres, 'f', -1, 64),
		Category: AchievementPace,
		Title:    name,
		Activity: activity,
		Distance: metres,
		Tiers:    make([]AchievementTier, len(targets)),
	}
	for i, target := range targets {
		a.Tiers[i].Target = target
	}
	for _, w := range cardio {
		if w.Activity != activity {
			continue
		}
		seconds, ok := bestEffort(w, metres)
		if !ok {
			continue
		}
		if a.Best == nil || seconds < *a.Best {
			a.Best = &seconds
		}
		for i := range a.Tiers {
			if a.Tiers[i].EarnedOn == "" && seconds < a.Tiers[i].Target {
				a.Tiers[i].EarnedOn, a.Tiers[i].WorkoutID = w.Date, w.ID
			}
		}
	}
	if a.Best != nil {
		*a.Best = math.Round(*a.Best)
	}
	return a
}

// bestEffort is the fastest time (s) a workout covered metres in: its
// fastest stretch from the samples, or else its average pace, which is no
// faster than its fastest stretch. A workout a little short of metres
// counts at its average pace.
func bestEffort(w CardioWorkout, metres float64) (float64, bool) {
	if seconds, ok := bestSegment(w.Samples, metres); ok {
		return seconds, true
	}
	distance := deref(w.DistanceM)
	if distance <= 0 || distance < metres*(1-distanceTolerance) {
		return 0, false
	}
	return w.DurationSeconds * metres / distance, true
}

// bestSegment is the shortest time (s) between two points of samples
// metres apart, interpolating where the stretch starts between samples.
func bestSegment(samples []CardioSample, metres float64) (float64, bool) {
	best, found := math.Inf(1), false
	i := 0
	for j := 1; j < len(samples); j++ {
		end := samples[j]
		// The stretch starts after samples[i] and no later than samples[i+1].
		for i+1 < j && samples[i+1].D <= end.D-metres {
			i++
		}
		if end.D-samples[i].D < metres {
			continue
		}
		start := samples[i].T
		if next := samples[i+1]; next.D > samples[i].D {
			start += (end.D - metres - samples[i].D) / (next.D - samples[i].D) * (next.T - samples[i].T)
		}
		best, found = math.Min(best, end.T-start), true
	}
	return best, found
}

func distanceAchievement(cardio []CardioWorkout, activity, title string, tiers []distanceTier) Achievement {
	a := Achievement{
		ID:       "distance-" + activity,
		Category: AchievementDistance,
		Title:    title,
		Activity: activity,
		Tiers:    make([]AchievementTier, len(tiers)),
	}
	for i, tier := range tiers {
		a.Tiers[i] = AchievementTier{Name: tier.name, Target: tier.metres}
	}
	for _, w := range cardio {
		distance := deref(w.DistanceM)
		if w.Activity != activity || distance <= 0 {
			continue
		}
		if a.Best == nil || distance > *a.Best {
			a.Best = &distance
		}
		for i := range a.Tiers {
			if a.Tiers[i].EarnedOn == "" && distance >= a.Tiers[i].Target*(1-distanceTolerance) {
				a.Tiers[i].EarnedOn, a.Tiers[i].WorkoutID = w.Date, w.ID
			}
		}
	}
	return a
}

// triathlonAchievement has a tier per class, earned by a triathlon of that
// class or a longer one.
func triathlonAchievement(tris []Triathlon) Achievement {
	a := Achievement{
		ID:       "triathlon",
		Category: AchievementTriathlon,
		Title:    "Triathlon",
		Tiers:    make([]AchievementTier, len(triathlonStandards)),
	}
	for i, standard := range triathlonStandards {
		a.Tiers[i] = AchievementTier{
			Name:   triathlonTierNames[standard.class],
			Target: standard.swim + standard.bike + standard.run,
		}
	}
	for _, tri := range tris {
		class := -1
		for i, standard := range triathlonStandards {
			if standard.class == tri.Class {
				class = i
			}
		}
		for i := 0; i <= class; i++ {
			if a.Tiers[i].EarnedOn == "" {
				a.Tiers[i].EarnedOn = tri.Date
			}
		}
	}
	return a
}

// strengthAchievement has a tier per strength level above beginner, earned
// by an estimated 1RM of the level's ratio to the bodyweight at the time:
// the latest entry on or before the workout, or the first one for workouts
// before it. Best is the best ratio.
func strengthAchievement(sets []insightSet, bodyweight []BodyweightEntry, exercise string, ratios []float64) Achievement {
	a := Achievement{
		ID:       "strength-" + slug(exercise),
		Category: AchievementStrength,
		Title:    exercise,
		Activity: exercise,
		Tiers:    make([]AchievementTier, len(ratios)-1),
	}
	for i := range a.Tiers {
		a.Tiers[i] = AchievementTier{Name: capitalize(strengthLevelNames[i+1]), Target: ratios[i+1]}
	}
	if len(bodyweight) == 0 {
		return a
	}
	entry := 0
	for _, set := range sets {
		if set.exercise != exercise {
			continue
		}
		oneRM := estimated1RM(set.Set)
		if oneRM == 0 {
			continue
		}
		for entry+1 < len(bodyweight) && bodyweight[entry+1].Date <= set.date {
			entry++
		}
		weight := bodyweight[entry].Weight
		ratio := round(oneRM/weight, 2)
		if a.Best == nil || ratio > *a.Best {
			a.Best = &ratio
		}
		for i := range a.Tiers {
			if a.Tiers[i].EarnedOn == "" && oneRM >= a.Tiers[i].Target*weight {
				a.Tiers[i].EarnedOn, a.Tiers[i].WorkoutID = set.date, set.workoutID
			}
		}
	}
	return a
}

// slug lowercases s and joins its words with dashes, for IDs.
func slug(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), "-")
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
