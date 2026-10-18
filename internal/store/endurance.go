package store

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
)

// legOrder is the order of a triathlon's legs, and of the disciplines in a
// plan.
var legOrder = []string{ActivitySwimming, ActivityCycling, ActivityRunning}

// extraSessionOrder hands out sessions beyond one per discipline: the
// longest legs first.
var extraSessionOrder = []string{ActivityCycling, ActivityRunning, ActivitySwimming}

// sport holds how a plan trains one discipline.
type sport struct {
	// minSession and step bound and round session distances, in metres.
	minSession, step float64
	// defaultSpeed (m/s) estimates race times without a threshold.
	defaultSpeed float64
	// noun names a session of the sport, e.g. "run".
	noun string
}

var sports = map[string]sport{
	ActivityRunning:  {minSession: 3000, step: 500, defaultSpeed: 2.8, noun: "run"},
	ActivityCycling:  {minSession: 10000, step: 5000, defaultSpeed: 7, noun: "ride"},
	ActivitySwimming: {minSession: 400, step: 100, defaultSpeed: 0.75, noun: "swim"},
}

const (
	// weeklyGrowth is the most the weekly volume grows from one week to the
	// next, outside recovery weeks.
	weeklyGrowth = 1.10
	// Every recoveryEvery-th week is a recovery week at recoveryVolume.
	recoveryEvery  = 4
	recoveryVolume = 0.7
	// floorFraction of the peak weekly volume is the least a plan starts at,
	// unless it has time to grow to the peak from lower (see generatePlan).
	floorFraction = 0.5
	// otherSession is how long each session but the long one is, relative
	// to the long one.
	otherSession = 0.6
	// minPlanWeeks is the least time to train for a race properly.
	minPlanWeeks = 6
	// longRace is the estimated race time beyond which the taper is two weeks.
	longRace = 2 * time.Hour
)

// peakLong is the longest session a plan builds up to for a race leg.
func peakLong(activity string, race float64) float64 {
	switch activity {
	case ActivityRunning:
		factor := 1.2
		if race > 10550 {
			factor = 1.0
		}
		return math.Min(math.Max(race*factor, 8000), 32000)
	case ActivityCycling:
		factor := 1.3
		if race > 45000 {
			factor = 1.0
		}
		return math.Min(math.Max(race*factor, 30000), 180000)
	default:
		return math.Min(math.Max(race*1.2, 1000), 5000)
	}
}

// longShare is the long session's share of a week of sessions, the
// others being otherSession of it each.
func longShare(sessions int) float64 {
	return 1 / (1 + otherSession*float64(max(sessions, 1)-1))
}

// legs returns the goal's race legs in race order.
func (g Goal) legs() []string {
	var legs []string
	for _, activity := range legOrder {
		if g.leg(activity) > 0 {
			legs = append(legs, activity)
		}
	}
	return legs
}

// leg returns the race distance of a discipline, or 0 when the race has
// none.
func (g Goal) leg(activity string) float64 {
	var leg *float64
	switch activity {
	case ActivitySwimming:
		leg = g.SwimM
	case ActivityCycling:
		leg = g.BikeM
	case ActivityRunning:
		leg = g.RunM
	}
	if leg == nil {
		return 0
	}
	return *leg
}

// generatorInput is what a plan is generated from.
type generatorInput struct {
	Goal Goal
	// From is the first day to plan; earlier days of its week are left out.
	From    time.Time
	Fitness Fitness
	// PrevLevel is the weekly volume per discipline (metres) of the last
	// week planned before From that wasn't a recovery week, or nil for a
	// new plan, which starts from Fitness.
	PrevLevel map[string]float64
	// Hold keeps the first week at PrevLevel instead of growing it, after
	// a week well short of the plan.
	Hold bool
	// EaseQuality makes the first week's quality sessions easy, after
	// quality sessions done too slow.
	EaseQuality bool
}

// planWeek is a week (from Monday) of a goal's plan, counted from the week
// the goal started.
type planWeek struct {
	index    int
	monday   time.Time
	phase    string
	recovery bool
}

// mondayOf returns the Monday of the week of t, at midnight.
func mondayOf(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	return d.AddDate(0, 0, 1-isoWeekday(d.Weekday()))
}

