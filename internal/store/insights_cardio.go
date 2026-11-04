package store

import (
	"fmt"
	"math"
	"slices"
	"time"
)

const (
	// Efficiency needs the heart rate this far above resting to mean much.
	efficiencyMinReserve = 10
	// Readings within this many days back count as a day's resting heart
	// rate.
	restingHRDays = 7

	// Sessions this long, with heart rate samples, are checked for drift.
	driftMinSeconds  = 60 * 60
	driftMinSamples  = 10
	driftShownLatest = 10

	intensityDays = 28

	// Load is compared over the last loadAcuteDays against the weekly
	// average over the last loadChronicDays.
	loadAcuteDays   = 7
	loadChronicDays = 28

	// The resting heart rate now is the average of the last
	// restingNowDays; its baseline that of the restingBaselineDays before,
	// with at least restingBaselineMin readings.
	restingNowDays      = 7
	restingBaselineDays = 30
	restingBaselineMin  = 10

	// A session this long, or burning this much, is a big one.
	bigSessionSeconds = 90 * 60
	bigSessionKcal    = 1000
)

// CardioInsights are deeper insights into endurance training up to Date,
// over the timespan from From (empty for all time) unless a field says
// otherwise.
type CardioInsights struct {
	Date string `json:"date"`
	From string `json:"from,omitempty"`
	// Efficiency is speed per heartbeat above resting, per activity.
	Efficiency []CardioEfficiency `json:"efficiency"`
	// RunWeight splits the running pace trend into fitness and weight.
	RunWeight *RunPaceWeight `json:"run_weight"`
	// Drift is cardiac drift on the latest long sessions, newest first.
	Drift []CardiacDrift `json:"drift"`
	// Intensity is time per heart rate zone over the last 4 weeks.
	Intensity *IntensityDistribution `json:"intensity"`
	// Load compares the last week's load with the last 4 weeks'.
	Load *LoadRamp `json:"load"`
	// Compliance is the active goal's planned sessions by kind, activity
	// and weekday.
	Compliance *SessionCompliance `json:"compliance"`
	RestingHR  *RestingHRTrend    `json:"resting_hr"`
	// Diet compares diet adherence the day after a big session with other
	// days.
	Diet *DietAfterCardio `json:"diet"`
}

// CardioEfficiency is a straight line fitted through the metres covered per
// heartbeat above resting of an activity's Sessions from FirstDate to
// LastDate, giving Start and End.
type CardioEfficiency struct {
	Activity  string  `json:"activity"`
	Sessions  int     `json:"sessions"`
	FirstDate string  `json:"first_date"`
	LastDate  string  `json:"last_date"`
	Start     float64 `json:"start"`
	End       float64 `json:"end"`
}

// RunPaceWeight is the change in running speed over the timespan (from its
// fitted trend) against the change in bodyweight over the same dates. About
// 1% faster for each 1% of bodyweight lost, WeightPct of the speed change
// is down to weight and FitnessPct to the rest.
type RunPaceWeight struct {
	FirstDate       string  `json:"first_date"`
	LastDate        string  `json:"last_date"`
	SpeedChangePct  float64 `json:"speed_change_pct"`
	WeightChangeKg  float64 `json:"weight_change_kg"`
	WeightChangePct float64 `json:"weight_change_pct"`
	WeightPct       float64 `json:"weight_pct"`
	FitnessPct      float64 `json:"fitness_pct"`
}

// CardiacDrift is how much the speed per heartbeat fell from the first
// half of a long session to the second, in percent.
type CardiacDrift struct {
	ID              int     `json:"id"`
	Date            string  `json:"date"`
	Activity        string  `json:"activity"`
	DurationSeconds float64 `json:"duration_seconds"`
	DistanceM       float64 `json:"distance_m"`
	DriftPct        float64 `json:"drift_pct"`
}

