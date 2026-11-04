package store

import (
	"cmp"
	"fmt"
	"maps"
	"math"
	"slices"
	"time"
)

const (
	// A lift needs this many sessions over projectionMinDays in the
	// timespan for a strength trend to project from.
	projectionMinSessions = 3
	projectionMinDays     = 14
	// Projections further out than this aren't worth showing.
	projectionMaxDays = 3 * 365

	// Plateaus are looked for over the last plateauDays, in lifts with
	// plateauMinSessions there over plateauMinSpan days, still trained in the
	// last plateauRecentDays.
	plateauDays        = 56
	plateauMinSessions = 4
	plateauMinSpan     = 28
	plateauRecentDays  = 14
	// A lift whose fitted est. 1RM rose less than this share over the window
	// is flat; falling more than plateauDeclining, it's declining.
	plateauRise      = 0.01
	plateauDeclining = -0.025

	// A lift this far below the others, relative to typical ratios, is the
	// weak link.
	weakLinkBelow = -0.1

	// Bodyweight has to drop by this share for a verdict on muscle.
	cuttingBelowPct = -1.0
	// Lifts holding within this share count as kept.
	strengthHeldPct = -1.0

	// Rep drops are compared over the last fatigueRecent sessions against
	// up to as many before; a lift needs fatigueMinSessions of them.
	fatigueRecent      = 3
	fatigueMinSessions = 4
	// Losing this many more reps from first to last set than before counts
	// as growing fatigue.
	fatigueGrowingReps = 1.0
)

// Muscle verdicts of RelativeStrength.
const (
	MuscleKeeping       = "keeping"
	MuscleMixed         = "mixed"
	MuscleTooAggressive = "too_aggressive"
	MuscleNotCutting    = "not_cutting"
)

// liftBalanceRatios are typical 1RMs relative to the squat: deadlift ≈ 1.2×
// squat, bench ≈ 0.75× squat and overhead press ≈ 0.65× bench.
var liftBalanceRatios = []struct {
	exercise string
	ratio    float64
}{
	{"Squat", 1.0},
	{"Bench Press", 0.75},
	{"Deadlift", 1.2},
	{"Overhead Press", 0.65 * 0.75},
}

// StrengthInsights are deeper insights into lifting up to Date, over the
// timespan from From (empty for all time) unless a field says otherwise.
type StrengthInsights struct {
	Date string `json:"date"`
	From string `json:"from,omitempty"`
	// Projections, per main lift with a level above it, when it gets there.
	Projections []StrengthProjection `json:"projections"`
	// Plateaus are lifts that stopped rising over the last 8 weeks.
	Plateaus []LiftPlateau `json:"plateaus"`
	// WeakLink compares the big four against typical ratios.
	WeakLink *WeakLink `json:"weak_link"`
	// Relative is strength against bodyweight over the timespan.
	Relative *RelativeStrength `json:"relative"`
	Patterns TrainingPatterns  `json:"patterns"`
	// Interference compares lifting after hard cardio with lifting fresh.
	Interference *CardioInterference `json:"interference"`
	Fatigue      []SessionFatigue    `json:"fatigue"`
}

// StrengthProjection is when a main lift reaches NextLevel at the rate its
// est. 1RM rose over the timespan (PerMonth, kg) while bodyweight moves at
// WeightPerWeek (kg, nil without a trend). The level's target is a ratio to
// bodyweight, so a cut brings it closer. Days is the estimate with both
// trends and DaysSteadyWeight with the weight held; either is nil when the
// level isn't reached in three years at that rate.
type StrengthProjection struct {
	Exercise         string   `json:"exercise"`
	Level            string   `json:"level"`
	NextLevel        string   `json:"next_level"`
	Best1RM          float64  `json:"best_1rm"`
	TargetKg         float64  `json:"target_kg"`
	PerMonth         float64  `json:"per_month"`
	WeightPerWeek    *float64 `json:"weight_per_week,omitempty"`
	Days             *int     `json:"days,omitempty"`
	DaysSteadyWeight *int     `json:"days_steady_weight,omitempty"`
}