// planWeeks splits the weeks from the goal's start to its race into phases,
// counting back from race week: the taper (taperWeeks), then peak (about
// 20% of the weeks before it), build (35%) and base (the rest). Every
// fourth week outside the taper is a recovery week.
func planWeeks(start, race time.Time, taperWeeks int) []planWeek {
	first, last := mondayOf(start), mondayOf(race)
	count := int(last.Sub(first).Hours()/24/7) + 1
	training := max(count-1-taperWeeks, 0)
	peak := int(math.Round(float64(training) * 0.2))
	build := int(math.Round(float64(training) * 0.35))
	base := training - peak - build

	weeks := make([]planWeek, count)
	for i := range weeks {
		w := planWeek{index: i, monday: first.AddDate(0, 0, 7*i)}
		switch {
		case i == count-1:
			w.phase = PhaseRace
		case i >= training:
			w.phase = PhaseTaper
		case i >= base+build:
			w.phase = PhasePeak
		case i >= base:
			w.phase = PhaseBuild
		default:
			w.phase = PhaseBase
		}
		w.recovery = w.phase != PhaseTaper && w.phase != PhaseRace && (i+1)%recoveryEvery == 0
		weeks[i] = w
	}
	return weeks
}

// taperWeeks is two for a race estimated to take over two hours, else one.
func taperWeeks(g Goal, f Fitness) int {
	var seconds float64
	for _, activity := range g.legs() {
		speed := f.Threshold[activity]
		if speed == 0 {
			speed = sports[activity].defaultSpeed
		}
		seconds += g.leg(activity) / speed
	}
	if time.Duration(seconds*float64(time.Second)) > longRace {
		return 2
	}
	return 1
}

// generatePlan generates a goal's sessions from in.From up to and
// including race day, with warnings about the goal.
//
// The weekly volume of each discipline starts at the larger of the current
// weekly volume and a floor (or at PrevLevel when continuing a plan): the
// smaller of floorFraction of the peak and the volume that grows into the
// peak at weeklyGrowth, and grows each week up to the peak: the volume whose
// long session is peakLong. The growth is spread to reach the peak as the
// peak phase starts, but is never more than weeklyGrowth. A week's volume is one long
// session and otherSession of it for each other session of a full week;
// a week with fewer training days drops easy sessions. Recovery weeks drop to
// recoveryVolume without moving the level on; the taper drops to 60% then
// 45% of it. Race week has short easy sessions before the race.
//
// Each training day gets one session (a triathlon's brick adds a run after
// the long ride). A discipline with two or more sessions a week gets a long
// session, and from the build phase on a quality session: tempo in build,
// intervals in peak and taper. Single-sport goals put the long session on
// the long day; triathlons put the long ride there.
func generatePlan(in generatorInput) ([]PlannedSession, []string) {
	g := in.Goal
	start, _ := time.Parse(dateLayout, g.StartDate)
	race, _ := time.Parse(dateLayout, g.RaceDate)
	from := time.Date(in.From.Year(), in.From.Month(), in.From.Day(), 0, 0, 0, 0, time.UTC)
	legs := g.legs()
	weeks := planWeeks(start, race, taperWeeks(g, in.Fitness))

	var warnings []string
	if remaining := len(weeks) - weekIndex(weeks, from); remaining < minPlanWeeks {
		warnings = append(warnings, fmt.Sprintf(
			"Only %d weeks to race day: the plan is compressed. %d weeks or more works better.", remaining, minPlanWeeks))
	}
	if days := len(g.Weekdays); days < len(legs) {
		warnings = append(warnings, fmt.Sprintf(
			"%d training days can't fit all %d disciplines every week.", days, len(legs)))
	} else if days == len(legs) && len(legs) > 1 && taperWeeks(g, in.Fitness) == 2 {
		warnings = append(warnings, fmt.Sprintf(
			"%d training days give one session a sport each week: light for a race this long. 5 or 6 days works better.", days))
	}

	// Volume is sized for a full week of sessions.
	full := sessionCounts(legs, len(g.Weekdays))
	steps := growthSteps(weeks, from, in.PrevLevel != nil && !in.Hold)
	peak := make(map[string]float64)
	level := make(map[string]float64)
	growth := make(map[string]float64)
	floorShare := math.Min(floorFraction, math.Pow(weeklyGrowth, -float64(steps)))
	for _, activity := range legs {
		peak[activity] = peakLong(activity, g.leg(activity)) / longShare(full[activity])
		floor := peak[activity] * floorShare
		prev, continuing := in.PrevLevel[activity]
		continuing = continuing && prev > 0
		if !continuing {
			prev = in.Fitness.Weekly[activity]
		}
		prev = math.Min(math.Max(prev, floor), peak[activity])
		// Long plans spread the growth to reach the peak as the peak
		// phase starts, rather than plateauing for months.
		growth[activity] = weeklyGrowth
		if steps > 0 {
			growth[activity] = math.Min(math.Pow(peak[activity]/prev, 1/float64(steps)), weeklyGrowth)
		}
		if continuing && !in.Hold {
			prev *= growth[activity]
		}
		level[activity] = math.Min(math.Max(prev, floor), peak[activity])
	}

	var sessions []PlannedSession
	first := true
	for i, week := range weeks {
		if week.monday.AddDate(0, 0, 7).Compare(from) <= 0 {
			continue
		}
		// The level grows after every full training week.
		if !first && !weeks[i-1].recovery && isTraining(weeks[i-1].phase) && isTraining(week.phase) {
			for _, activity := range legs {
				level[activity] = math.Min(level[activity]*growth[activity], peak[activity])
			}
		}
		var days []time.Time
		for d := range 7 {
			day := week.monday.AddDate(0, 0, d)
			if !day.Before(from) && day.Before(race) && slices.Contains(g.Weekdays, weekdayNames[d]) {
				days = append(days, day)
			}
		}
		ease := in.EaseQuality && first
		if week.phase == PhaseRace {
			sessions = append(sessions, raceWeek(g, in.Fitness, days, race)...)
		} else {
			sessions = append(sessions, trainingWeek(g, in.Fitness, week, level, days, ease)...)
		}
		first = false
	}
	return sessions, warnings
}

