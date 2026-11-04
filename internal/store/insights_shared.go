package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"slices"
	"time"
)

// Helpers shared by the strength, cardio and bodyweight insights.

const (
	// The smoothed bodyweight trend is fitted over this many days of
	// weigh-ins.
	weightTrendDays = 28
	// A trend needs this many weigh-ins, at least weightTrendMinSpan days
	// apart, so a single heavy day doesn't set it.
	weightTrendMinWeighins = 3
	weightTrendMinSpan     = 10
	// A weight is only interpolated from weigh-ins this close to its date.
	weightNearDays = 14
)

// Cardio sessions count as hard when their load is in the top
// hardLoadPercentile of sessions, they last hardMinSeconds, or they spend
// hardZoneSeconds in zones 4 and 5. Walks and hikes never do.
const (
	hardLoadPercentile = 0.75
	// Below this many sessions with a heart rate, the percentile says
	// little, so only duration and time in zones 4–5 count.
	hardLoadMinSessions = 4
	hardMinSeconds      = 90 * 60
	hardZoneSeconds     = 20 * 60
)

// datePoint is a value on a day, counted in days since the Unix epoch.
type datePoint struct{ day, v float64 }

// dayNumber is the days from the Unix epoch to date (YYYY-MM-DD).
func dayNumber(date string) (float64, bool) {
	t, err := time.Parse(dateLayout, date)
	if err != nil {
		return 0, false
	}
	return float64(t.Unix() / 86400), true
}

// dateOfDay is the date dayNumber gives day for.
func dateOfDay(day float64) string {
	return time.Unix(int64(math.Round(day))*86400, 0).UTC().Format(dateLayout)
}

// linearFit fits v = a + b·day by least squares, or reports false for
// fewer than two points or all on one day.
func linearFit(ps []datePoint) (a, b float64, ok bool) {
	if len(ps) < 2 {
		return 0, 0, false
	}
	var meanDay, meanV float64
	for _, p := range ps {
		meanDay += p.day
		meanV += p.v
	}
	n := float64(len(ps))
	meanDay, meanV = meanDay/n, meanV/n
	var cov, variance float64
	for _, p := range ps {
		cov += (p.day - meanDay) * (p.v - meanV)
		variance += (p.day - meanDay) * (p.day - meanDay)
	}
	if variance == 0 {
		return 0, 0, false
	}
	b = cov / variance
	return meanV - b*meanDay, b, true
}

// WeightTrend is bodyweight smoothed by a straight line through the
// weigh-ins from From to To: Weight on To and the change per week.
type WeightTrend struct {
	From      string  `json:"from"`
	To        string  `json:"to"`
	Weighins  int     `json:"weighins"`
	Weight    float64 `json:"weight"`
	PerWeekKg float64 `json:"per_week_kg"`
}

// perDay is the trend's change per day.
func (t WeightTrend) perDay() float64 { return t.PerWeekKg / 7 }

// weightTrendAt fits the weigh-ins (oldest first) over the days days up to
// end, or returns nil without weightTrendMinWeighins over
// weightTrendMinSpan days.
func weightTrendAt(entries []BodyweightEntry, end string, days int) *WeightTrend {
	endDay, ok := dayNumber(end)
	if !ok {
		return nil
	}
	var ps []datePoint
	var first, last string
	for _, e := range entries {
		day, ok := dayNumber(e.Date)
		if !ok || day > endDay || day <= endDay-float64(days) {
			continue
		}
		if first == "" {
			first = e.Date
		}
		last = e.Date
		ps = append(ps, datePoint{day, e.Weight})
	}
	if len(ps) < weightTrendMinWeighins || ps[len(ps)-1].day-ps[0].day < weightTrendMinSpan {
		return nil
	}
	a, b, ok := linearFit(ps)
	if !ok {
		return nil
	}
	lastDay := ps[len(ps)-1].day
	return &WeightTrend{
		From: first, To: last, Weighins: len(ps),
		Weight: round(a+b*lastDay, 1), PerWeekKg: round(b*7, 2),
	}
}