// IntensityDistribution is the time in each heart rate zone (seconds, zone
// 1 first) over the cardio sessions with a heart rate since From, and the
// share of it in zones 1 and 2. Unmeasured sessions had no heart rate.
type IntensityDistribution struct {
	From        string    `json:"from"`
	Sessions    int       `json:"sessions"`
	Unmeasured  int       `json:"unmeasured"`
	ZoneSeconds []float64 `json:"zone_seconds"`
	EasyShare   float64   `json:"easy_share"`
}

// LoadRamp is the cardio load (Edwards' TRIMP) over the last 7 days against
// the weekly average of the last 28, and their Ratio, with the bodyweight
// trend over those 28 days. HistoryDays counts the days since the first
// cardio session, up to 28; the average means less with fewer.
type LoadRamp struct {
	Acute            float64  `json:"acute"`
	ChronicWeekly    float64  `json:"chronic_weekly"`
	Ratio            float64  `json:"ratio"`
	HistoryDays      int      `json:"history_days"`
	WeightPerWeekKg  *float64 `json:"weight_per_week_kg,omitempty"`
	WeightPerWeekPct *float64 `json:"weight_per_week_pct,omitempty"`
}

// SessionCompliance counts how the active goal's sessions judged in the
// timespan went, grouped three ways.
type SessionCompliance struct {
	Goal       string            `json:"goal"`
	ByKind     []ComplianceGroup `json:"by_kind"`
	ByActivity []ComplianceGroup `json:"by_activity"`
	ByWeekday  []ComplianceGroup `json:"by_weekday"`
}

// ComplianceGroup counts a group's sessions met, partly met and missed.
type ComplianceGroup struct {
	Key     string `json:"key"`
	Met     int    `json:"met"`
	Partial int    `json:"partial"`
	Missed  int    `json:"missed"`
}

// RestingHRTrend is the average resting heart rate over the last 7 days
// against its baseline, the average of the 30 days before, when there are
// enough readings for one.
type RestingHRTrend struct {
	LatestDate   string   `json:"latest_date"`
	Current      float64  `json:"current"`
	CurrentDays  int      `json:"current_days"`
	Baseline     *float64 `json:"baseline,omitempty"`
	BaselineDays int      `json:"baseline_days"`
}

// DietAfterCardio counts the diet days logged in the timespan the day after
// a big cardio session (90+ minutes or 1000+ kcal) and the others, with
// those missed.
type DietAfterCardio struct {
	BigSessions int       `json:"big_sessions"`
	AfterBig    DietCount `json:"after_big"`
	Other       DietCount `json:"other"`
}

// DietCount is a number of diet days logged and those missed.
type DietCount struct {
	Logged int `json:"logged"`
	Missed int `json:"missed"`
}

// GetCardioInsights works out the CardioInsights up to today (YYYY-MM-DD)
// over the timespan from from.
func (s *Store) GetCardioInsights(today, from string) (CardioInsights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return CardioInsights{}, fmt.Errorf("invalid date %q: %w", today, err)
	}
	if from != "" {
		if _, err := time.Parse(dateLayout, from); err != nil {
			return CardioInsights{}, fmt.Errorf("invalid date %q: %w", from, err)
		}
	}
	cardio, err := s.cardioSamplesBetween("", today)
	if err != nil {
		return CardioInsights{}, err
	}
	zones, err := s.allHeartRateZones()
	if err != nil {
		return CardioInsights{}, err
	}
	resting, err := s.ListRestingHeartRates("", today)
	if err != nil {
		return CardioInsights{}, err
	}
	weights, err := s.ListBodyweight()
	if err != nil {
		return CardioInsights{}, err
	}
	diet, err := s.ListDietDays(from, today)
	if err != nil {
		return CardioInsights{}, err
	}
	compliance, err := s.sessionCompliance(from, today)
	if err != nil {
		return CardioInsights{}, err
	}

	loads := cardioLoads(cardio, zones)
	return CardioInsights{
		Date:       today,
		From:       from,
		Efficiency: cardioEfficiency(cardio, resting, zones, from),
		RunWeight:  runPaceWeight(cardio, weights, from),
		Drift:      cardiacDrift(cardio, from),
		Intensity:  intensityDistribution(loads, zones, now),
		Load:       loadRamp(loads, weights, now),
		Compliance: compliance,
		RestingHR:  restingHRTrend(resting, now),
		Diet:       dietAfterCardio(cardio, diet, from),
	}, nil
}