// LiftPlateau is a lift whose est. 1RM went flat (or declined) from
// FirstDate to LastDate, a straight line through its Sessions changing by
// ChangePct, with the diet over those dates: the bodyweight change and the
// days logged and kept to.
type LiftPlateau struct {
	Exercise       string   `json:"exercise"`
	Status         string   `json:"status"`
	Sessions       int      `json:"sessions"`
	FirstDate      string   `json:"first_date"`
	LastDate       string   `json:"last_date"`
	Weeks          int      `json:"weeks"`
	Best1RM        float64  `json:"best_1rm"`
	ChangePct      float64  `json:"change_pct"`
	WeightChangeKg *float64 `json:"weight_change_kg,omitempty"`
	DietLogged     int      `json:"diet_logged"`
	DietAdhered    int      `json:"diet_adhered"`
}

// Statuses of a LiftPlateau.
const (
	PlateauFlat      = "flat"
	PlateauDeclining = "declining"
)

// WeakLink sets the best est. 1RM of each of the big four lifts trained over
// the timespan against what the others suggest by typical ratios. Lagging
// names the lift furthest behind, if it's more than 10% behind.
type WeakLink struct {
	Lifts   []LiftBalance `json:"lifts"`
	Lagging string        `json:"lagging,omitempty"`
}

// LiftBalance is a lift's Best1RM against ExpectedKg; Balance is the
// difference as a share of ExpectedKg.
type LiftBalance struct {
	Exercise   string  `json:"exercise"`
	Best1RM    float64 `json:"best_1rm"`
	ExpectedKg float64 `json:"expected_kg"`
	Balance    float64 `json:"balance"`
}

// RelativeStrength is how the main lifts changed against bodyweight from
// From to To, with a verdict on whether muscle is being kept on a cut.
type RelativeStrength struct {
	From            string         `json:"from"`
	To              string         `json:"to"`
	StartWeight     float64        `json:"start_weight"`
	EndWeight       float64        `json:"end_weight"`
	WeightChangeKg  float64        `json:"weight_change_kg"`
	WeightChangePct float64        `json:"weight_change_pct"`
	Lifts           []RelativeLift `json:"lifts"`
	Verdict         string         `json:"verdict"`
}

// RelativeLift is a lift's est. 1RM at the start and end of the stretch,
// its change and the change in 1RM per kg of bodyweight, in percent.
type RelativeLift struct {
	Exercise       string  `json:"exercise"`
	Start1RM       float64 `json:"start_1rm"`
	End1RM         float64 `json:"end_1rm"`
	ChangePct      float64 `json:"change_pct"`
	PerKgChangePct float64 `json:"per_kg_change_pct"`
}

// TrainingPatterns are patterns in when training happens over the
// timespan: per weekday the training days the plan and active goal
// scheduled and those skipped, and lifting sessions grouped by rest days
// since the lift was last trained.
type TrainingPatterns struct {
	Weekdays []WeekdaySkips       `json:"weekdays"`
	RestDays []RestDayPerformance `json:"rest_days"`
}

// WeekdaySkips counts a weekday's scheduled training days and those
// skipped.
type WeekdaySkips struct {
	Weekday   string `json:"weekday"`
	Scheduled int    `json:"scheduled"`
	Skipped   int    `json:"skipped"`
}

// RestDayPerformance is how lifting sessions after Rest rest days ("0–1",
// "2" or "3+") went: their best est. 1RM against the average of the lift's
// previous three sessions, in percent.
type RestDayPerformance struct {
	Rest         string  `json:"rest"`
	Sessions     int     `json:"sessions"`
	AvgChangePct float64 `json:"avg_change_pct"`
}

