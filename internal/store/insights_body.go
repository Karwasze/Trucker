package store

import (
	"fmt"
	"math"
	"time"
)

const (
	// Projections to a target weight further out than this aren't shown.
	weightProjectionMaxDays = 2 * 365
	// Within this much of the target, it counts as reached.
	weightReachedKg = 0.2

	// Weeks of diet and weight compared for how weight responds to
	// adherence; a week needs dietWeekMinLogged days logged to count.
	dietWeeks         = 26
	dietWeekMinLogged = 5

	// Skipped training is set against the diet over this many days.
	slipDays = 90
)

// BodyInsights are deeper insights into bodyweight and diet up to Date.
type BodyInsights struct {
	Date string `json:"date"`
	// Rate is the smoothed rate of change over the last 4 weeks.
	Rate *LossRate `json:"rate"`
	// Projection is when the target weight is reached, nil without one.
	Projection *WeightProjection `json:"projection"`
	// Adherence groups past weeks by days kept to, with the weight change.
	Adherence []AdherenceWeeks `json:"adherence"`
	// Slips sets diet misses against skipped training.
	Slips *HabitSlips `json:"slips"`
}

// LossRate is the bodyweight trend with its change per week as a share of
// bodyweight, in percent.
type LossRate struct {
	WeightTrend
	PerWeekPct float64 `json:"per_week_pct"`
}

// WeightProjection is when the trend reaches TargetKg: Date, or empty when
// it isn't heading there within two years, and the active goal's race when
// one is coming up. CurrentKg and PerWeekKg are the trend's, nil without
// one.
type WeightProjection struct {
	TargetKg  float64  `json:"target_kg"`
	CurrentKg *float64 `json:"current_kg,omitempty"`
	PerWeekKg *float64 `json:"per_week_kg,omitempty"`
	Reached   bool     `json:"reached,omitempty"`
	Date      string   `json:"date,omitempty"`
	RaceName  string   `json:"race_name,omitempty"`
	RaceDate  string   `json:"race_date,omitempty"`
}

// AdherenceWeeks is the average change in a week's average weigh-in from
// the week before, over the Weeks with Group ("6–7", "4–5" or "0–3") days
// kept to the diet.
type AdherenceWeeks struct {
	Group       string  `json:"group"`
	Weeks       int     `json:"weeks"`
	AvgChangeKg float64 `json:"avg_change_kg"`
}

// HabitSlips counts, over the last 90 days, the days training was
// scheduled but skipped, how many of them had the diet logged and missed,
// and the same for the other days logged.
type HabitSlips struct {
	SkippedDays int       `json:"skipped_days"`
	Skipped     DietCount `json:"skipped"`
	Other       DietCount `json:"other"`
}

// GetBodyInsights works out the BodyInsights up to today (YYYY-MM-DD),
// with the plan planID (0 for none) for skipped training.
func (s *Store) GetBodyInsights(today string, planID int) (BodyInsights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return BodyInsights{}, fmt.Errorf("invalid date %q: %w", today, err)
	}
	weights, err := s.ListBodyweight()
	if err != nil {
		return BodyInsights{}, err
	}
	diet, err := s.ListDietDays("", today)
	if err != nil {
		return BodyInsights{}, err
	}
	target, err := s.TargetWeight()
	if err != nil {
		return BodyInsights{}, err
	}
	goal, err := s.ActiveGoal()
	if err != nil {
		return BodyInsights{}, err
	}
	slipsFrom := now.AddDate(0, 0, 1-slipDays).Format(dateLayout)
	training, err := s.scheduledTraining(planID, slipsFrom, now)
	if err != nil {
		return BodyInsights{}, err
	}

	trend := weightTrendAt(weights, today, weightTrendDays)
	insights := BodyInsights{
		Date:      today,
		Adherence: adherenceWeeks(weights, diet, now),
		Slips:     habitSlips(training, diet, slipsFrom),
	}
	if trend != nil {
		insights.Rate = &LossRate{WeightTrend: *trend, PerWeekPct: round(trend.PerWeekKg/trend.Weight*100, 2)}
	}
	if target != nil {
		insights.Projection = weightProjection(*target, trend, goal, now)
	}
	return insights, nil
}