// restingHROn is the resting heart rate on date: the average of the
// readings over the restingHRDays up to it, else the profile in effect's,
// else 0.
func restingHROn(readings []RestingHeartRate, zones []HeartRateZones, date string) float64 {
	day, ok := dayNumber(date)
	if !ok {
		return 0
	}
	sum, n := 0.0, 0
	for _, r := range readings {
		d, ok := dayNumber(r.Date)
		if ok && d <= day && d > day-restingHRDays {
			sum += r.BPM
			n++
		}
	}
	if n > 0 {
		return sum / float64(n)
	}
	if z := zonesOn(zones, date); z != nil {
		return z.RestingHR
	}
	return 0
}

func cardioEfficiency(cardio []CardioWorkout, resting []RestingHeartRate, zones []HeartRateZones, from string) []CardioEfficiency {
	points := make(map[string][]datePoint)
	dates := make(map[string][2]string)
	for _, w := range cardio {
		if w.Date < from || w.DistanceM == nil || *w.DistanceM <= 0 || w.DurationSeconds <= 0 || w.AvgHeartRate == nil {
			continue
		}
		rest := restingHROn(resting, zones, w.Date)
		reserve := *w.AvgHeartRate - rest
		day, ok := dayNumber(w.Date)
		if rest <= 0 || reserve < efficiencyMinReserve || !ok {
			continue
		}
		speed := *w.DistanceM / w.DurationSeconds
		points[w.Activity] = append(points[w.Activity], datePoint{day, speed * 60 / reserve})
		span, seen := dates[w.Activity]
		if !seen {
			span[0] = w.Date
		}
		span[1] = w.Date
		dates[w.Activity] = span
	}
	out := []CardioEfficiency{}
	for _, activity := range CardioActivities {
		ps := points[activity]
		if len(ps) < cardioProgressSessions {
			continue
		}
		a, b, ok := linearFit(ps)
		if !ok {
			continue
		}
		out = append(out, CardioEfficiency{
			Activity: activity, Sessions: len(ps),
			FirstDate: dates[activity][0], LastDate: dates[activity][1],
			Start: round(a+b*ps[0].day, 3), End: round(a+b*ps[len(ps)-1].day, 3),
		})
	}
	return out
}

func runPaceWeight(cardio []CardioWorkout, weights []BodyweightEntry, from string) *RunPaceWeight {
	var run *CardioProgress
	for _, p := range cardioProgression(cardio, from) {
		if p.Activity == ActivityRunning {
			run = &p
		}
	}
	if run == nil || run.StartSpeed <= 0 {
		return nil
	}
	w0, ok0 := weightNear(weights, run.FirstDate)
	w1, ok1 := weightNear(weights, run.LastDate)
	if !ok0 || !ok1 {
		return nil
	}
	speedPct := (run.EndSpeed/run.StartSpeed - 1) * 100
	weightPct := (w1/w0 - 1) * 100
	return &RunPaceWeight{
		FirstDate: run.FirstDate, LastDate: run.LastDate,
		SpeedChangePct:  round(speedPct, 1),
		WeightChangeKg:  round(w1-w0, 1),
		WeightChangePct: round(weightPct, 1),
		WeightPct:       round(-weightPct, 1),
		FitnessPct:      round(speedPct+weightPct, 1),
	}
}