// growthSteps counts the times the level grows from the week of from up to
// the first peak week (or the last training week without one), counting
// growth into the week of from when continuing a plan.
func growthSteps(weeks []planWeek, from time.Time, continuing bool) int {
	first := weekIndex(weeks, from)
	target := -1
	for i, w := range weeks {
		if isTraining(w.phase) {
			target = i
		}
		if w.phase == PhasePeak {
			break
		}
	}
	steps := 0
	if continuing && first < len(weeks) && isTraining(weeks[first].phase) {
		steps++
	}
	for i := first + 1; i <= target; i++ {
		if !weeks[i-1].recovery && isTraining(weeks[i-1].phase) && isTraining(weeks[i].phase) {
			steps++
		}
	}
	return steps
}

func isTraining(phase string) bool {
	return phase == PhaseBase || phase == PhaseBuild || phase == PhasePeak
}

// weekIndex returns the index of the week holding day, clamped to weeks.
func weekIndex(weeks []planWeek, day time.Time) int {
	for i, w := range weeks {
		if day.Before(w.monday.AddDate(0, 0, 7)) {
			return i
		}
	}
	return len(weeks)
}

// sessionCounts spreads the training days over the disciplines: one each
// (as far as the days go), then the rest in extraSessionOrder.
func sessionCounts(legs []string, days int) map[string]int {
	counts := make(map[string]int)
	order := slices.DeleteFunc(slices.Clone(extraSessionOrder), func(a string) bool { return !slices.Contains(legs, a) })
	for i := 0; i < days; i++ {
		counts[order[i%len(order)]]++
	}
	return counts
}