// weightNear is the bodyweight on date, interpolated between the weigh-ins
// around it (oldest first), or the nearest one within weightNearDays when
// it's only on one side; false without any that close.
func weightNear(entries []BodyweightEntry, date string) (float64, bool) {
	day, ok := dayNumber(date)
	if !ok {
		return 0, false
	}
	var before, after *datePoint
	for _, e := range entries {
		d, ok := dayNumber(e.Date)
		if !ok {
			continue
		}
		p := datePoint{d, e.Weight}
		if d <= day {
			before = &p
		} else if after == nil {
			after = &p
		}
	}
	near := func(p *datePoint) bool { return p != nil && math.Abs(p.day-day) <= weightNearDays }
	switch {
	case near(before) && near(after):
		share := (day - before.day) / (after.day - before.day)
		return before.v + share*(after.v-before.v), true
	case near(before):
		return before.v, true
	case near(after):
		return after.v, true
	}
	return 0, false
}

// liftSession is a session of a weighted lift: its date, day number, best
// estimated 1RM and sets.
type liftSession struct {
	date string
	day  float64
	best float64
	sets []Set
}

// liftSessions groups sets by lift into sessions, oldest first, leaving out
// sessions without a weighted set.
func liftSessions(sets []insightSet) map[string][]liftSession {
	byLift := make(map[string][]liftSession)
	for name, h := range histories(sets) {
		for i, s := range h.sessions {
			best := best1RM(s)
			day, ok := dayNumber(h.dates[i])
			if best == 0 || !ok {
				continue
			}
			byLift[name] = append(byLift[name], liftSession{h.dates[i], day, best, s})
		}
	}
	return byLift
}

// sessionChange is how a lift's session at index i compared with the
// sessions before it: its best estimated 1RM against the average of up to
// three before, as a percentage, or false for the first session.
func sessionChange(sessions []liftSession, i int) (float64, bool) {
	if i == 0 {
		return 0, false
	}
	sum, n := 0.0, 0
	for j := i - 1; j >= 0 && n < 3; j-- {
		sum += sessions[j].best
		n++
	}
	return (sessions[i].best/(sum/float64(n)) - 1) * 100, true
}

// cardioLoad is a cardio workout's training load: Edwards' TRIMP, the
// minutes in each heart rate zone times the zone number, with the time in
// each zone (seconds, zone 1 first). Without any heart rate, its minutes
// count as zone 2 and hrKnown is false.
type cardioLoad struct {
	workout     CardioWorkout
	zoneSeconds [5]float64
	hrKnown     bool
	load        float64
	hard        bool
}

// cardioSamplesBetween returns the cardio workouts after start and up to end
// (YYYY-MM-DD), oldest first, with their samples but not their laps.
func (s *Store) cardioSamplesBetween(start, end string) ([]CardioWorkout, error) {
	rows, err := s.db.Query(`SELECT `+cardioColumns+`, samples FROM cardio_workouts
		WHERE date > ? AND date <= ?
		ORDER BY started_at, id`, start, end)
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
		scaleToManualDistance(&w)
		workouts = append(workouts, w)
	}
	return workouts, rows.Err()
}

// cardioLoads works out each workout's load, with the zones of its day, and
// marks the hard ones.
func cardioLoads(workouts []CardioWorkout, zones []HeartRateZones) []cardioLoad {
	loads := make([]cardioLoad, len(workouts))
	var known []float64
	for i, w := range workouts {
		l := cardioLoad{workout: w}
		if z := zonesOn(zones, w.Date); z != nil {
			l.zoneSeconds, l.hrKnown = timeInZones(w, z.Zones)
		}
		if l.hrKnown {
			for zone, seconds := range l.zoneSeconds {
				l.load += seconds / 60 * float64(zone+1)
			}
			known = append(known, l.load)
		} else {
			l.load = w.DurationSeconds / 60 * 2
		}
		l.load = round(l.load, 1)
		loads[i] = l
	}

	threshold := math.Inf(1)
	if len(known) >= hardLoadMinSessions {
		slices.Sort(known)
		threshold = known[int(math.Floor(hardLoadPercentile*float64(len(known)-1)))]
	}
	for i := range loads {
		l := &loads[i]
		if l.workout.Activity == ActivityWalking || l.workout.Activity == ActivityHiking {
			continue
		}
		l.hard = (l.hrKnown && l.load >= threshold) ||
			l.workout.DurationSeconds >= hardMinSeconds ||
			l.zoneSeconds[3]+l.zoneSeconds[4] >= hardZoneSeconds
	}
	return loads
}