// CardioInterference compares lifting sessions on the day of or after a
// hard cardio session with the rest, as in RestDayPerformance.
type CardioInterference struct {
	HardSessions int              `json:"hard_sessions"`
	AfterHard    PerformanceGroup `json:"after_hard"`
	Fresh        PerformanceGroup `json:"fresh"`
}

// PerformanceGroup is a group of lifting sessions and how they went on
// average, as in RestDayPerformance.
type PerformanceGroup struct {
	Sessions     int     `json:"sessions"`
	AvgChangePct float64 `json:"avg_change_pct"`
}

// SessionFatigue is how many reps a lift drops from its first to its last
// working set (the sets at the session's top weight): on average over its
// last three sessions with several working sets, and over up to three
// before them. Growing is set when the drop grew by a rep or more.
type SessionFatigue struct {
	Exercise    string  `json:"exercise"`
	Sessions    int     `json:"sessions"`
	LastDate    string  `json:"last_date"`
	RecentDrop  float64 `json:"recent_drop"`
	EarlierDrop float64 `json:"earlier_drop"`
	Growing     bool    `json:"growing"`
}

// GetStrengthInsights works out the StrengthInsights up to today
// (YYYY-MM-DD) over the timespan from from, with the plan planID (0 for
// none) for skipped weekdays.
func (s *Store) GetStrengthInsights(today, from string, planID int) (StrengthInsights, error) {
	now, err := time.Parse(dateLayout, today)
	if err != nil {
		return StrengthInsights{}, fmt.Errorf("invalid date %q: %w", today, err)
	}
	if from != "" {
		if _, err := time.Parse(dateLayout, from); err != nil {
			return StrengthInsights{}, fmt.Errorf("invalid date %q: %w", from, err)
		}
	}
	sets, err := s.setsBetween("", today)
	if err != nil {
		return StrengthInsights{}, err
	}
	weights, err := s.ListBodyweight()
	if err != nil {
		return StrengthInsights{}, err
	}
	diet, err := s.ListDietDays("", today)
	if err != nil {
		return StrengthInsights{}, err
	}
	cardio, err := s.cardioSamplesBetween("", today)
	if err != nil {
		return StrengthInsights{}, err
	}
	zones, err := s.allHeartRateZones()
	if err != nil {
		return StrengthInsights{}, err
	}
	scheduled, err := s.scheduledTraining(planID, from, now)
	if err != nil {
		return StrengthInsights{}, err
	}

	lifts := liftSessions(sets)
	insights := StrengthInsights{
		Date:         today,
		From:         from,
		Projections:  strengthProjections(lifts, weights, from, today),
		Plateaus:     liftPlateaus(lifts, weights, diet, now),
		WeakLink:     weakLink(lifts, from),
		Relative:     relativeStrength(lifts, weights, from, today),
		Patterns:     TrainingPatterns{Weekdays: weekdaySkips(scheduled), RestDays: restDayPerformance(lifts, from)},
		Interference: cardioInterference(lifts, cardioLoads(cardio, zones), from),
		Fatigue:      sessionFatigue(lifts, from),
	}
	return insights, nil
}

// inSpan keeps a lift's sessions from from on.
func inSpan(sessions []liftSession, from string) []liftSession {
	i := 0
	for i < len(sessions) && sessions[i].date < from {
		i++
	}
	return sessions[i:]
}

// fitSessions fits a straight line through sessions' best est. 1RMs.
func fitSessions(sessions []liftSession) (a, b float64, ok bool) {
	ps := make([]datePoint, len(sessions))
	for i, s := range sessions {
		ps[i] = datePoint{s.day, s.best}
	}
	return linearFit(ps)
}