// trainingWeek plans a week before race week on days, from each
// discipline's weekly level.
func trainingWeek(g Goal, f Fitness, week planWeek, level map[string]float64, days []time.Time, ease bool) []PlannedSession {
	if len(days) == 0 {
		return nil
	}
	legs := g.legs()
	counts := sessionCounts(legs, len(days))
	full := sessionCounts(legs, len(g.Weekdays))
	triathlon := len(legs) > 1

	var planned []PlannedSession
	for _, activity := range legs {
		n := counts[activity]
		if n == 0 {
			continue
		}
		volume := level[activity]
		switch {
		case week.recovery:
			volume *= recoveryVolume
		case week.phase == PhaseTaper:
			// The last taper week (the one before race week) is the lightest.
			volume *= 0.6
			if raceWeekGap(g, week) == 1 && taperWeeks(g, f) == 2 {
				volume *= 0.75
			}
		}
		long := volume * longShare(full[activity])
		other := long * otherSession

		quality := ""
		if !week.recovery && !ease && n >= 2 {
			switch week.phase {
			case PhaseBuild:
				quality = KindTempo
			case PhasePeak, PhaseTaper:
				quality = KindIntervals
			}
		}
		easyCount := n - 1
		if quality != "" {
			easyCount--
		}

		easyKind := KindEasy
		switch {
		case week.recovery:
			easyKind = KindRecovery
		case activity == ActivitySwimming && week.phase == PhaseBase:
			easyKind = KindTechnique
		}
		longSession := newSession(activity, KindLong, week.phase, roundDistance(activity, long), f)
		// A lone weekly ride or run carries the phase's quality as a block.
		if n == 1 && activity != ActivitySwimming && !week.recovery && !ease {
			switch week.phase {
			case PhaseBuild:
				longSession = withBlock(longSession, KindTempo, f)
			case PhasePeak:
				longSession = withBlock(longSession, KindIntervals, f)
			}
		}
		planned = append(planned, longSession)
		if quality != "" {
			planned = append(planned, newSession(activity, quality, week.phase, roundDistance(activity, other), f))
		}
		for range easyCount {
			planned = append(planned, newSession(activity, easyKind, week.phase, roundDistance(activity, other), f))
		}
	}

	primary := legs[0]
	if triathlon {
		primary = ActivityCycling
		if !slices.Contains(legs, primary) {
			primary = legs[len(legs)-1]
		}
	}
	sessions := assignDays(planned, days, primary, longDayIndex(g))

	// A triathlon's brick: a short run straight off the long ride.
	if triathlon && slices.Contains(legs, ActivityRunning) && slices.Contains(legs, ActivityCycling) &&
		!week.recovery && (week.phase == PhaseBuild || week.phase == PhasePeak) {
		for _, s := range sessions {
			if s.Activity == ActivityCycling && s.Kind == KindLong {
				brick := newSession(ActivityRunning, KindBrick, week.phase,
					roundDistance(ActivityRunning, math.Max(level[ActivityRunning]*0.15, 2000)), f)
				brick.Date = s.Date
				sessions = append(sessions, brick)
				break
			}
		}
	}
	slices.SortStableFunc(sessions, func(a, b PlannedSession) int { return strings.Compare(a.Date, b.Date) })
	return sessions
}

// withBlock adds a quality block of kind to a long session's description:
// tempo over the middle third, kept as its TempoBlock to be checked, or
// intervals over about 40% of it. The session's targets stay those of the
// long session.
func withBlock(s PlannedSession, kind string, f Fitness) PlannedSession {
	distance := *s.TargetDistanceM
	switch kind {
	case KindTempo:
		block := newSession(s.Activity, KindTempo, s.Phase, roundDistance(s.Activity, distance/3), f)
		s.Description += fmt.Sprintf(", with %s @ %s in the middle",
			formatMetres(s.Activity, *block.TargetDistanceM), describeTarget(block))
		s.TempoBlock = &TempoBlock{
			DistanceM: *block.TargetDistanceM,
			SpeedMin:  block.SpeedMin, SpeedMax: block.SpeedMax, HRMin: block.HRMin, HRMax: block.HRMax,
		}
	case KindIntervals:
		block := newSession(s.Activity, KindIntervals, s.Phase, distance*0.4, f)
		rep := fmt.Sprintf("%.0f m", deref(block.RepDistanceM))
		rest := "jog"
		if block.RepDurationS != nil {
			rep, rest = formatSeconds(*block.RepDurationS), "easy"
		}
		s.Description += fmt.Sprintf(", with %d×%s @ %s, %s %s",
			*block.Reps, rep, describeTarget(block), formatSeconds(*block.RecoveryS), rest)
	}
	return s
}