// timeInZones splits a workout's time across heart rate zones by its
// samples' heart rates, each sample lasting until the next, or puts it all
// in the zone of its average heart rate when no sample has one. It reports
// false without any heart rate.
func timeInZones(w CardioWorkout, zones []HeartRateZone) ([5]float64, bool) {
	var seconds [5]float64
	measured := false
	for i, s := range w.Samples {
		if s.HR == nil {
			continue
		}
		end := w.DurationSeconds
		if i+1 < len(w.Samples) {
			end = w.Samples[i+1].T
		}
		if end <= s.T {
			continue
		}
		seconds[zoneOf(zones, *s.HR)-1] += end - s.T
		measured = true
	}
	if measured {
		return seconds, true
	}
	if w.AvgHeartRate != nil && *w.AvgHeartRate > 0 {
		seconds[zoneOf(zones, *w.AvgHeartRate)-1] = w.DurationSeconds
		return seconds, true
	}
	return seconds, false
}

// trainingDay is a day training was scheduled, by the plan or the active
// goal, and whether it was skipped.
type trainingDay struct {
	date    string
	skipped bool
}

// scheduledTraining lists the days from from (YYYY-MM-DD, "" for all time)
// up to today the plan scheduled lifting, from its first logged workout, and
// the active goal's sessions already judged, oldest first. A day with both
// is listed once, skipped if either was. planID 0 or an unknown plan leaves
// lifting out.
func (s *Store) scheduledTraining(planID int, from string, now time.Time) ([]trainingDay, error) {
	today := now.Format(dateLayout)
	skipped := make(map[string]bool)

	if planID != 0 {
		plan, err := getPlan(s.db, planID)
		switch {
		case errors.Is(err, ErrPlanNotFound):
		case err != nil:
			return nil, err
		default:
			a, err := s.adherence(plan, from, now)
			if err != nil {
				return nil, err
			}
			if a.Since != "" {
				trained, err := s.planWorkoutDates(plan.ID, today)
				if err != nil {
					return nil, err
				}
				scheduled := make(map[string]bool)
				for _, day := range plan.Days {
					scheduled[day.Weekday] = len(day.Exercises) > 0
				}
				start, _ := time.Parse(dateLayout, a.Since)
				for d := start; !d.After(now); d = d.AddDate(0, 0, 1) {
					date := d.Format(dateLayout)
					if !scheduled[weekdayNames[isoWeekday(d.Weekday())-1]] || (date == today && !trained[date]) {
						continue
					}
					skipped[date] = skipped[date] || !trained[date]
				}
			}
		}
	}

	goal, err := s.ActiveGoal()
	if err != nil {
		return nil, err
	}
	if goal != nil {
		sessions, err := s.GoalSessions(goal.ID, from, today, today)
		if err != nil {
			return nil, err
		}
		for _, session := range sessions {
			switch session.Verdict.Status {
			case VerdictMet, VerdictPartial, VerdictMissed:
				skipped[session.Date] = skipped[session.Date] || session.Verdict.Status == VerdictMissed
			}
		}
	}

	days := make([]trainingDay, 0, len(skipped))
	for date, skip := range skipped {
		days = append(days, trainingDay{date, skip})
	}
	slices.SortFunc(days, func(a, b trainingDay) int {
		if a.date < b.date {
			return -1
		}
		if a.date > b.date {
			return 1
		}
		return 0
	})
	return days, nil
}