// halfRatio is the speed per bpm over the samples (oldest first) from t0 up
// to t1 seconds in, or false without the distance and heart rate for one.
func halfRatio(samples []CardioSample, t0, t1 float64) (float64, bool) {
	var first, last *CardioSample
	hrSum, hrN := 0.0, 0
	for i := range samples {
		s := &samples[i]
		if s.T < t0 || s.T >= t1 {
			continue
		}
		if first == nil {
			first = s
		}
		last = s
		if s.HR != nil {
			hrSum += *s.HR
			hrN++
		}
	}
	if first == nil || hrN == 0 || last.T <= first.T || last.D <= first.D {
		return 0, false
	}
	return (last.D - first.D) / (last.T - first.T) / (hrSum / float64(hrN)), true
}

func cardiacDrift(cardio []CardioWorkout, from string) []CardiacDrift {
	out := []CardiacDrift{}
	for i := len(cardio) - 1; i >= 0 && len(out) < driftShownLatest; i-- {
		w := cardio[i]
		if w.Date < from || w.DurationSeconds < driftMinSeconds || len(w.Samples) < driftMinSamples ||
			(w.Activity != ActivityRunning && w.Activity != ActivityCycling) {
			continue
		}
		half := w.DurationSeconds / 2
		first, ok1 := halfRatio(w.Samples, 0, half)
		second, ok2 := halfRatio(w.Samples, half, math.Inf(1))
		if !ok1 || !ok2 {
			continue
		}
		out = append(out, CardiacDrift{
			ID: w.ID, Date: w.Date, Activity: w.Activity,
			DurationSeconds: w.DurationSeconds, DistanceM: deref(w.DistanceM),
			DriftPct: round((first-second)/first*100, 1),
		})
	}
	return out
}

func intensityDistribution(loads []cardioLoad, zones []HeartRateZones, now time.Time) *IntensityDistribution {
	if len(zones) == 0 {
		return nil
	}
	from := now.AddDate(0, 0, 1-intensityDays).Format(dateLayout)
	d := &IntensityDistribution{From: from, ZoneSeconds: make([]float64, 5)}
	total := 0.0
	for _, l := range loads {
		if l.workout.Date < from {
			continue
		}
		if !l.hrKnown {
			d.Unmeasured++
			continue
		}
		d.Sessions++
		for z, seconds := range l.zoneSeconds {
			d.ZoneSeconds[z] += seconds
			total += seconds
		}
	}
	for z := range d.ZoneSeconds {
		d.ZoneSeconds[z] = math.Round(d.ZoneSeconds[z])
	}
	if total > 0 {
		d.EasyShare = round((d.ZoneSeconds[0]+d.ZoneSeconds[1])/total, 3)
	}
	return d
}

func loadRamp(loads []cardioLoad, weights []BodyweightEntry, now time.Time) *LoadRamp {
	acuteFrom := now.AddDate(0, 0, 1-loadAcuteDays).Format(dateLayout)
	chronicFrom := now.AddDate(0, 0, 1-loadChronicDays).Format(dateLayout)
	r := &LoadRamp{}
	chronic := 0.0
	for _, l := range loads {
		if l.workout.Date < chronicFrom {
			continue
		}
		chronic += l.load
		if l.workout.Date >= acuteFrom {
			r.Acute += l.load
		}
	}
	if chronic == 0 {
		return nil
	}
	r.HistoryDays = loadChronicDays
	if first, err := time.Parse(dateLayout, loads[0].workout.Date); err == nil {
		r.HistoryDays = min(loadChronicDays, int(now.Sub(first).Hours()/24)+1)
	}
	r.Acute = round(r.Acute, 0)
	r.ChronicWeekly = round(chronic/(loadChronicDays/7), 0)
	r.Ratio = round(r.Acute/(chronic/(loadChronicDays/7)), 2)
	if trend := weightTrendAt(weights, now.Format(dateLayout), loadChronicDays); trend != nil && trend.Weight > 0 {
		kg, pct := trend.PerWeekKg, round(trend.PerWeekKg/trend.Weight*100, 2)
		r.WeightPerWeekKg, r.WeightPerWeekPct = &kg, &pct
	}
	return r
}