// raceWeekGap is how many weeks week is before race week.
func raceWeekGap(g Goal, week planWeek) int {
	race, _ := time.Parse(dateLayout, g.RaceDate)
	return int(mondayOf(race).Sub(week.monday).Hours() / 24 / 7)
}

// raceWeek plans race week: the race on race day, and before it a short easy
// session per discipline (two for a single sport), not the day before the
// race when there's a choice.
func raceWeek(g Goal, f Fitness, days []time.Time, race time.Time) []PlannedSession {
	legs := g.legs()
	var easy []PlannedSession
	for _, activity := range legs {
		count := 1
		if len(legs) == 1 {
			count = 2
		}
		for range count {
			distance := math.Max(g.leg(activity)*0.3, sports[activity].minSession)
			easy = append(easy, newSession(activity, KindEasy, PhaseRace, roundDistance(activity, distance), f))
		}
	}
	// Prefer days at least two before the race, latest first.
	slices.SortFunc(days, func(a, b time.Time) int { return b.Compare(a) })
	early := slices.DeleteFunc(slices.Clone(days), func(d time.Time) bool { return race.Sub(d) < 48*time.Hour })
	order := append(early, slices.DeleteFunc(slices.Clone(days), func(d time.Time) bool { return race.Sub(d) >= 48*time.Hour })...)

	var sessions []PlannedSession
	for i, s := range easy {
		if i >= len(order) {
			break
		}
		s.Date = order[i].Format(dateLayout)
		sessions = append(sessions, s)
	}
	for _, activity := range legs {
		s := newSession(activity, KindRace, PhaseRace, g.leg(activity), f)
		s.Date = g.RaceDate
		sessions = append(sessions, s)
	}
	slices.SortStableFunc(sessions, func(a, b PlannedSession) int { return strings.Compare(a.Date, b.Date) })
	return sessions
}

// longDayIndex is the goal's long day as 0 (Monday) to 6 (Sunday).
func longDayIndex(g Goal) int {
	n, err := weekdayNumber(g.LongDay)
	if err != nil {
		return 6
	}
	return n - 1
}

// assignDays gives each session a day: the primary discipline's long session
// the long day (or the latest day without it), then the other long
// sessions, quality sessions and easy sessions, each on the free day
// furthest from the same discipline's sessions, preferring days not next to
// the primary long session for quality, then the earliest.
func assignDays(planned []PlannedSession, days []time.Time, primary string, longDay int) []PlannedSession {
	rank := func(s PlannedSession) int {
		switch {
		case s.Kind == KindLong && s.Activity == primary:
			return 0
		case s.Kind == KindLong:
			return 1
		case s.Kind == KindTempo || s.Kind == KindIntervals:
			return 2
		}
		return 3
	}
	order := slices.Clone(planned)
	slices.SortStableFunc(order, func(a, b PlannedSession) int { return rank(a) - rank(b) })

	used := make([]bool, len(days))
	byActivity := make(map[string][]int)
	primaryDay := -1
	var sessions []PlannedSession
	for _, s := range order {
		best := -1
		if rank(s) == 0 {
			for i, d := range days {
				if isoWeekday(d.Weekday())-1 == longDay {
					best = i
				}
			}
			if best == -1 {
				best = len(days) - 1
			}
		} else {
			bestScore := math.Inf(-1)
			for i := range days {
				if used[i] {
					continue
				}
				gap := 7.0
				for _, j := range byActivity[s.Activity] {
					gap = math.Min(gap, math.Abs(float64(days[i].Sub(days[j]).Hours()/24)))
				}
				score := gap
				if rank(s) == 2 && primaryDay >= 0 && math.Abs(days[i].Sub(days[primaryDay]).Hours()/24) <= 1 {
					score -= 0.5
				}
				if score > bestScore {
					best, bestScore = i, score
				}
			}
		}
		if best == -1 || used[best] {
			continue
		}
		used[best] = true
		if rank(s) == 0 {
			primaryDay = best
		}
		byActivity[s.Activity] = append(byActivity[s.Activity], best)
		s.Date = days[best].Format(dateLayout)
		sessions = append(sessions, s)
	}
	return sessions
}

// roundDistance rounds a session distance to the sport's step, and up to
// its shortest session.
func roundDistance(activity string, metres float64) float64 {
	s := sports[activity]
	return math.Max(math.Round(metres/s.step)*s.step, s.minSession)
}