func strengthProjections(lifts map[string][]liftSession, weights []BodyweightEntry, from, today string) []StrengthProjection {
	projections := []StrengthProjection{}
	if len(weights) == 0 {
		return projections
	}
	bodyweight := weights[len(weights)-1].Weight
	trend := weightTrendAt(weights, today, weightTrendDays)

	for _, standard := range strengthStandards {
		sessions := inSpan(lifts[standard.exercise], from)
		if len(sessions) < projectionMinSessions || sessions[len(sessions)-1].day-sessions[0].day < projectionMinDays {
			continue
		}
		_, slope, ok := fitSessions(sessions)
		if !ok {
			continue
		}
		best := 0.0
		for _, s := range sessions {
			best = math.Max(best, s.best)
		}
		p := StrengthProjection{Exercise: standard.exercise, Best1RM: round(best, 1), PerMonth: round(slope*daysPerMonth, 1)}
		ratio := 0.0
		for i, r := range standard.ratios {
			if best >= r*bodyweight {
				p.Level = strengthLevelNames[i]
				continue
			}
			p.NextLevel, ratio = strengthLevelNames[i], r
			break
		}
		if p.NextLevel == "" {
			continue
		}
		p.TargetKg = round(ratio*bodyweight, 1)
		gap := ratio*bodyweight - best

		days := func(rate float64) *int {
			if rate <= 0 {
				return nil
			}
			d := int(math.Ceil(gap / rate))
			if d > projectionMaxDays {
				return nil
			}
			return &d
		}
		p.DaysSteadyWeight = days(slope)
		p.Days = p.DaysSteadyWeight
		if trend != nil {
			perWeek := trend.PerWeekKg
			p.WeightPerWeek = &perWeek
			// The target moves by ratio × the weight change per day.
			p.Days = days(slope - ratio*trend.perDay())
		}
		projections = append(projections, p)
	}
	return projections
}

func liftPlateaus(lifts map[string][]liftSession, weights []BodyweightEntry, diet []DietDay, now time.Time) []LiftPlateau {
	plateaus := []LiftPlateau{}
	today := now.Format(dateLayout)
	since := now.AddDate(0, 0, 1-plateauDays).Format(dateLayout)
	recent := now.AddDate(0, 0, -plateauRecentDays).Format(dateLayout)
	for _, name := range slices.Sorted(maps.Keys(lifts)) {
		sessions := inSpan(lifts[name], since)
		if len(sessions) < plateauMinSessions || sessions[len(sessions)-1].date < recent {
			continue
		}
		first, last := sessions[0], sessions[len(sessions)-1]
		if last.day-first.day < plateauMinSpan {
			continue
		}
		a, b, ok := fitSessions(sessions)
		if !ok {
			continue
		}
		start := a + b*first.day
		change := (a + b*last.day - start) / start
		if change >= plateauRise {
			continue
		}
		p := LiftPlateau{
			Exercise: name, Status: PlateauFlat, Sessions: len(sessions),
			FirstDate: first.date, LastDate: last.date,
			Weeks:     int(math.Round((last.day - first.day) / 7)),
			ChangePct: round(change*100, 1),
		}
		if change <= plateauDeclining {
			p.Status = PlateauDeclining
		}
		for _, s := range sessions {
			p.Best1RM = math.Max(p.Best1RM, round(s.best, 1))
		}

		w0, ok0 := weightNear(weights, first.date)
		w1, ok1 := weightNear(weights, last.date)
		if ok0 && ok1 {
			change := round(w1-w0, 1)
			p.WeightChangeKg = &change
		}
		for _, d := range diet {
			if d.Date < first.date || d.Date > min(last.date, today) {
				continue
			}
			p.DietLogged++
			if d.Adhered {
				p.DietAdhered++
			}
		}
		plateaus = append(plateaus, p)
	}
	return plateaus
}