// sessionCompliance groups the active goal's sessions judged from from to
// today, or is nil without an active goal.
func (s *Store) sessionCompliance(from, today string) (*SessionCompliance, error) {
	goal, err := s.ActiveGoal()
	if err != nil || goal == nil {
		return nil, err
	}
	sessions, err := s.GoalSessions(goal.ID, from, today, today)
	if err != nil {
		return nil, err
	}
	c := &SessionCompliance{Goal: goal.Name}
	groups := []struct {
		list *[]ComplianceGroup
		key  func(PlannedSession) string
	}{
		{&c.ByKind, func(p PlannedSession) string { return p.Kind }},
		{&c.ByActivity, func(p PlannedSession) string { return p.Activity }},
		{&c.ByWeekday, func(p PlannedSession) string {
			date, _ := time.Parse(dateLayout, p.Date)
			return weekdayNames[isoWeekday(date.Weekday())-1]
		}},
	}
	for _, g := range groups {
		*g.list = []ComplianceGroup{}
		index := make(map[string]int)
		for _, p := range sessions {
			status := p.Verdict.Status
			if status != VerdictMet && status != VerdictPartial && status != VerdictMissed {
				continue
			}
			key := g.key(p)
			i, ok := index[key]
			if !ok {
				i = len(*g.list)
				index[key] = i
				*g.list = append(*g.list, ComplianceGroup{Key: key})
			}
			group := &(*g.list)[i]
			switch status {
			case VerdictMet:
				group.Met++
			case VerdictPartial:
				group.Partial++
			case VerdictMissed:
				group.Missed++
			}
		}
	}
	// Weekdays in week order rather than first seen.
	slices.SortFunc(c.ByWeekday, func(a, b ComplianceGroup) int {
		return slices.Index(weekdayNames, a.Key) - slices.Index(weekdayNames, b.Key)
	})
	return c, nil
}

func restingHRTrend(readings []RestingHeartRate, now time.Time) *RestingHRTrend {
	nowFrom := now.AddDate(0, 0, 1-restingNowDays).Format(dateLayout)
	baseFrom := now.AddDate(0, 0, 1-restingNowDays-restingBaselineDays).Format(dateLayout)
	today := now.Format(dateLayout)
	t := &RestingHRTrend{}
	var current, baseline float64
	for _, r := range readings {
		switch {
		case r.Date > today || r.Date < baseFrom:
		case r.Date >= nowFrom:
			current += r.BPM
			t.CurrentDays++
			t.LatestDate = r.Date
		default:
			baseline += r.BPM
			t.BaselineDays++
		}
	}
	if t.CurrentDays == 0 {
		return nil
	}
	t.Current = round(current/float64(t.CurrentDays), 1)
	if t.BaselineDays >= restingBaselineMin {
		b := round(baseline/float64(t.BaselineDays), 1)
		t.Baseline = &b
	}
	return t
}

func dietAfterCardio(cardio []CardioWorkout, diet []DietDay, from string) *DietAfterCardio {
	if len(diet) == 0 {
		return nil
	}
	d := &DietAfterCardio{}
	bigDays := make(map[string]bool)
	for _, w := range cardio {
		if w.DurationSeconds < bigSessionSeconds && deref(w.EnergyKcal) < bigSessionKcal {
			continue
		}
		bigDays[w.Date] = true
		if w.Date >= from {
			d.BigSessions++
		}
	}
	for _, day := range diet {
		n, ok := dayNumber(day.Date)
		if !ok {
			continue
		}
		count := &d.Other
		if bigDays[dateOfDay(n-1)] {
			count = &d.AfterBig
		}
		count.Logged++
		if !day.Adhered {
			count.Missed++
		}
	}
	return d
}