// newSession builds a session with its intensity targets and description.
func newSession(activity, kind, phase string, distance float64, f Fitness) PlannedSession {
	s := PlannedSession{Activity: activity, Kind: kind, Phase: phase, TargetDistanceM: fp(distance)}
	if kind == KindRace {
		s.Intensity = "race"
		s.Description = fmt.Sprintf("Race: %s %s", sports[activity].noun, formatMetres(activity, distance))
		return s
	}

	effort := kind
	if kind == KindBrick {
		effort = KindTempo
	}
	speedMin, speedMax := speedRange(activity, effort, f.Threshold[activity])
	if speedMin > 0 {
		s.SpeedMin, s.SpeedMax = fp(roundSpeed(speedMin)), fp(roundSpeed(speedMax))
	}
	if f.MaxHR > 0 {
		low, high := heartRateRange(effort)
		s.HRMin, s.HRMax = fp(math.Round(f.MaxHR*low)), fp(math.Round(f.MaxHR*high))
	}
	s.Intensity = intensityLabel(activity, effort)

	if kind == KindIntervals {
		reps, repDistance, repDuration, recovery := intervalStructure(activity, phase, distance)
		s.Reps, s.RecoveryS = &reps, fp(recovery)
		if repDistance > 0 {
			s.RepDistanceM = fp(repDistance)
		} else {
			s.RepDurationS = fp(repDuration)
		}
	}
	s.Description = describeSession(s)
	return s
}

// speedRange is the target speed (m/s) for an effort, from the threshold
// speed, or zeros without one. Runs and swims are paced in time per
// distance around threshold pace; rides as a share of threshold speed.
func speedRange(activity, effort string, threshold float64) (float64, float64) {
	if threshold <= 0 {
		return 0, 0
	}
	switch activity {
	case ActivityCycling:
		low, high := 0.75, 0.85
		switch effort {
		case KindTempo:
			low, high = 0.9, 0.97
		case KindIntervals:
			low, high = 1.0, 1.08
		}
		return threshold * low, threshold * high
	case ActivitySwimming:
		css := 100 / threshold
		slow, fast := css+15, css+8
		switch effort {
		case KindTempo:
			slow, fast = css+5, css
		case KindIntervals:
			slow, fast = css+2, css-3
		}
		return 100 / slow, 100 / fast
	default:
		pace := 1000 / threshold
		slow, fast := pace+90, pace+60
		switch effort {
		case KindRecovery:
			slow, fast = pace+105, pace+75
		case KindTempo:
			slow, fast = pace+5, pace-5
		case KindIntervals:
			slow, fast = pace-10, pace-20
		}
		return 1000 / slow, 1000 / fast
	}
}

// heartRateRange is the target share of the max heart rate for an effort.
func heartRateRange(effort string) (float64, float64) {
	switch effort {
	case KindTempo:
		return 0.8, 0.88
	case KindIntervals:
		return 0.88, 0.95
	}
	return 0.6, 0.75
}

func intensityLabel(activity, effort string) string {
	switch effort {
	case KindTempo:
		if activity == ActivityCycling {
			return "Z3"
		}
		return "tempo"
	case KindIntervals:
		if activity == ActivityCycling {
			return "Z4"
		}
		return "hard"
	}
	if activity == ActivityCycling {
		return "Z2"
	}
	return "easy"
}

// intervalStructure is the reps of an interval session: distance reps for
// runs and swims, timed reps for rides, fewer in the taper.
func intervalStructure(activity, phase string, distance float64) (reps int, repDistance, repDuration, recovery float64) {
	switch activity {
	case ActivityCycling:
		reps = clampInt(int(math.Round(distance/10000)), 3, 6)
		repDuration, recovery = 300, 180
	case ActivitySwimming:
		reps = clampInt(int(math.Round(distance*0.5/100)), 4, 20)
		repDistance, recovery = 100, 20
	default:
		// Longer sessions come with longer races.
		repDistance = 800
		if distance >= 12000 {
			repDistance = 1000
		}
		reps = clampInt(int(math.Round(distance*0.5/repDistance)), 3, 8)
		recovery = 120
	}
	if phase == PhaseTaper {
		reps = max(reps/2, 3)
	}
	return reps, repDistance, repDuration, recovery
}