func weakLink(lifts map[string][]liftSession, from string) *WeakLink {
	type score struct {
		exercise    string
		best, ratio float64
	}
	var scores []score
	total := 0.0
	for _, l := range liftBalanceRatios {
		best := 0.0
		for _, s := range inSpan(lifts[l.exercise], from) {
			best = math.Max(best, s.best)
		}
		if best > 0 {
			scores = append(scores, score{l.exercise, best, l.ratio})
			total += best / l.ratio
		}
	}
	if len(scores) < 2 {
		return nil
	}
	// What a squat would be by every lift, on average.
	squat := total / float64(len(scores))
	link := &WeakLink{}
	worst := 0.0
	for _, s := range scores {
		expected := squat * s.ratio
		balance := s.best/expected - 1
		link.Lifts = append(link.Lifts, LiftBalance{
			Exercise: s.exercise, Best1RM: round(s.best, 1),
			ExpectedKg: round(expected, 1), Balance: round(balance, 3),
		})
		if balance <= weakLinkBelow && balance < worst {
			worst, link.Lagging = balance, s.exercise
		}
	}
	return link
}

func relativeStrength(lifts map[string][]liftSession, weights []BodyweightEntry, from, today string) *RelativeStrength {
	change := bodyweightChange(weights, from, today)
	if change == nil {
		return nil
	}
	var startWeight, endWeight float64
	for _, e := range weights {
		if e.Date == change.From {
			startWeight = e.Weight
		}
		if e.Date == change.To {
			endWeight = e.Weight
		}
	}
	r := &RelativeStrength{
		From: change.From, To: change.To,
		StartWeight: startWeight, EndWeight: endWeight,
		WeightChangeKg:  change.ChangeKg,
		WeightChangePct: round((endWeight/startWeight-1)*100, 1),
		Lifts:           []RelativeLift{},
	}
	weightRatio := endWeight / startWeight

	sum := 0.0
	for _, standard := range strengthStandards {
		sessions := inSpan(lifts[standard.exercise], from)
		if len(sessions) < 2 {
			continue
		}
		first, last := sessions[0], sessions[len(sessions)-1]
		start, end := first.best, last.best
		if len(sessions) >= 3 {
			if a, b, ok := fitSessions(sessions); ok {
				start, end = a+b*first.day, a+b*last.day
			}
		}
		if start <= 0 {
			continue
		}
		pct := (end/start - 1) * 100
		sum += pct
		r.Lifts = append(r.Lifts, RelativeLift{
			Exercise: standard.exercise, Start1RM: round(start, 1), End1RM: round(end, 1),
			ChangePct:      round(pct, 1),
			PerKgChangePct: round((end/start/weightRatio-1)*100, 1),
		})
	}
	switch {
	case len(r.Lifts) == 0:
	case r.WeightChangePct > cuttingBelowPct:
		r.Verdict = MuscleNotCutting
	case sum/float64(len(r.Lifts)) >= strengthHeldPct:
		r.Verdict = MuscleKeeping
	case sum/float64(len(r.Lifts)) < r.WeightChangePct:
		r.Verdict = MuscleTooAggressive
	default:
		r.Verdict = MuscleMixed
	}
	return r
}

func weekdaySkips(days []trainingDay) []WeekdaySkips {
	var counts [7]WeekdaySkips
	for i := range counts {
		counts[i].Weekday = weekdayNames[i]
	}
	for _, d := range days {
		date, err := time.Parse(dateLayout, d.date)
		if err != nil {
			continue
		}
		c := &counts[isoWeekday(date.Weekday())-1]
		c.Scheduled++
		if d.skipped {
			c.Skipped++
		}
	}
	out := []WeekdaySkips{}
	for _, c := range counts {
		if c.Scheduled > 0 {
			out = append(out, c)
		}
	}
	return out
}

// restBucket names the rest days between two sessions gap days apart.
func restBucket(gap float64) string {
	switch rest := int(gap) - 1; {
	case rest <= 1:
		return "0–1"
	case rest == 2:
		return "2"
	default:
		return "3+"
	}
}