func weightProjection(target float64, trend *WeightTrend, goal *Goal, now time.Time) *WeightProjection {
	p := &WeightProjection{TargetKg: target}
	today := now.Format(dateLayout)
	if goal != nil && goal.RaceDate >= today {
		p.RaceName, p.RaceDate = goal.Name, goal.RaceDate
	}
	if trend == nil {
		return p
	}
	current, perWeek := trend.Weight, trend.PerWeekKg
	p.CurrentKg, p.PerWeekKg = &current, &perWeek
	remaining := target - current
	if math.Abs(remaining) <= weightReachedKg {
		p.Reached = true
		return p
	}
	perDay := trend.perDay()
	if perDay == 0 || (remaining > 0) != (perDay > 0) {
		return p
	}
	// From the last weigh-in the trend is fitted to.
	days := math.Ceil(remaining / perDay)
	last, err := time.Parse(dateLayout, trend.To)
	if err != nil || days > weightProjectionMaxDays {
		return p
	}
	if date := last.AddDate(0, 0, int(days)); !date.Before(now) {
		p.Date = date.Format(dateLayout)
	} else {
		p.Date = today
	}
	return p
}

// adherenceGroup names the group of a week with adhered days kept to.
func adherenceGroup(adhered int) string {
	switch {
	case adhered >= 6:
		return "6–7"
	case adhered >= 4:
		return "4–5"
	default:
		return "0–3"
	}
}

func adherenceWeeks(weights []BodyweightEntry, diet []DietDay, now time.Time) []AdherenceWeeks {
	thisWeek := weekStart(now)
	first := thisWeek.AddDate(0, 0, -7*(dietWeeks+1))
	// Average weigh-in and diet days per week, by the week's Monday.
	type week struct {
		sum             float64
		weighins        int
		logged, adhered int
	}
	weeks := make(map[string]*week)
	at := func(date string) *week {
		d, err := time.Parse(dateLayout, date)
		if err != nil || d.Before(first) || !d.Before(thisWeek) {
			return nil
		}
		key := weekStart(d).Format(dateLayout)
		if weeks[key] == nil {
			weeks[key] = &week{}
		}
		return weeks[key]
	}
	for _, e := range weights {
		if w := at(e.Date); w != nil {
			w.sum += e.Weight
			w.weighins++
		}
	}
	for _, d := range diet {
		if w := at(d.Date); w != nil {
			w.logged++
			if d.Adhered {
				w.adhered++
			}
		}
	}

	sums := make(map[string]float64)
	counts := make(map[string]int)
	for monday := first.AddDate(0, 0, 7); monday.Before(thisWeek); monday = monday.AddDate(0, 0, 7) {
		w, prev := weeks[monday.Format(dateLayout)], weeks[monday.AddDate(0, 0, -7).Format(dateLayout)]
		if w == nil || prev == nil || w.logged < dietWeekMinLogged || w.weighins == 0 || prev.weighins == 0 {
			continue
		}
		group := adherenceGroup(w.adhered)
		sums[group] += w.sum/float64(w.weighins) - prev.sum/float64(prev.weighins)
		counts[group]++
	}
	out := []AdherenceWeeks{}
	for _, group := range []string{"6–7", "4–5", "0–3"} {
		if counts[group] > 0 {
			out = append(out, AdherenceWeeks{Group: group, Weeks: counts[group], AvgChangeKg: round(sums[group]/float64(counts[group]), 2)})
		}
	}
	return out
}

func habitSlips(training []trainingDay, diet []DietDay, from string) *HabitSlips {
	if len(training) == 0 {
		return nil
	}
	skipped := make(map[string]bool)
	slips := &HabitSlips{}
	for _, d := range training {
		if d.skipped && d.date >= from {
			skipped[d.date] = true
			slips.SkippedDays++
		}
	}
	for _, d := range diet {
		if d.Date < from {
			continue
		}
		count := &slips.Other
		if skipped[d.Date] {
			count = &slips.Skipped
		}
		count.Logged++
		if !d.Adhered {
			count.Missed++
		}
	}
	return slips
}