func clampInt(n, low, high int) int { return min(max(n, low), high) }

// describeSession writes what to do, e.g. "Intervals 6×800 m @ 4:30–4:40/km,
// 2 min jog · 8 km in all".
func describeSession(s PlannedSession) string {
	noun := sports[s.Activity].noun
	distance := formatMetres(s.Activity, *s.TargetDistanceM)
	target := describeTarget(s)

	switch s.Kind {
	case KindIntervals:
		rep := fmt.Sprintf("%.0f m", deref(s.RepDistanceM))
		if s.RepDurationS != nil {
			rep = formatSeconds(*s.RepDurationS)
		}
		rest := "rest"
		if s.Activity != ActivitySwimming {
			rest = "easy"
			if s.Activity == ActivityRunning {
				rest = "jog"
			}
		}
		return fmt.Sprintf("Intervals %d×%s @ %s, %s %s · %s in all",
			*s.Reps, rep, target, formatSeconds(*s.RecoveryS), rest, distance)
	case KindTempo:
		return fmt.Sprintf("Tempo %s %s: the middle half @ %s", noun, distance, target)
	case KindBrick:
		return fmt.Sprintf("Brick %s %s straight off the bike · %s", noun, distance, target)
	case KindTechnique:
		return fmt.Sprintf("Technique swim %s · drills, %s", distance, target)
	}
	names := map[string]string{KindEasy: "Easy", KindLong: "Long", KindRecovery: "Recovery"}
	return fmt.Sprintf("%s %s %s · %s", names[s.Kind], noun, distance, target)
}

// describeTarget writes a session's intensity target: a pace or speed
// range, else a heart rate range, else how it should feel.
func describeTarget(s PlannedSession) string {
	if s.SpeedMin != nil && s.SpeedMax != nil {
		return formatSpeedRange(s.Activity, *s.SpeedMin, *s.SpeedMax)
	}
	if s.HRMin != nil && s.HRMax != nil {
		return fmt.Sprintf("%.0f–%.0f bpm", *s.HRMin, *s.HRMax)
	}
	switch s.Kind {
	case KindTempo, KindBrick:
		return "comfortably hard"
	case KindIntervals:
		return "hard"
	}
	return "conversational"
}

// formatSpeedRange writes a speed range as each sport is paced: km/h for
// rides, time per 100 m for swims and time per km otherwise, slowest first.
func formatSpeedRange(activity string, low, high float64) string {
	switch activity {
	case ActivityCycling:
		return fmt.Sprintf("%.0f–%.0f km/h", low*3.6, high*3.6)
	case ActivitySwimming:
		return fmt.Sprintf("%s–%s/100 m", formatClock(100/high), formatClock(100/low))
	}
	return fmt.Sprintf("%s–%s/km", formatClock(1000/high), formatClock(1000/low))
}

// formatSpeed writes one speed as formatSpeedRange does.
func formatSpeed(activity string, speed float64) string {
	switch activity {
	case ActivityCycling:
		return fmt.Sprintf("%.1f km/h", speed*3.6)
	case ActivitySwimming:
		return formatClock(100/speed) + "/100 m"
	}
	return formatClock(1000/speed) + "/km"
}

// formatClock writes seconds as m:ss.
func formatClock(seconds float64) string {
	s := int(math.Round(seconds))
	return fmt.Sprintf("%d:%02d", s/60, s%60)
}

// formatSeconds writes a short duration, e.g. "2 min" or "20 s".
func formatSeconds(seconds float64) string {
	if seconds >= 60 && math.Mod(seconds, 60) == 0 {
		return fmt.Sprintf("%.0f min", seconds/60)
	}
	return fmt.Sprintf("%.0f s", seconds)
}

// formatMetres writes a distance in metres for swims and km otherwise.
func formatMetres(activity string, metres float64) string {
	if activity == ActivitySwimming {
		return fmt.Sprintf("%.0f m", metres)
	}
	return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", metres/1000), "0"), ".") + " km"
}

func roundSpeed(speed float64) float64 { return math.Round(speed*1000) / 1000 }

func fp(v float64) *float64 { return &v }

func deref(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}