func restDayPerformance(lifts map[string][]liftSession, from string) []RestDayPerformance {
	buckets := []string{"0–1", "2", "3+"}
	sums := make(map[string]float64)
	counts := make(map[string]int)
	for _, sessions := range lifts {
		for i := 1; i < len(sessions); i++ {
			if sessions[i].date < from {
				continue
			}
			change, _ := sessionChange(sessions, i)
			bucket := restBucket(sessions[i].day - sessions[i-1].day)
			sums[bucket] += change
			counts[bucket]++
		}
	}
	out := []RestDayPerformance{}
	for _, b := range buckets {
		if counts[b] > 0 {
			out = append(out, RestDayPerformance{Rest: b, Sessions: counts[b], AvgChangePct: round(sums[b]/float64(counts[b]), 1)})
		}
	}
	return out
}

func cardioInterference(lifts map[string][]liftSession, loads []cardioLoad, from string) *CardioInterference {
	hardDays := make(map[string]bool)
	ci := &CardioInterference{}
	for _, l := range loads {
		if !l.hard {
			continue
		}
		hardDays[l.workout.Date] = true
		if l.workout.Date >= from {
			ci.HardSessions++
		}
	}
	if ci.HardSessions == 0 {
		return nil
	}
	var afterSum, freshSum float64
	for _, sessions := range lifts {
		for i := 1; i < len(sessions); i++ {
			s := sessions[i]
			if s.date < from {
				continue
			}
			change, _ := sessionChange(sessions, i)
			if hardDays[s.date] || hardDays[dateOfDay(s.day-1)] {
				ci.AfterHard.Sessions++
				afterSum += change
			} else {
				ci.Fresh.Sessions++
				freshSum += change
			}
		}
	}
	if ci.AfterHard.Sessions > 0 {
		ci.AfterHard.AvgChangePct = round(afterSum/float64(ci.AfterHard.Sessions), 1)
	}
	if ci.Fresh.Sessions > 0 {
		ci.Fresh.AvgChangePct = round(freshSum/float64(ci.Fresh.Sessions), 1)
	}
	return ci
}

// repDrop is how many reps fell from a session's first working set to its
// last, or false with fewer than two working sets.
func repDrop(sets []Set) (float64, bool) {
	top := 0.0
	for _, s := range sets {
		top = math.Max(top, s.Weight)
	}
	var working []Set
	for _, s := range sets {
		if s.Weight == top && s.Reps > 0 {
			working = append(working, s)
		}
	}
	if len(working) < 2 {
		return 0, false
	}
	return float64(working[0].Reps - working[len(working)-1].Reps), true
}

func sessionFatigue(lifts map[string][]liftSession, from string) []SessionFatigue {
	out := []SessionFatigue{}
	for _, name := range slices.Sorted(maps.Keys(lifts)) {
		var drops []float64
		var last string
		for _, s := range inSpan(lifts[name], from) {
			if drop, ok := repDrop(s.sets); ok {
				drops = append(drops, drop)
				last = s.date
			}
		}
		if len(drops) < fatigueMinSessions {
			continue
		}
		mean := func(xs []float64) float64 {
			sum := 0.0
			for _, x := range xs {
				sum += x
			}
			return sum / float64(len(xs))
		}
		recent := drops[len(drops)-fatigueRecent:]
		earlier := drops[max(0, len(drops)-2*fatigueRecent) : len(drops)-fatigueRecent]
		f := SessionFatigue{
			Exercise: name, Sessions: len(drops), LastDate: last,
			RecentDrop: round(mean(recent), 1), EarlierDrop: round(mean(earlier), 1),
		}
		f.Growing = f.RecentDrop-f.EarlierDrop >= fatigueGrowingReps
		out = append(out, f)
	}
	slices.SortStableFunc(out, func(a, b SessionFatigue) int {
		if a.Growing != b.Growing {
			if a.Growing {
				return -1
			}
			return 1
		}
		return cmp.Compare(a.Exercise, b.Exercise)
	})
	return out
}
